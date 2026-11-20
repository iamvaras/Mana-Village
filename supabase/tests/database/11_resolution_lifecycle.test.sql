begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
-- Phase 9 exit criterion: the full life of an issue, including reopening, end to end.
-- One new issue goes: reported -> reviewed -> verified -> assigned -> started -> solved
-- -> resident says NOT solved (reopened) -> restarted -> solved -> reminder (day 3)
-- -> auto-closed (day 7) -> reopened by the secretary -> assigned again -> solved
-- -> resident says solved (closed). Plus: staff closing without the resident.
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.u(p_n text) returns uuid language sql immutable as $$
  select ('b0000000-0000-4000-8000-0000000000' || p_n)::uuid $$;
create function pg_temp.n(p_num text) returns uuid language sql stable security definer as $$
  select id from public.issues where issue_number = 'RMP-' || extract(year from now())::int || '-' || p_num $$;
create function pg_temp.ver(p_issue uuid) returns int language sql stable security definer as $$
  select version from public.issues where id = p_issue $$;
create function pg_temp.status(p_issue uuid) returns text language sql stable security definer as $$
  select status::text from public.issues where id = p_issue $$;
create function pg_temp.notes(p_issue uuid, p_type text, p_uid uuid) returns int language sql stable security definer as $$
  select count(*)::int from public.notifications where issue_id = p_issue and type = p_type and recipient_id = p_uid $$;
-- Photo metadata as if p_uid had uploaded it (no file behind it locally).
create function pg_temp.photo(p_uid uuid) returns jsonb language plpgsql as $$
declare v_id uuid := gen_random_uuid(); v_name text := p_uid || '/' || v_id || '.jpg';
begin
  execute 'reset role';
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('issue-attachments', v_name, p_uid::text, '{"mimetype": "image/jpeg", "size": 120000}');
  return jsonb_build_array(jsonb_build_object('id', v_id, 'path', v_name));
end $$;
-- Moves the last status change back in time, as if days had passed.
create function pg_temp.age(p_issue uuid, p_days int) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('mana.workflow', 'on', true);
  update public.issues set last_status_change_at = now() - make_interval(days => p_days) where id = p_issue;
  perform set_config('mana.workflow', 'off', true);
end $$;
-- Worker 14 (Sanitation) starts and solves the work with a fresh completion photo.
create function pg_temp.solve(p_issue uuid, p_note text) returns void language plpgsql as $$
declare v_photo jsonb;
begin
  perform pg_temp.login(pg_temp.u('14'));
  perform public.start_work(p_issue, pg_temp.ver(p_issue));
  v_photo := pg_temp.photo(pg_temp.u('14'));
  perform pg_temp.login(pg_temp.u('14'));
  perform public.resolve_issue(p_issue, pg_temp.ver(p_issue), p_note, v_photo);
end $$;

create temp table t (id uuid);
grant select, insert on t to authenticated;

select plan(30);

-- Reported by Ravi (16), supported by Lakshmi (15), verified and assigned to Suresh (14).
select pg_temp.photo(pg_temp.u('16')) as p \gset
select pg_temp.login(pg_temp.u('16'));
insert into t select (public.create_issue('a0000000-0000-4000-8000-000000000001',
  (select id from public.issue_categories where key = 'GARBAGE'), 'Garbage dumped near school gate',
  gen_random_uuid(), 'Pile is growing every day', 'School gate', 16.5063, 80.6481, 10, null,
  :'p'::jsonb, 'MOBILE') ->> 'id')::uuid;
select pg_temp.login(pg_temp.u('15'));
select public.support_issue((select id from t));
select pg_temp.login(pg_temp.u('12'));
select public.start_review((select id from t), pg_temp.ver((select id from t)));
select public.verify_issue((select id from t), pg_temp.ver((select id from t)), 'HIGH', null);
select public.assign_issue((select id from t), pg_temp.ver((select id from t)),
  'd0000000-0000-4000-8000-000000000002', pg_temp.u('14'));
