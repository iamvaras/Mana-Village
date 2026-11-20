begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
-- Test helpers (temporary, per session). Seed users from supabase/seed/01_dev_seed.sql:
--   ...0001 super admin | ...0010 president RMP | ...0011 VP RMP | ...0012 secretary RMP
--   ...0013 worker RMP Electrical | ...0014 worker RMP Sanitation | ...0015 citizen Lakshmi RMP
--   ...0016 citizen Ravi RMP | ...0020 secretary KDP | ...0021 citizen KDP
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
-- Simulates a photo uploaded to Storage by p_uid (metadata only). Leaves you logged out.
create function pg_temp.photo(p_uid uuid) returns jsonb language plpgsql as $$
declare v_id uuid := gen_random_uuid(); v_name text := p_uid || '/' || v_id || '.jpg';
begin
  execute 'reset role';
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('issue-attachments', v_name, p_uid::text, '{"mimetype": "image/jpeg", "size": 150000}');
  return jsonb_build_array(jsonb_build_object('id', v_id, 'path', v_name));
end $$;
create function pg_temp.u(p_n text) returns uuid language sql immutable as $$
  select ('b0000000-0000-4000-8000-0000000000' || p_n)::uuid $$;
create function pg_temp.village_rmp() returns uuid language sql immutable as $$ select 'a0000000-0000-4000-8000-000000000001'::uuid $$;
create function pg_temp.village_kdp() returns uuid language sql immutable as $$ select 'a0000000-0000-4000-8000-000000000002'::uuid $$;
create function pg_temp.dept_elec() returns uuid language sql immutable as $$ select 'd0000000-0000-4000-8000-000000000001'::uuid $$;
create function pg_temp.dept_san() returns uuid language sql immutable as $$ select 'd0000000-0000-4000-8000-000000000002'::uuid $$;
create function pg_temp.cat(p_key text) returns uuid language sql stable as $$ select id from public.issue_categories where key = p_key $$;
create function pg_temp.ver(p_issue uuid) returns int language sql stable security definer as $$ select version from public.issues where id = p_issue $$;
create function pg_temp.status(p_issue uuid) returns text language sql stable security definer as $$ select status::text from public.issues where id = p_issue $$;
-- Creates a STREET_LIGHT issue as the given citizen and returns its id (logged out afterwards).
create function pg_temp.new_issue(p_uid uuid, p_title text default 'Street light not working near school') returns uuid language plpgsql as $$
declare v_photos jsonb := pg_temp.photo(p_uid); v_res jsonb;
begin
  perform pg_temp.login(p_uid);
  v_res := public.create_issue(pg_temp.village_rmp(), pg_temp.cat('STREET_LIGHT'), p_title, gen_random_uuid(),
     'Pole 12 light is off for a week', 'Near ZP High School gate', 16.5063, 80.6481, 8, null, v_photos, 'MOBILE');
  perform pg_temp.logout();
  return (v_res ->> 'id')::uuid;
end $$;

select plan(16);

-- Exit criterion for Phase 5: the timeline reconstructs a sample sequence.
create temp table t (issue uuid);
grant all on t to authenticated;
insert into t select pg_temp.new_issue(pg_temp.u('15'));

-- Ravi supports it (so he follows it)
select pg_temp.login(pg_temp.u('16'));
select public.support_issue((select issue from t));

select pg_temp.login(pg_temp.u('12'));
select public.start_review((select issue from t), pg_temp.ver((select issue from t)));
select public.add_comment((select issue from t), 'Checked with the lineman, pole 12 needs a new bulb', 'INTERNAL');
select public.verify_issue((select issue from t), pg_temp.ver((select issue from t)), 'HIGH', 'Confirmed on site');
select public.assign_issue((select issue from t), pg_temp.ver((select issue from t)), pg_temp.dept_elec());
select public.add_comment((select issue from t), 'Electrical team will fix this by Friday', 'PUBLIC');

select pg_temp.login(pg_temp.u('13'));
select public.accept_assignment((select issue from t));
select public.start_work((select issue from t), pg_temp.ver((select issue from t)));
select public.add_progress_update((select issue from t), 'New bulb ordered');
select pg_temp.logout();

