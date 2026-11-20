begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
-- Phase 11 (part 2): audit log viewer. Only audit.view in that village; filters work.
create function pg_temp.login(p_uid uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.u(p_n text) returns uuid language sql immutable as $$
  select ('b0000000-0000-4000-8000-0000000000' || p_n)::uuid $$;
create function pg_temp.full_name(p_id uuid) returns text language sql stable security definer as $$
  select full_name from public.users where id = p_id $$;

select plan(11);

-- Something to find: the secretary saves an announcement (audited by trigger).
select pg_temp.login(pg_temp.u('12'));
select lives_ok($$select public.upsert_announcement('a0000000-0000-4000-8000-000000000001', 'Audit me please', 'Body')$$,
  'secretary writes something that is audited');

select ok((select count(*) from public.list_audit_logs('a0000000-0000-4000-8000-000000000001')) > 0,
  'secretary sees the village audit log');
select is((select actor_name from public.list_audit_logs('a0000000-0000-4000-8000-000000000001') limit 1),
  pg_temp.full_name(pg_temp.u('12')), 'newest row names who did it');
select is((select action from public.list_audit_logs('a0000000-0000-4000-8000-000000000001', 'config') limit 1),
  'announcement.created', 'config area includes announcements');
select is((select count(*)::int from public.list_audit_logs('a0000000-0000-4000-8000-000000000001', 'issue')
            where split_part(action, '.', 1) <> 'issue'), 0, 'issue area holds only issue actions');
select is((select count(*)::int from public.list_audit_logs('a0000000-0000-4000-8000-000000000001', null, pg_temp.u('13'))
            where actor_user_id is distinct from pg_temp.u('13')), 0, 'actor filter holds only that person');
select ok((select bool_and(id < (select max(id) from public.list_audit_logs('a0000000-0000-4000-8000-000000000001')))
             from public.list_audit_logs('a0000000-0000-4000-8000-000000000001', null, null, null, null, null,
                                         (select max(id) from public.list_audit_logs('a0000000-0000-4000-8000-000000000001')), 5)),
  'paging returns older rows only');
select throws_like($$select * from public.list_audit_logs('a0000000-0000-4000-8000-000000000001', 'secrets')$$,
  '%MV_VALIDATION%', 'unknown area is refused');

select pg_temp.login(pg_temp.u('12'), 'aal1');
select throws_like($$select * from public.list_audit_logs('a0000000-0000-4000-8000-000000000001')$$,
  '%MV_FORBIDDEN%', 'staff without the second sign-in step cannot read it');

select pg_temp.login(pg_temp.u('13'));
select throws_like($$select * from public.list_audit_logs('a0000000-0000-4000-8000-000000000001')$$,
  '%MV_FORBIDDEN%', 'a worker cannot read the audit log');

select pg_temp.login(pg_temp.u('20'));
select throws_like($$select * from public.list_audit_logs('a0000000-0000-4000-8000-000000000001')$$,
  '%MV_FORBIDDEN%', 'another village''s secretary cannot read it');

select * from finish();
rollback;
