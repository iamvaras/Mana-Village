begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
-- Phase 12: issues_view writes the can_view_issue rule inline for speed
-- (20261121000100_read_performance.sql). These checks pin the two together for
-- every seeded person, with and without an MFA (aal2) session, plus a suspended
-- user and a revoked staff role.
create function pg_temp.u(p_n text) returns uuid language sql immutable as $$
  select ('b0000000-0000-4000-8000-0000000000' || p_n)::uuid $$;

-- Runs as the test owner with only the JWT claims switched, so both sides can
-- be computed in one session: the view, and can_view_issue on the base table.
create function pg_temp.check_person(p_uid uuid, p_aal text) returns setof text language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  return next set_eq(
    'select id from public.issues_view',
    'select id from public.issues where private.can_view_issue(id)',
    format('issues_view matches can_view_issue for %s (%s)', p_uid, p_aal));
  return next set_eq(
    'select id from public.list_my_issues(200)',
    'select id from public.issues_view where is_mine or i_support',
    format('list_my_issues = my reported or supported issues for %s (%s)', p_uid, p_aal));
end $$;

create temp table people (n text);
insert into people values ('01'), ('10'), ('11'), ('12'), ('13'), ('14'), ('15'), ('16'), ('17'), ('18'), ('20'), ('21');

select plan(12 * 4 + 4 + 3);

-- The seed has only public issues and named assignees; add the other cases
-- (fixture only, so the workflow guard triggers are skipped for these two updates).
set local session_replication_role = replica;
update public.issues set visibility = 'PRIVATE'
 where id in (select id from public.issues order by issue_number limit 3)
    or id in (select issue_id from public.issue_assignments where ended_at is null order by assigned_at limit 2);
update public.issue_assignments set assignee_user_id = null
 where id = (select id from public.issue_assignments where ended_at is null order by assigned_at limit 1);
set local session_replication_role = origin;

select pg_temp.check_person(pg_temp.u(n), aal) from people, (values ('aal1'), ('aal2')) a(aal);

-- Suspended citizen and revoked worker role.
update public.users set status = 'SUSPENDED' where id = pg_temp.u('15');
update public.user_roles set revoked_at = now()
 where user_id = pg_temp.u('13') and role_id = (select id from public.roles where key = 'WORKER');
select pg_temp.check_person(pg_temp.u('15'), 'aal1');
select pg_temp.check_person(pg_temp.u('13'), 'aal1');

-- Through the API role: grants are in place and the limit is respected.
select set_config('request.jwt.claims',
  json_build_object('sub', pg_temp.u('16'), 'role', 'authenticated', 'aal', 'aal1')::text, true);
set local role authenticated;
select lives_ok('select count(*) from public.issues_view', 'a resident can read issues_view');
select lives_ok('select count(*) from public.list_my_issues()', 'a resident can call list_my_issues');
select ok((select count(*) from public.list_my_issues(1)) <= 1, 'list_my_issues honours the limit');

select * from finish();
rollback;