select pg_temp.login(pg_temp.u('14'));
select public.accept_assignment((select id from t));
select pg_temp.solve((select id from t), 'Cleared the pile');
select is(pg_temp.status((select id from t)), 'RESOLVED', 'worker marks it solved');
select is(pg_temp.notes((select id from t), 'RESOLUTION_CONFIRM_REQUEST', pg_temp.u('16')), 1,
  'the reporter is asked "Was it fixed?"');

-- Only the reporter answers
select pg_temp.login(pg_temp.u('15'));
select throws_like(format('select public.confirm_resolution(%L, %s, true)', (select id from t), pg_temp.ver((select id from t))),
  '%MV_FORBIDDEN%', 'a supporter cannot confirm');
select pg_temp.login(pg_temp.u('14'));
select throws_like(format('select public.confirm_resolution(%L, %s, true)', (select id from t), pg_temp.ver((select id from t))),
  '%MV_FORBIDDEN%', 'the worker cannot confirm their own work');
select pg_temp.login(pg_temp.u('16'));
select throws_like(format('select public.confirm_resolution(%L, %s, false)', (select id from t), pg_temp.ver((select id from t))),
  '%MV_VALIDATION%', '"not solved" needs a reason');
select throws_like(format('select public.confirm_resolution(%L, %s, true)', (select id from t), pg_temp.ver((select id from t)) - 1),
  '%MV_CONFLICT%', 'an old version is refused');

-- Resident: not solved -> reopened, same worker told and can restart
select pg_temp.photo(pg_temp.u('16')) as p2 \gset
select pg_temp.login(pg_temp.u('16'));
select lives_ok(format('select public.confirm_resolution(%L, %s, false, %L, %L::jsonb)', (select id from t),
  pg_temp.ver((select id from t)), 'Half of it is still there behind the wall', :'p2'),
  'reporter says it is not solved, with a photo');
select pg_temp.logout();
select is(array[pg_temp.status((select id from t)), (select reopen_count::text from public.issues where id = (select id from t))],
  array['REOPENED', '1'], 'issue is reopened and counted');
select is(array[pg_temp.notes((select id from t), 'ISSUE_REOPENED', pg_temp.u('14')),
                pg_temp.notes((select id from t), 'ISSUE_REOPENED', pg_temp.u('12'))],
  array[1, 1], 'the worker and the secretary are told');
select is((select metadata ->> 'confirmation' from public.issue_status_history
            where issue_id = (select id from t) order by id desc limit 1), 'NOT_SOLVED',
  'history records the resident''s answer');
select pg_temp.login(pg_temp.u('14'));
select is((select status::text from public.list_my_work() where issue_id = (select id from t)), 'REOPENED',
  'the reopened work is back in the worker''s list');
select pg_temp.login(pg_temp.u('16'));
select throws_like(format('select public.confirm_resolution(%L, %s, true)', (select id from t), pg_temp.ver((select id from t))),
  '%MV_INVALID_TRANSITION%', 'nothing to confirm while it is reopened');

-- Restart and solve again; reminder on day 3, only once
select pg_temp.solve((select id from t), 'Cleared behind the wall too');
select pg_temp.logout();
select private.send_resolution_reminders();
select is(pg_temp.notes((select id from t), 'RESOLUTION_REMINDER', pg_temp.u('16')), 0, 'no reminder before 3 days');
select pg_temp.age((select id from t), 4);
select private.send_resolution_reminders();
select private.send_resolution_reminders();
select is(pg_temp.notes((select id from t), 'RESOLUTION_REMINDER', pg_temp.u('16')), 1,
  'one reminder after 3 days, not repeated');

