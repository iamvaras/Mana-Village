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

select plan(9);

-- Every table in public has RLS enabled.
select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  null, 'RLS enabled on every public table');

-- anon has no privileges on any public table or view.
select is(
  (select count(*)::int from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'),
  0, 'anon has no table privileges');

-- authenticated cannot read or write permanent/issue tables directly.
select ok(not has_table_privilege('authenticated', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE'), 'no direct access to ' || t)
from unnest(array['issues', 'issue_status_history', 'issue_comments', 'issue_attachments', 'issue_supporters', 'users']) t;

-- Every SECURITY DEFINER function pins search_path.
select is(
  (select array_agg(n.nspname || '.' || p.proname order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  null, 'all SECURITY DEFINER functions set search_path');

select * from finish();
rollback;
