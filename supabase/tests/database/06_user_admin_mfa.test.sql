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

-- Login without second factor (OTP only).
create function pg_temp.login_aal1(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
end $$;

select plan(16);

-- MFA: secretary without the security code only has citizen powers.
select pg_temp.login_aal1(pg_temp.u('12'));
select ok(not ('issue.review' = any (public.get_my_permissions(pg_temp.village_rmp()))), 'secretary without MFA has no review permission');
select ok('issue.create' = any (public.get_my_permissions(pg_temp.village_rmp())), 'secretary without MFA still has citizen permissions');
select is((select active_now from public.get_my_roles() where role_key = 'SECRETARY'), false, 'get_my_roles reports SECRETARY inactive until MFA');
select pg_temp.login(pg_temp.u('12'));
select ok('issue.review' = any (public.get_my_permissions(pg_temp.village_rmp())), 'secretary with MFA has review permission');

-- Workers do not need MFA (they use the mobile app).
select pg_temp.login_aal1(pg_temp.u('13'));
select ok('issue.work' = any (public.get_my_permissions(pg_temp.village_rmp())), 'worker permissions work without MFA');

-- Role administration.
create temp table g (id uuid);
grant all on g to authenticated;
select pg_temp.login(pg_temp.u('12'));
select lives_ok($$ insert into g select public.grant_role(pg_temp.u('16'), 'WORKER', pg_temp.village_rmp(), pg_temp.dept_san(), 'Joined sanitation team') $$,
  'secretary grants WORKER');
select throws_like($$ select public.grant_role(pg_temp.u('16'), 'PRESIDENT', pg_temp.village_rmp()) $$, '%MV_FORBIDDEN%',
  'secretary cannot grant PRESIDENT');
select throws_like($$ select public.grant_role(pg_temp.u('21'), 'WORKER', pg_temp.village_kdp(), 'd0000000-0000-4000-8000-000000000003') $$,
  '%MV_FORBIDDEN%', 'secretary cannot grant roles in another village');
select throws_like($$ select public.grant_role(pg_temp.u('12'), 'WORKER', pg_temp.village_rmp(), pg_temp.dept_san()) $$,
  '%MV_FORBIDDEN%', 'nobody changes their own roles');
select lives_ok($$ select public.revoke_role((select id from g), 'Moved to another job') $$, 'secretary revokes WORKER');
select pg_temp.logout();
select ok((select revoked_at is not null from public.user_roles where id = (select id from g)), 'revoked grant is kept with revoked_at');

select pg_temp.login(pg_temp.u('01'));
select lives_ok($$ select public.grant_role(pg_temp.u('16'), 'VICE_PRESIDENT', pg_temp.village_rmp(), null, 'Elected') $$,
  'super admin grants VICE_PRESIDENT');

-- Suspension and contact reveal.
select pg_temp.login(pg_temp.u('12'));
select lives_ok($$ select public.set_user_status(pg_temp.u('15'), 'SUSPENDED', 'Spam reports') $$, 'secretary suspends a citizen');
select is(public.admin_get_user_contact(pg_temp.u('16')), '919000000016', 'secretary can reveal a phone number');
select pg_temp.logout();
select ok(exists (select 1 from public.audit_logs where action = 'user.contact_viewed' and entity_id = pg_temp.u('16')::text
                    and actor_user_id = pg_temp.u('12')), 'phone reveal is audited');
select pg_temp.login(pg_temp.u('13'));
select throws_like($$ select public.admin_get_user_contact(pg_temp.u('16')) $$, '%MV_FORBIDDEN%', 'workers cannot reveal phone numbers');

select * from finish();
rollback;
