begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
-- Phase 6: dashboard numbers match the sample issues in supabase/seed/02_sample_issues.sql,
-- the All Issues list is per village, and live-update signals reach only staff.
create function pg_temp.login(p_uid uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.u(p_n text) returns uuid language sql immutable as $$
  select ('b0000000-0000-4000-8000-0000000000' || p_n)::uuid $$;
create function pg_temp.rmp() returns uuid language sql immutable as $$ select 'a0000000-0000-4000-8000-000000000001'::uuid $$;
create function pg_temp.kdp() returns uuid language sql immutable as $$ select 'a0000000-0000-4000-8000-000000000002'::uuid $$;
create function pg_temp.topic(p_village uuid) returns text language sql immutable as $$ select 'village:' || p_village || ':issues' $$;

select plan(22);

-- Dashboard numbers, Ramapuram
select pg_temp.login(pg_temp.u('12'));
create temp table s as select public.dashboard_stats(pg_temp.rmp()) as v;
select is(
  (select v - 'avg_resolution_hours' - 'resolution_rate' from s),
  '{"total": 13, "open": 9, "submitted": 2, "under_review": 1, "verified": 1, "assigned": 1, "in_progress": 2,
    "resolved": 1, "closed": 2, "reopened": 1, "rejected": 1, "duplicate": 1, "critical_open": 2,
    "awaiting_review": 3, "awaiting_citizen": 1}'::jsonb,
  'Ramapuram status counts match the sample issues');
select is((select (v ->> 'resolution_rate')::numeric from s), round(2::numeric / 11, 4),
  'resolution rate = closed / (all - rejected - duplicate)');
select ok((select (v ->> 'avg_resolution_hours') is not null from s), 'average resolution time is computed from closed issues');
select is((public.dashboard_stats(pg_temp.rmp(), now() + interval '1 day') ->> 'total')::int, 0,
  'date range filter applies (nothing created after tomorrow)');

-- By category and department
select is((select sum(total)::int from public.issues_by_category(pg_temp.rmp())), 13, 'category totals add up to all issues');
select is((select array[total, open, closed]::int[] from public.issues_by_category(pg_temp.rmp()) where category_key = 'GARBAGE'),
  array[3, 2, 0], 'garbage: 3 reports, 2 open (one is a duplicate)');
select is((select array[total, open, closed]::int[] from public.issues_by_department(pg_temp.rmp()) where department_name = 'Electrical'),
  array[3, 2, 1], 'Electrical: 3 assigned, 2 open, 1 closed');
select is((select array[total, open, closed]::int[] from public.issues_by_department(pg_temp.rmp()) where department_name = 'Sanitation'),
  array[4, 3, 1], 'Sanitation: 4 assigned, 3 open, 1 closed');

-- All Issues list reads through issues_view
select is((select count(*)::int from public.issues_view where village_id = pg_temp.rmp()), 13, 'secretary lists all 13 village issues');
select is((select count(*)::int from public.issues_view where village_id = pg_temp.kdp()), 0, 'secretary sees no other village issues');
select is((select count(*)::int from public.issues_view where village_id = pg_temp.rmp() and status = 'IN_PROGRESS' and priority = 'CRITICAL'),
  1, 'filters by status and priority');

-- Other village and citizens
select pg_temp.login(pg_temp.u('20'));
select is((public.dashboard_stats(pg_temp.kdp()) ->> 'total')::int, 1, 'Kondapalli numbers are separate');
select throws_like($$ select public.dashboard_stats(pg_temp.rmp()) $$, '%MV_FORBIDDEN%', 'other village secretary cannot see Ramapuram numbers');
select pg_temp.login(pg_temp.u('15'));
select throws_like($$ select public.dashboard_stats(pg_temp.rmp()) $$, '%MV_FORBIDDEN%', 'citizens cannot see the dashboard');

-- Who may receive live-update signals
select pg_temp.login(pg_temp.u('12'));
select ok(private.can_receive_issue_changes(pg_temp.topic(pg_temp.rmp())), 'secretary receives own village signals');
select ok(not private.can_receive_issue_changes(pg_temp.topic(pg_temp.kdp())), 'secretary does not receive other village signals');
select ok(not private.can_receive_issue_changes('village:anything:issues'), 'malformed topic is refused');
select pg_temp.login(pg_temp.u('12'), 'aal1');
select ok(not private.can_receive_issue_changes(pg_temp.topic(pg_temp.rmp())), 'secretary without the security code receives nothing');
select pg_temp.login(pg_temp.u('15'));
select ok(not private.can_receive_issue_changes(pg_temp.topic(pg_temp.rmp())), 'citizens receive nothing');
select pg_temp.login(pg_temp.u('01'));
select ok(not private.can_receive_issue_changes('issues'), 'super admin: a topic without a village is refused');
select pg_temp.logout();

-- A change sends a signal with only the id, version and operation
create temp table m as
  select payload from realtime.messages
  where topic = pg_temp.topic(pg_temp.rmp()) and event = 'issue_changed'
    and payload ->> 'id' = (select id::text from public.issues where issue_number like 'RMP-%-00001');
select ok((select count(*) >= 1 from m), 'issue changes are broadcast on the village topic');
select is((select array_agg(distinct k order by k) from m, jsonb_object_keys(payload) k), array['id', 'op', 'version'],
  'signal carries no issue content');

select * from finish();
rollback;
