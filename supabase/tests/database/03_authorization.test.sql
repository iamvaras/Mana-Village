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

select plan(20);

create temp table t (issue uuid);
grant all on t to authenticated;
insert into t select pg_temp.new_issue(pg_temp.u('15'));

-- History and audit are permanent, even for the database owner.
select throws_like($$ update public.issue_status_history set reason = 'x' where issue_id = (select issue from t) $$,
  '%MV_FORBIDDEN%', 'history rows cannot be updated');
select throws_like($$ delete from public.issue_status_history where issue_id = (select issue from t) $$,
  '%MV_FORBIDDEN%', 'history rows cannot be deleted');
select throws_like($$ delete from public.audit_logs $$, '%MV_FORBIDDEN%', 'audit rows cannot be deleted');
select throws_like($$ delete from public.issues where id = (select issue from t) $$, '%MV_FORBIDDEN%', 'issues cannot be deleted');
select throws_like($$ update public.issues set status = 'CLOSED' where id = (select issue from t) $$,
  '%MV_FORBIDDEN%', 'status cannot be changed outside workflow functions (even as owner)');

-- Citizen cannot touch the issue table directly.
select pg_temp.login(pg_temp.u('15'));
select throws_like($$ update public.issues set status = 'CLOSED' where id = (select issue from t) $$,
  '%permission denied%', 'citizen cannot update issues directly');
select throws_like($$ select public.start_review((select issue from t), 1) $$, '%MV_FORBIDDEN%', 'citizen cannot start review');
select throws_like($$ select public.reject_issue((select issue from t), 1, 'I changed my mind about it') $$, '%MV_FORBIDDEN%', 'citizen cannot reject');

-- Worker cannot do admin actions.
select pg_temp.login(pg_temp.u('13'));
select throws_like($$ select public.start_review((select issue from t), 1) $$, '%MV_FORBIDDEN%', 'worker cannot review');
select throws_like($$ select public.assign_issue((select issue from t), 1, pg_temp.dept_elec()) $$, '%MV_FORBIDDEN%', 'worker cannot assign');

-- Admin of another village has no rights here.
select pg_temp.login(pg_temp.u('20'));
select throws_like($$ select public.start_review((select issue from t), 1) $$, '%MV_FORBIDDEN%', 'other-village secretary cannot act');

-- Super Admin is read-only on the workflow.
select pg_temp.login(pg_temp.u('01'));
select throws_like($$ select public.start_review((select issue from t), 1) $$, '%MV_FORBIDDEN%', 'super admin cannot run workflow');

-- Invalid transitions and stale versions.
select pg_temp.login(pg_temp.u('12'));
select throws_like($$ select public.verify_issue((select issue from t), 1) $$, '%MV_INVALID_TRANSITION%', 'cannot verify before review');
select throws_like($$ select public.start_review((select issue from t), 99) $$, '%MV_CONFLICT%', 'stale version is rejected');
select lives_ok($$ select public.start_review((select issue from t), 1) $$, 'review with correct version');
select throws_like($$ select public.resolve_issue((select issue from t), 2) $$, '%MV_%', 'cannot resolve an issue under review');
select throws_like($$ select public.reject_issue((select issue from t), 2, 'short') $$, '%reason must be%', 'reject needs a real reason');

-- Conflict of interest: staff cannot verify their own report.
select pg_temp.logout();
truncate t; insert into t select pg_temp.new_issue(pg_temp.u('12'), 'Drain blocked behind panchayat office');
select pg_temp.login(pg_temp.u('10'));
select lives_ok($$ select public.start_review((select issue from t), 1) $$, 'president reviews secretary''s report');
select pg_temp.login(pg_temp.u('12'));
select throws_like($$ select public.verify_issue((select issue from t), 2) $$, '%issue you reported%', 'secretary cannot verify own report');

-- Suspended users lose all rights immediately.
select pg_temp.logout();
update public.users set status = 'SUSPENDED' where id = pg_temp.u('10');
select pg_temp.login(pg_temp.u('10'));
select throws_like($$ select public.verify_issue((select issue from t), 2) $$, '%MV_FORBIDDEN%', 'suspended president cannot act');

select * from finish();
rollback;
