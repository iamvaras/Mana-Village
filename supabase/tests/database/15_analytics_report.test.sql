begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
-- Phase 11 (part 2): analytics_report, with the definitions approved 2026-11-20.
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.u(p_n text) returns uuid language sql immutable as $$
  select ('b0000000-0000-4000-8000-0000000000' || p_n)::uuid $$;

-- Expected figures, computed straight from the table as the owner.
create temp table expect as
  select count(*) filter (where status = 'CLOSED' and resolved_at is not null) as fixed,
         count(*) filter (where resolved_at is not null) as ever_resolved,
         count(*) filter (where resolved_at is not null and reopen_count > 0) as reopened,
         count(*) as reported,
         count(*) filter (where status = 'CLOSED') as closed
    from public.issues where village_id = 'a0000000-0000-4000-8000-000000000001';
grant select on expect to authenticated;
create temp table r (j jsonb);
grant select, insert, delete on r to authenticated;

select plan(10);

select pg_temp.login(pg_temp.u('12'));
insert into r select public.analytics_report('a0000000-0000-4000-8000-000000000001',
  now() - interval '60 days', now() + interval '1 day');
select is((select j->>'bucket' from r), 'week', 'a 2-month range is shown per week');
select is((select sum((p->>'reported')::int) from r, jsonb_array_elements(j->'trend') p)::int,
  (select reported::int from expect), 'trend counts every issue reported in the range once');
select is((select sum((p->>'closed')::int) from r, jsonb_array_elements(j->'trend') p)::int,
  (select closed::int from expect), 'trend counts every closing in the range once');
select is((select (j->'fix_time'->>'under_1_day')::int + (j->'fix_time'->>'days_1_3')::int + (j->'fix_time'->>'days_3_7')::int
                 + (j->'fix_time'->>'days_7_30')::int + (j->'fix_time'->>'over_30_days')::int from r),
  (select fixed::int from expect), 'time-to-fix groups add up to the closed issues');
select is((select (j->'reopened'->>'ever_resolved')::int from r), (select ever_resolved::int from expect),
  'reopened rate is out of issues ever marked solved');
select is((select (j->'reopened'->>'reopened')::int from r), (select reopened::int from expect),
  'reopened counts issues reopened at least once');

delete from r;
insert into r select public.analytics_report('a0000000-0000-4000-8000-000000000001',
  now() - interval '400 days', now() + interval '1 day');
select is((select j->>'bucket' from r), 'month', 'a range over 120 days is shown per month');

select throws_like($$select public.analytics_report('a0000000-0000-4000-8000-000000000001', now(), now() - interval '1 day')$$,
  '%MV_VALIDATION%', 'start must be before end');

select pg_temp.login(pg_temp.u('13'));
select throws_like($$select public.analytics_report('a0000000-0000-4000-8000-000000000001')$$,
  '%MV_FORBIDDEN%', 'a worker cannot read analytics');
select pg_temp.login(pg_temp.u('20'));
select throws_like($$select public.analytics_report('a0000000-0000-4000-8000-000000000001')$$,
  '%MV_FORBIDDEN%', 'another village''s secretary cannot read it');

select * from finish();
rollback;
