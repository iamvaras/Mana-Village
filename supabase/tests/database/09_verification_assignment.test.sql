begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
-- Phase 7: review / verify / reject / duplicate / assign / reassign / reconsider from
-- every status (the matrix in packages/core/src/workflow), priority and visibility,
-- and the departments and workers functions. Uses the sample issues from
-- supabase/seed/02_sample_issues.sql, which cover every status.
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
create function pg_temp.u(p_n text) returns uuid language sql immutable as $$
  select ('b0000000-0000-4000-8000-0000000000' || p_n)::uuid $$;
create function pg_temp.rmp() returns uuid language sql immutable as $$ select 'a0000000-0000-4000-8000-000000000001'::uuid $$;
create function pg_temp.kdp() returns uuid language sql immutable as $$ select 'a0000000-0000-4000-8000-000000000002'::uuid $$;
create function pg_temp.elec() returns uuid language sql immutable as $$ select 'd0000000-0000-4000-8000-000000000001'::uuid $$;
create function pg_temp.san() returns uuid language sql immutable as $$ select 'd0000000-0000-4000-8000-000000000002'::uuid $$;
-- One sample issue per status (Ramapuram).
create function pg_temp.issue_in(p_status text) returns uuid language sql stable security definer as $$
  select id from public.issues where village_id = 'a0000000-0000-4000-8000-000000000001' and status::text = p_status
   order by issue_number limit 1 $$;
create function pg_temp.ver(p_issue uuid) returns int language sql stable security definer as $$
  select version from public.issues where id = p_issue $$;
-- Runs a statement and rolls it back; returns 'ok' or the MV_ error code.
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'TEST_ROLLBACK';
  exception when others then
    if sqlerrm = 'TEST_ROLLBACK' then return 'ok'; end if;
    return coalesce(substring(sqlerrm from '(MV_[A-Z_]+)'), sqlerrm);
  end;
end $$;

create temp table statuses (status text, ord int);
insert into statuses values ('SUBMITTED',1),('UNDER_REVIEW',2),('VERIFIED',3),('ASSIGNED',4),('IN_PROGRESS',5),
  ('RESOLVED',6),('CLOSED',7),('REJECTED',8),('REOPENED',9),('DUPLICATE',10);
create temp table actions (action text, sql text, allowed text[]);
insert into actions values
  ('start_review', 'select public.start_review(%1$L, %2$s)', array['SUBMITTED']),
  ('verify',       'select public.verify_issue(%1$L, %2$s, ''HIGH'')', array['UNDER_REVIEW']),
  ('reject',       'select public.reject_issue(%1$L, %2$s, ''Not a village matter'')', array['SUBMITTED','UNDER_REVIEW']),
  ('mark_duplicate', 'select public.mark_duplicate(%1$L, %2$s, %3$L)', array['SUBMITTED','UNDER_REVIEW']),
  ('assign / reassign', 'select public.assign_issue(%1$L, %2$s, ''d0000000-0000-4000-8000-000000000001'', null, ''Please check'', null, ''Moving to Electrical'')',
     array['VERIFIED','ASSIGNED','IN_PROGRESS','REOPENED']),
  ('reconsider',   'select public.reconsider_issue(%1$L, %2$s, ''Looked again, it is valid'')', array['REJECTED','DUPLICATE']);
grant select on statuses, actions to authenticated;

select plan(33);

-- Matrix: every action from every status, as the secretary.
select pg_temp.login(pg_temp.u('12'));
select is(
  (select array_agg(pg_temp.try(format(a.sql, i, pg_temp.ver(i),
            -- a valid duplicate target that is not the issue itself
            case when s.status = 'VERIFIED' then pg_temp.issue_in('CLOSED') else pg_temp.issue_in('VERIFIED') end))
          order by s.ord)
     from statuses s cross join lateral (select pg_temp.issue_in(s.status) as i) x),
  (select array_agg(case when s.status = any(a.allowed) then 'ok' else 'MV_INVALID_TRANSITION' end order by s.ord)
     from statuses s),
  a.action || ': allowed only from ' || array_to_string(a.allowed, ', '))
from actions a;

-- Reasons and validation
select throws_like(format('select public.reject_issue(%L, %s, %L)', pg_temp.issue_in('SUBMITTED'), pg_temp.ver(pg_temp.issue_in('SUBMITTED')), 'no'),
  '%reason must be%', 'reject needs a real reason');
select throws_like(format('select public.assign_issue(%L, %s, %L, null, null, null, null)', pg_temp.issue_in('ASSIGNED'), pg_temp.ver(pg_temp.issue_in('ASSIGNED')), pg_temp.san()),
  '%reason%', 'reassign needs a reason');
select throws_like(format('select public.assign_issue(%L, %s, %L, %L)', pg_temp.issue_in('VERIFIED'), pg_temp.ver(pg_temp.issue_in('VERIFIED')), pg_temp.san(), pg_temp.u('13')),
  '%active worker of that department%', 'cannot assign a person from another department');
select throws_like(format('select public.mark_duplicate(%L, %s, %L)', pg_temp.issue_in('SUBMITTED'), pg_temp.ver(pg_temp.issue_in('SUBMITTED')), pg_temp.issue_in('REJECTED')),
  '%itself rejected or a duplicate%', 'cannot point a duplicate at a rejected issue');
