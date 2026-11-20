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

select plan(14);

-- Idempotent creation and numbering.
create temp table r (res jsonb, n int);
grant all on r to authenticated;
select pg_temp.login(pg_temp.u('16'));
insert into r select public.create_issue(pg_temp.village_rmp(), pg_temp.cat('OTHER'), 'Bus stop shelter broken',
  'c0000000-0000-4000-8000-000000000001', null, 'Main road bus stop'), 1;
insert into r select public.create_issue(pg_temp.village_rmp(), pg_temp.cat('OTHER'), 'Bus stop shelter broken',
  'c0000000-0000-4000-8000-000000000001', null, 'Main road bus stop'), 2;
select is((select res ->> 'id' from r where n = 1), (select res ->> 'id' from r where n = 2), 'retry with same request id returns the same issue');
select is((select res ->> 'created' from r where n = 2), 'false', 'retry does not create a second issue');
select throws_like($$ select public.create_issue(pg_temp.village_rmp(), pg_temp.cat('ROAD'), 'Pothole on main road', gen_random_uuid(), null, 'Main road') $$,
  '%at least one photo%', 'photo required for ROAD');
select throws_like($$ select public.create_issue(pg_temp.village_rmp(), pg_temp.cat('OTHER'), 'Something', gen_random_uuid()) $$,
  '%location or landmark%', 'location or landmark required');
select throws_like($$ select public.create_issue(pg_temp.village_kdp(), pg_temp.cat('OTHER'), 'Wrong village issue', gen_random_uuid(), null, 'Somewhere') $$,
  '%MV_FORBIDDEN%', 'cannot report in a village you do not belong to');
select pg_temp.logout();

-- Photos must really be uploaded by the caller.
select pg_temp.login(pg_temp.u('16'));
select throws_like($$ select public.create_issue(pg_temp.village_rmp(), pg_temp.cat('ROAD'), 'Pothole on main road', gen_random_uuid(), null, 'Main road', null, null, null, null,
  jsonb_build_array(jsonb_build_object('id', 'c0000000-0000-4000-8000-0000000000aa', 'path', pg_temp.u('16') || '/c0000000-0000-4000-8000-0000000000aa.jpg'))) $$,
  '%photo not uploaded%', 'unknown photo is rejected');
select pg_temp.logout();

-- Supporters and duplicates.
create temp table t (a uuid, b uuid);
grant all on t to authenticated;
insert into t values (pg_temp.new_issue(pg_temp.u('15')), pg_temp.new_issue(pg_temp.u('16'), 'Street light off near school again'));

select pg_temp.login(pg_temp.u('16'));
select is((select count(*)::int from public.find_similar_issues(pg_temp.village_rmp(), pg_temp.cat('STREET_LIGHT'), 16.5063, 80.6481)
           where id = (select a from t)), 1, 'similar nearby issue is suggested');
select is(public.support_issue((select a from t)), 1, '"I''m affected too" increments supporter count');
select is(public.support_issue((select a from t)), 1, 'supporting twice is harmless');
select pg_temp.login(pg_temp.u('15'));
select throws_like($$ select public.support_issue((select a from t)) $$, '%you reported%', 'cannot support own issue');

select pg_temp.login(pg_temp.u('12'));
select lives_ok($$ select public.mark_duplicate((select b from t), 1, (select a from t), 'Same pole') $$, 'secretary marks duplicate');
select pg_temp.logout();
select is((select duplicate_of_issue_id from public.issues where id = (select b from t)), (select a from t), 'duplicate points to original');
select ok(exists (select 1 from public.issue_supporters where issue_id = (select a from t) and user_id = pg_temp.u('16')),
  'duplicate reporter follows the original as a supporter');

-- Auto-close after 7 days without citizen answer, recorded as SYSTEM.
update public.issues set status = status where false; -- no-op, keeps plan readable
set local mana.workflow = 'on';
update public.issues set status = 'RESOLVED', last_status_change_at = now() - interval '8 days' where id = (select a from t);
set local mana.workflow = 'off';
select private.auto_close_resolved();
select is((select actor_role_key || '/' || source from public.issue_status_history where issue_id = (select a from t) order by id desc limit 1),
  'SYSTEM/SYSTEM', 'auto-close is recorded as a SYSTEM action');

select * from finish();
rollback;
