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

select plan(17);

create temp table t (pub uuid, priv uuid);
grant all on t to authenticated;
insert into t (pub) select pg_temp.new_issue(pg_temp.u('15'));
-- a private issue by the same reporter
select pg_temp.login(pg_temp.u('15'));
insert into t (priv) select (public.create_issue(pg_temp.village_rmp(), pg_temp.cat('OTHER'), 'Private matter near my house',
  gen_random_uuid(), null, 'Behind temple', null, null, null, 'PRIVATE') ->> 'id')::uuid;
select pg_temp.logout();
update t set pub = (select pub from t where pub is not null) where pub is null;
delete from t where priv is null;

-- Reporter sees both, with own name.
select pg_temp.login(pg_temp.u('15'));
select is((select count(*)::int from public.issues_view where id in ((select pub from t), (select priv from t))), 2, 'reporter sees own public and private issue');
select is((select reporter_name from public.issues_view where id = (select pub from t)), 'Lakshmi', 'reporter sees own name');

-- Another citizen: sees public issue, not the private one, and reporter is anonymous.
select pg_temp.login(pg_temp.u('16'));
select is((select count(*)::int from public.issues_view where id = (select pub from t)), 1, 'other citizen sees public issue');
select is((select count(*)::int from public.issues_view where id = (select priv from t)), 0, 'other citizen cannot see private issue');
select is((select reporter_name from public.issues_view where id = (select pub from t)), null, 'reporter shown as "A resident" (no name)');
select is((select reporter_id from public.issues_view where id = (select pub from t)), null, 'reporter id hidden from citizens');
select is((select count(*)::int from public.issue_timeline_view where issue_id = (select pub from t) and actor_name is not null), 0,
  'timeline does not reveal the reporter');

-- Citizen of another village sees nothing.
select pg_temp.login(pg_temp.u('21'));
select is((select count(*)::int from public.issues_view where id in ((select pub from t), (select priv from t))), 0, 'other village sees nothing');

-- Staff see everything including reporter name.
select pg_temp.login(pg_temp.u('12'));
select is((select count(*)::int from public.issues_view where id in ((select pub from t), (select priv from t))), 2, 'secretary sees all village issues');
select is((select reporter_name from public.issues_view where id = (select pub from t)), 'Lakshmi', 'staff see reporter name');
select lives_ok($$ select public.add_comment((select pub from t), 'Check with lineman first', 'INTERNAL') $$, 'staff add internal note');
select lives_ok($$ select public.add_comment((select pub from t), 'We will inspect tomorrow', 'PUBLIC') $$, 'staff add public comment');

select pg_temp.login(pg_temp.u('15'));
select is((select array_agg(body) from public.issue_comments_view where issue_id = (select pub from t)), array['We will inspect tomorrow'],
  'citizen sees only the public comment, never internal notes');
select is((select author_name from public.issue_comments_view where issue_id = (select pub from t)), 'Kiran', 'staff authors are named');
select throws_like($$ select public.add_comment((select pub from t), 'sneaky', 'INTERNAL') $$, '%MV_FORBIDDEN%', 'citizen cannot add internal notes');

-- Notifications and audit logs.
select pg_temp.login(pg_temp.u('16'));
select is((select count(*)::int from public.notifications where recipient_id <> pg_temp.u('16')), 0, 'users only see their own notifications');
select is((select count(*)::int from public.audit_logs), 0, 'citizens cannot read audit logs');

select * from finish();
rollback;
