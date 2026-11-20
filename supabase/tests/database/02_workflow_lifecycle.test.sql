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
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
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

select plan(33);

-- Full lifecycle from docs/issue-workflow.md §4:
-- citizen submits → secretary reviews/verifies → assigns Electrical → worker accepts,
-- starts, resolves with photo → citizen confirms → closed.
create temp table t (issue uuid);
grant all on t to authenticated;
insert into t select pg_temp.new_issue(pg_temp.u('15'));

select is(pg_temp.status((select issue from t)), 'SUBMITTED', 'new issue is SUBMITTED');
select matches((select issue_number from public.issues where id = (select issue from t)), '^RMP-20[0-9]{2}-[0-9]{5}$', 'issue number looks like RMP-YYYY-00001');
select is((select count(*)::int from public.issue_attachments where issue_id = (select issue from t) and kind = 'INITIAL_EVIDENCE'), 1, 'evidence photo registered');
select ok(exists (select 1 from public.notifications where issue_id = (select issue from t) and type = 'ISSUE_NEEDS_REVIEW'
                    and recipient_id = pg_temp.u('12')), 'secretary notified of new issue');

select pg_temp.login(pg_temp.u('12'));
select lives_ok($$ select public.start_review((select issue from t), pg_temp.ver((select issue from t))) $$, 'secretary starts review');
select lives_ok($$ select public.verify_issue((select issue from t), pg_temp.ver((select issue from t)), 'HIGH', 'Checked on site') $$, 'secretary verifies with HIGH priority');
select lives_ok($$ select public.assign_issue((select issue from t), pg_temp.ver((select issue from t)), pg_temp.dept_elec()) $$,
  'secretary assigns to Electrical department (no person)');
select pg_temp.logout();

select is(pg_temp.status((select issue from t)), 'ASSIGNED', 'issue is ASSIGNED');
select is((select priority::text from public.issues where id = (select issue from t)), 'HIGH', 'priority set during verify');
select ok(exists (select 1 from public.notifications where issue_id = (select issue from t) and type = 'WORK_ASSIGNED_TO_YOU'
                    and recipient_id = pg_temp.u('13')), 'department worker notified');
select ok(not exists (select 1 from public.notifications where issue_id = (select issue from t) and type = 'WORK_ASSIGNED_TO_YOU'
                    and recipient_id = pg_temp.u('14')), 'worker of other department not notified');

-- Worker of another department cannot act
select pg_temp.login(pg_temp.u('14'));
select throws_like($$ select public.accept_assignment((select issue from t)) $$, '%MV_FORBIDDEN%', 'sanitation worker cannot accept electrical work');

select pg_temp.login(pg_temp.u('13'));
select lives_ok($$ select public.accept_assignment((select issue from t)) $$, 'electrical worker accepts (claims) the work');
select lives_ok($$ select public.start_work((select issue from t), pg_temp.ver((select issue from t))) $$, 'worker starts work');
select throws_like($$ select public.resolve_issue((select issue from t), pg_temp.ver((select issue from t)), 'Done') $$,
  '%completion photo is required%', 'cannot resolve without a completion photo');
select pg_temp.logout();

create temp table ph as select pg_temp.photo(pg_temp.u('13')) as p;
grant all on ph to authenticated;
select pg_temp.login(pg_temp.u('13'));
select lives_ok($$ select public.resolve_issue((select issue from t), pg_temp.ver((select issue from t)), 'Replaced bulb', (select p from ph)) $$,
  'worker resolves with completion photo');
select pg_temp.logout();

select is((select assigned_user_id from public.issues where id = (select issue from t)), pg_temp.u('13'), 'claiming worker recorded as assignee');
select ok(exists (select 1 from public.notifications where issue_id = (select issue from t) and type = 'RESOLUTION_CONFIRM_REQUEST'
                    and recipient_id = pg_temp.u('15')), 'reporter asked to confirm');

-- Only the reporter can confirm
select pg_temp.login(pg_temp.u('16'));
select throws_like($$ select public.confirm_resolution((select issue from t), pg_temp.ver((select issue from t)), true) $$,
  '%MV_FORBIDDEN%', 'another citizen cannot confirm');

-- Reporter says NOT solved → REOPENED; worker restarts and resolves again; reporter says SOLVED → CLOSED
select pg_temp.login(pg_temp.u('15'));
select throws_like($$ select public.confirm_resolution((select issue from t), pg_temp.ver((select issue from t)), false, 'no') $$,
  '%reason must be%', 'reason required when not solved');
select lives_ok($$ select public.confirm_resolution((select issue from t), pg_temp.ver((select issue from t)), false, 'Light still off at night') $$,
  'reporter: NO, STILL NOT SOLVED');
select pg_temp.logout();
select is(pg_temp.status((select issue from t)), 'REOPENED', 'issue REOPENED');
select is((select reopen_count from public.issues where id = (select issue from t)), 1, 'reopen counted');

select pg_temp.login(pg_temp.u('13'));
select lives_ok($$ select public.start_work((select issue from t), pg_temp.ver((select issue from t))) $$, 'same worker restarts work');
select throws_like($$ select public.resolve_issue((select issue from t), pg_temp.ver((select issue from t)), 'Done again') $$,
  '%completion photo is required%', 'old completion photo does not count for the new cycle');
select pg_temp.logout();
truncate ph; insert into ph select pg_temp.photo(pg_temp.u('13'));
select pg_temp.login(pg_temp.u('13'));
select lives_ok($$ select public.resolve_issue((select issue from t), pg_temp.ver((select issue from t)), 'Replaced wiring', (select p from ph)) $$, 'resolved again');
select pg_temp.login(pg_temp.u('15'));
select lives_ok($$ select public.confirm_resolution((select issue from t), pg_temp.ver((select issue from t)), true) $$, 'reporter: YES, SOLVED');
select pg_temp.logout();

select is(pg_temp.status((select issue from t)), 'CLOSED', 'issue CLOSED');
select is(
  (select array_agg(coalesce(from_status::text, '-') || '>' || to_status::text order by id)
     from public.issue_status_history where issue_id = (select issue from t)),
  array['->SUBMITTED', 'SUBMITTED>UNDER_REVIEW', 'UNDER_REVIEW>VERIFIED', 'VERIFIED>ASSIGNED', 'ASSIGNED>IN_PROGRESS',
        'IN_PROGRESS>RESOLVED', 'RESOLVED>REOPENED', 'REOPENED>IN_PROGRESS', 'IN_PROGRESS>RESOLVED', 'RESOLVED>CLOSED'],
  'complete history reconstructs every transition in order');
select is(
  (select array_agg(actor_role_key order by id) from public.issue_status_history where issue_id = (select issue from t)),
  array['CITIZEN', 'SECRETARY', 'SECRETARY', 'SECRETARY', 'WORKER', 'WORKER', 'CITIZEN', 'WORKER', 'WORKER', 'CITIZEN'],
  'every history row records who acted, by role');
select is((select metadata ->> 'confirmation' from public.issue_status_history where issue_id = (select issue from t) order by id desc limit 1),
  'SOLVED', 'closing row records citizen confirmation');
select ok((select verified_at is not null and work_started_at is not null and resolved_at is not null and closed_at is not null
             from public.issues where id = (select issue from t)), 'lifecycle timestamps set');
select ok((select count(*) >= 5 from public.audit_logs where entity_type = 'issue' and entity_id = (select issue from t)::text),
  'staff workflow actions are in the audit log');

select * from finish();
rollback;