-- What the reporter sees, in order
select pg_temp.login(pg_temp.u('15'));
select is(
  (select array_agg(event_type || coalesce(':' || to_status::text, '') order by occurred_at, source_id)
     from public.issue_timeline_view where issue_id = (select issue from t)),
  -- Evidence photos are registered just before the SUBMITTED row (same request);
  -- the apps fold them into the "reported" event (packages/core timeline).
  array['ATTACHMENT_ADDED', 'STATUS_CHANGED:SUBMITTED', 'STATUS_CHANGED:UNDER_REVIEW', 'STATUS_CHANGED:VERIFIED',
        'STATUS_CHANGED:ASSIGNED', 'COMMENT_ADDED', 'ASSIGNMENT_ACCEPTED', 'STATUS_CHANGED:IN_PROGRESS', 'COMMENT_ADDED'],
  'reporter timeline reconstructs the sequence in order, without the internal note');
select is((select count(*)::int from public.issue_timeline_view where issue_id = (select issue from t) and visibility = 'INTERNAL'), 0,
  'reporter never sees internal events');
select is((select count(*)::int from public.issue_comments_view where issue_id = (select issue from t)), 2,
  'reporter sees the two public comments only');
select is((select actor_name from public.issue_timeline_view
            where issue_id = (select issue from t) and to_status = 'VERIFIED'), 'Kiran',
  'staff actors are named on the timeline');
select is((select actor_role_key from public.issue_timeline_view
            where issue_id = (select issue from t) and event_type = 'ASSIGNMENT_ACCEPTED'), 'WORKER',
  'worker acceptance is labelled with the role');
select ok((select bool_and(is_mine) from public.issue_timeline_view
            where issue_id = (select issue from t) and to_status = 'SUBMITTED'), 'reporter sees their own submission as theirs');

-- Staff see the internal note in the timeline too
select pg_temp.login(pg_temp.u('12'));
select is((select count(*)::int from public.issue_timeline_view where issue_id = (select issue from t)), 10,
  'staff timeline also includes the internal note');

-- Another citizen (supporter) sees the same public sequence, but the reporter stays anonymous
select pg_temp.login(pg_temp.u('16'));
select is((select count(*)::int from public.issue_timeline_view where issue_id = (select issue from t)), 9,
  'supporter sees the public timeline');
select is((select actor_name from public.issue_timeline_view where issue_id = (select issue from t) and to_status = 'SUBMITTED'), null,
  'reporter is not named to other residents');
select pg_temp.logout();

-- Comment notifications
select is((select count(*)::int from public.notifications
            where issue_id = (select issue from t) and type = 'NEW_COMMENT' and recipient_id = pg_temp.u('15')), 2,
  'reporter notified of the public comment and the progress note');
select is((select count(*)::int from public.notifications
            where issue_id = (select issue from t) and type = 'NEW_COMMENT' and recipient_id = pg_temp.u('16')), 2,
  'supporter notified too');
select is((select count(*)::int from public.notifications
            where issue_id = (select issue from t) and type = 'NEW_COMMENT' and recipient_id = pg_temp.u('13')), 0,
  'worker is not notified about their own progress note (and was not yet assigned for the earlier ones)');
select is((select count(*)::int from public.notifications
            where issue_id = (select issue from t) and type = 'NEW_COMMENT' and recipient_id = pg_temp.u('12')), 0,
  'author of a comment is not notified about it');
select is((select title from public.notifications
            where issue_id = (select issue from t) and type = 'NEW_COMMENT' and recipient_id = pg_temp.u('15') limit 1), 'కొత్త వ్యాఖ్య',
  'notification title is in the recipient''s language');

-- A citizen comment notifies the assigned worker
select pg_temp.login(pg_temp.u('15'));
select public.add_comment((select issue from t), 'Thank you, waiting for it', 'PUBLIC');
select pg_temp.logout();
select is((select count(*)::int from public.notifications
            where issue_id = (select issue from t) and type = 'NEW_COMMENT' and recipient_id = pg_temp.u('13')), 1,
  'assigned worker notified of a resident''s comment');

-- Notifications are private to their recipient
select pg_temp.login(pg_temp.u('16'));
select is((select count(*)::int from public.notifications where recipient_id <> pg_temp.u('16')), 0,
  'a resident can only read their own notifications');
select pg_temp.logout();

select * from finish();
rollback;
