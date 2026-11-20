begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
-- Phase 8: workers see only their assigned work (exit criterion), and the
-- accept / decline / start / progress / resolve steps behave as the Work tab expects.
-- Sample issues come from supabase/seed/02_sample_issues.sql.
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
create function pg_temp.photo(p_uid uuid) returns jsonb language plpgsql as $$
declare v_id uuid := gen_random_uuid(); v_name text := p_uid || '/' || v_id || '.jpg';
begin
  execute 'reset role';
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('issue-attachments', v_name, p_uid::text, '{"mimetype": "image/jpeg", "size": 120000}');
  return jsonb_build_array(jsonb_build_object('id', v_id, 'path', v_name));
end $$;

select plan(22);

-- Work lists: only own work, nothing for citizens
select pg_temp.login(pg_temp.u('13'));
select is((select array_agg(issue_number order by issue_number) from public.list_my_work()),
  array['RMP-' || extract(year from now())::int || '-00005', 'RMP-' || extract(year from now())::int || '-00006'],
  'Electrical worker lists only their two assigned issues');
select pg_temp.login(pg_temp.u('14'));
select is((select count(*)::int from public.list_my_work()), 3, 'Sanitation worker lists their three');
select pg_temp.login(pg_temp.u('15'));
select is((select count(*)::int from public.list_my_work()), 0, 'citizen has no work list');

-- A private issue that is not theirs stays hidden from a worker
select pg_temp.login(pg_temp.u('12'));
select public.set_issue_visibility(pg_temp.n('00003'), pg_temp.ver(pg_temp.n('00003')), 'PRIVATE');
select pg_temp.login(pg_temp.u('14'));
select is((select count(*)::int from public.issues_view where id = pg_temp.n('00003')), 0,
  'worker cannot see a private issue that is not assigned to them');

-- Department-level assignment: every worker of that department sees it, others do not
select pg_temp.login(pg_temp.u('12'));
select public.assign_issue(pg_temp.n('00004'), pg_temp.ver(pg_temp.n('00004')), 'd0000000-0000-4000-8000-000000000001');
select pg_temp.login(pg_temp.u('13'));
select is((select assigned_to_me from public.list_my_work() where issue_id = pg_temp.n('00004')), false,
  'department-level work shows for the department worker, not yet claimed');
select pg_temp.login(pg_temp.u('14'));
select is((select count(*)::int from public.list_my_work() where issue_id = pg_temp.n('00004')), 0,
  'worker of another department does not see it');
select throws_like(format('select public.accept_assignment(%L)', pg_temp.n('00004')), '%MV_FORBIDDEN%',
  'and cannot accept it');

-- Accept claims it
select pg_temp.login(pg_temp.u('13'));
select lives_ok(format('select public.accept_assignment(%L)', pg_temp.n('00004')), 'worker accepts');
select is((select array[assigned_to_me::text, assignment_status::text] from public.list_my_work() where issue_id = pg_temp.n('00004')),
  array['true', 'ACCEPTED'], 'accepting claims the work');
select throws_like(format('select public.accept_assignment(%L)', pg_temp.n('00004')), '%already answered%',
  'accepting twice is refused');
select throws_like(format('select public.decline_assignment(%L, %s, %L)', pg_temp.n('00004'), pg_temp.ver(pg_temp.n('00004')), 'Too far away from my area'),
  '%cannot be declined%', 'accepted work cannot be declined');

-- Progress only while in progress
select throws_like(format('select public.add_progress_update(%L, %L)', pg_temp.n('00004'), 'Ordered the parts'),
  '%only be added while work is in progress%', 'no progress update before starting');
select lives_ok(format('select public.start_work(%L, %s)', pg_temp.n('00004'), pg_temp.ver(pg_temp.n('00004'))), 'worker starts');
select is(pg_temp.status(pg_temp.n('00004')), 'IN_PROGRESS', 'issue is in progress');
select lives_ok(format('select public.add_progress_update(%L, %L)', pg_temp.n('00004'), 'Ordered the parts'), 'progress note posted');
select pg_temp.logout();
select is((select visibility::text from public.issue_comments where issue_id = pg_temp.n('00004') and body = 'Ordered the parts'),
  'PUBLIC', 'progress notes are public so the resident sees them');
select pg_temp.login(pg_temp.u('14'));
select throws_like(format('select public.add_progress_update(%L, %L)', pg_temp.n('00004'), 'Not mine'), '%MV_FORBIDDEN%',
  'another worker cannot post progress');

-- Resolve needs a completion photo
select pg_temp.login(pg_temp.u('13'));
select throws_like(format('select public.resolve_issue(%L, %s, %L)', pg_temp.n('00004'), pg_temp.ver(pg_temp.n('00004')), 'Done'),
  '%completion photo is required%', 'cannot resolve without a completion photo');
create temp table ph as select pg_temp.photo(pg_temp.u('13')) as p;
grant select on ph to authenticated;
select pg_temp.login(pg_temp.u('13'));
select lives_ok(format('select public.resolve_issue(%L, %s, %L, %L::jsonb)', pg_temp.n('00004'), pg_temp.ver(pg_temp.n('00004')), 'Tank valve replaced', (select p from ph)),
  'worker resolves with a completion photo');
select pg_temp.logout();
select ok(exists (select 1 from public.notifications where issue_id = pg_temp.n('00004') and type = 'RESOLUTION_CONFIRM_REQUEST'
                    and recipient_id = pg_temp.u('18')), 'reporter is asked to confirm');

-- Decline sends the work back for reassignment
select pg_temp.login(pg_temp.u('13'));
select lives_ok(format('select public.decline_assignment(%L, %s, %L)', pg_temp.n('00005'), pg_temp.ver(pg_temp.n('00005')), 'Needs a lineman with a ladder truck'),
  'worker declines pending work with a reason');
select pg_temp.logout();
select is(array[pg_temp.status(pg_temp.n('00005')),
                (select count(*)::text from public.notifications where issue_id = pg_temp.n('00005') and type = 'ASSIGNMENT_DECLINED' and recipient_id = pg_temp.u('12'))],
  array['VERIFIED', '1'], 'declined work goes back to verified and the secretary is told');

select * from finish();
rollback;