select throws_like(format('select public.start_review(%L, %s)', pg_temp.issue_in('SUBMITTED'), pg_temp.ver(pg_temp.issue_in('SUBMITTED')) + 5),
  '%MV_CONFLICT%', 'stale version is refused');

-- Priority and visibility are audited and bump the version
create temp table iss as select pg_temp.issue_in('VERIFIED') as id, pg_temp.ver(pg_temp.issue_in('VERIFIED')) as v;
grant select on iss to authenticated;
select is(public.set_issue_priority((select id from iss), (select v from iss), 'CRITICAL'), (select v from iss) + 1, 'priority change bumps the version');
select is(public.set_issue_visibility((select id from iss), (select v from iss) + 1, 'PRIVATE'), (select v from iss) + 2, 'visibility change bumps the version');
select pg_temp.logout();
select is((select count(*)::int from public.audit_logs where entity_id = (select id::text from iss)
            and ((action = 'issue.priority_changed' and after ->> 'priority' = 'CRITICAL')
              or (action = 'issue.visibility_changed' and after ->> 'visibility' = 'PRIVATE'))), 2,
  'both changes are in the audit log');

-- Departments
select pg_temp.login(pg_temp.u('12'));
create temp table dep as select public.upsert_department(pg_temp.rmp(), '  Water Supply ', 'నీటి సరఫరా', 'Tanks and pipes') as id;
grant select on dep to authenticated;
select is((select name from public.departments where id = (select id from dep)), 'Water Supply', 'secretary creates a department (name trimmed)');
select throws_like($$ select public.upsert_department(pg_temp.rmp(), 'water supply') $$, '%already exists%', 'department names are unique per village');
select lives_ok($$ select public.upsert_department(pg_temp.rmp(), 'Water Supply & Tanks', null, null, (select id from dep)) $$, 'secretary renames it');
select throws_like($$ select public.upsert_department(pg_temp.kdp(), 'Roads') $$, '%MV_FORBIDDEN%', 'not in another village');
select throws_like(format('select public.set_department_active(%L, false)', pg_temp.elec()), '%reassign the%', 'cannot deactivate a department with open work');
select lives_ok($$ select public.set_department_active((select id from dep), false) $$, 'empty department can be deactivated');
select throws_like(format('select public.assign_issue(%L, %s, %L)', pg_temp.issue_in('VERIFIED'), pg_temp.ver(pg_temp.issue_in('VERIFIED')), (select id from dep)),
  '%department not found%', 'cannot assign to an inactive department');
select is((select array[worker_count, open_issue_count]::int[] from public.admin_list_departments(pg_temp.rmp()) where name = 'Electrical'),
  array[1, 2], 'Electrical: 1 worker, 2 open issues');
select is((select array_agg(name order by name) from public.admin_list_departments(pg_temp.rmp()) where not is_active),
  array['Water Supply & Tanks'], 'inactive departments are listed as inactive');
select pg_temp.logout();
select is((select array_agg(action order by id) from public.audit_logs where entity_id = (select id::text from dep)),
  array['department.created', 'department.updated', 'department.updated'], 'department changes are audited');

-- Workers
select pg_temp.login(pg_temp.u('12'));
select is((select array_agg(display_name || ':' || department_name || ':' || open_assignments order by display_name)
             from public.admin_list_workers(pg_temp.rmp())),
  array['Ramesh:Electrical:2', 'Suresh:Sanitation:3'], 'workers listed with their open work');
select is((select completed_assignments::int from public.admin_list_workers(pg_temp.rmp(), pg_temp.san())), 1,
  'completed work is counted');
select ok(not exists (select 1 from information_schema.routines r
                       join information_schema.parameters p on p.specific_name = r.specific_name
                      where r.routine_name = 'admin_list_workers' and p.parameter_name ilike '%phone%'),
  'worker list has no phone column');

-- Who may use these
select pg_temp.login(pg_temp.u('15'));
select throws_like($$ select * from public.admin_list_workers(pg_temp.rmp()) $$, '%MV_FORBIDDEN%', 'citizens cannot list workers');
select throws_like($$ select * from public.admin_list_departments(pg_temp.rmp()) $$, '%MV_FORBIDDEN%', 'citizens cannot list departments with counts');
select throws_like($$ select public.upsert_department(pg_temp.rmp(), 'Parks') $$, '%MV_FORBIDDEN%', 'citizens cannot create departments');
select pg_temp.login(pg_temp.u('13'));
select throws_like($$ select * from public.admin_list_workers(pg_temp.rmp()) $$, '%MV_FORBIDDEN%', 'workers cannot list workers');
select pg_temp.login(pg_temp.u('10'));
select lives_ok($$ select * from public.admin_list_workers(pg_temp.rmp()) $$, 'president can see workers (to assign work)');
select throws_like($$ select public.upsert_department(pg_temp.rmp(), 'Parks') $$, '%MV_FORBIDDEN%', 'president cannot manage departments (secretary does)');
select pg_temp.logout();

select * from finish();
rollback;