-- Auto-close on day 7, recorded as SYSTEM
select private.auto_close_resolved();
select is(pg_temp.status((select id from t)), 'RESOLVED', 'not closed before 7 days');
select pg_temp.age((select id from t), 8);
select private.auto_close_resolved();
select is(pg_temp.status((select id from t)), 'CLOSED', 'closed automatically after 7 days');
select is((select array[coalesce(actor_user_id::text, 'none'), actor_role_key, source::text, metadata ->> 'auto_closed']
             from public.issue_status_history where issue_id = (select id from t) order by id desc limit 1),
  array['none', 'SYSTEM', 'SYSTEM', 'true'], 'auto-close has no person as actor');
select is((select status::text from public.issue_assignments where issue_id = (select id from t) and ended_at is not null
            order by ended_at desc limit 1), 'COMPLETED', 'the assignment is completed');
select is(array[pg_temp.notes((select id from t), 'ISSUE_CLOSED', pg_temp.u('16')),
                pg_temp.notes((select id from t), 'ISSUE_CLOSED', pg_temp.u('15'))],
  array[1, 1], 'reporter and supporter are told it is closed');

-- Only staff reopen a closed issue, with a reason
select pg_temp.login(pg_temp.u('16'));
select throws_like(format('select public.reopen_issue(%L, %s, %L)', (select id from t), pg_temp.ver((select id from t)), 'It came back again today'),
  '%MV_FORBIDDEN%', 'a resident cannot reopen a closed issue');
select pg_temp.login(pg_temp.u('12'));
select throws_like(format('select public.reopen_issue(%L, %s, %L)', (select id from t), pg_temp.ver((select id from t)), 'short'),
  '%MV_VALIDATION%', 'reopening needs a proper reason');
select lives_ok(format('select public.reopen_issue(%L, %s, %L)', (select id from t), pg_temp.ver((select id from t)), 'Residents report the pile is back'),
  'secretary reopens the closed issue');
select pg_temp.login(pg_temp.u('14'));
select is((select count(*)::int from public.list_my_work() where issue_id = (select id from t)), 0,
  'closed work is not handed back to the worker by itself');

-- Assign again, solve, resident confirms -> closed
select pg_temp.login(pg_temp.u('12'));
select lives_ok(format('select public.assign_issue(%L, %s, %L, %L)', (select id from t), pg_temp.ver((select id from t)),
  'd0000000-0000-4000-8000-000000000002', pg_temp.u('14')), 'secretary assigns the reopened issue again');
select pg_temp.solve((select id from t), 'Cleared and put up a no-dumping board');
select pg_temp.login(pg_temp.u('16'));
select lives_ok(format('select public.confirm_resolution(%L, %s, true)', (select id from t), pg_temp.ver((select id from t))),
  'reporter confirms it is solved');
select pg_temp.logout();
select is((select array[to_status::text, actor_role_key, metadata ->> 'confirmation'] from public.issue_status_history
            where issue_id = (select id from t) order by id desc limit 1),
  array['CLOSED', 'CITIZEN', 'SOLVED'], 'closed by the resident''s answer');

-- Every status change left exactly one history row, in order
select is((select array_agg(to_status::text order by id) from public.issue_status_history where issue_id = (select id from t)),
  array['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'REOPENED', 'IN_PROGRESS',
        'RESOLVED', 'CLOSED', 'REOPENED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  'the full history is recorded');

-- Staff close without the resident (seed issue 00008 is waiting for its resident)
select pg_temp.login(pg_temp.u('12'));
select throws_like(format('select public.close_issue(%L, %s, %L)', pg_temp.n('00008'), pg_temp.ver(pg_temp.n('00008')), ''),
  '%MV_VALIDATION%', 'closing without the resident needs a reason');
select lives_ok(format('select public.close_issue(%L, %s, %L)', pg_temp.n('00008'), pg_temp.ver(pg_temp.n('00008')), 'Resident confirmed by phone call'),
  'secretary closes it with a reason');
select pg_temp.logout();
select is((select metadata ->> 'closed_without_citizen' from public.issue_status_history
            where issue_id = pg_temp.n('00008') order by id desc limit 1), 'true',
  'history shows it was closed without the resident');

select * from finish();
rollback;
