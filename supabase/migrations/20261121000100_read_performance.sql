-- =============================================================================
-- Phase 12: read performance at realistic volume (docs/testing.md, Phase 12).
--
-- Load test (100 villages, ~104k issues, ~1M notifications) found three slow reads:
--   * resident "My issues" (is_mine OR i_support) scanned every issue in every
--     village and ran can_view_issue on each row: ~117 s;
--   * admin "All Issues" exact count ran can_view_issue on every row of the
--     village: ~1.7 s for a village with 5,000 issues;
--   * list_my_work ran is_assignee on every open assignment in every village.
--
-- Visibility rules do not change. issues_view keeps exactly the rule in
-- private.can_view_issue, written inline so the permission lookups run once per
-- query (InitPlan) instead of once per row. pgTAP test 17 checks, for every
-- seeded persona, that the view returns exactly the issues can_view_issue allows.
-- =============================================================================

-- Villages where the current user holds a permission. Same rule as
-- private.has_permission: active user, live role, GLOBAL scope covers every
-- village, MFA roles need an aal2 session.
create or replace function private.permitted_villages(p_permission text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct v.id), '{}'::uuid[])
  from public.users u
  join public.user_roles ur on ur.user_id = u.id and ur.revoked_at is null
  join public.roles r on r.id = ur.role_id
  join public.role_permissions rp on rp.role_id = r.id
  join public.villages v on (r.scope = 'GLOBAL' or v.id = ur.village_id)
  where u.id = (select auth.uid())
    and u.status = 'ACTIVE'
    and rp.permission_key = p_permission
    and (not r.requires_mfa or private.session_is_aal2());
$$;

-- Departments the current user works in as a WORKER (for the department-wide
-- branch of private.is_assignee).
create or replace function private.my_worker_departments()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct ur.department_id), '{}'::uuid[])
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.key = 'WORKER'
  where ur.user_id = (select auth.uid())
    and ur.revoked_at is null
    and ur.department_id is not null;
$$;

-- Called from issues_view, so the querying role needs EXECUTE (as for
-- private.can_view_issue in 20261120001300_function_grants_and_jobs.sql).
revoke all on function private.permitted_villages(text) from public, anon;
revoke all on function private.my_worker_departments() from public, anon;
grant execute on function private.permitted_villages(text), private.my_worker_departments() to authenticated;

-- Same columns, same order; only the WHERE clause changes.
create or replace view public.issues_view with (security_invoker = false) as
select
  i.id,
  i.issue_number,
  i.village_id,
  i.category_id,
  c.key  as category_key,
  c.name as category_name,
  c.name_local as category_name_local,
  i.title,
  i.description,
  i.location_text,
  i.latitude,
  i.longitude,
  i.location_accuracy_m,
  i.priority,
  i.status,
  i.visibility,
  i.assigned_department_id,
  d.name as assigned_department_name,
  i.assigned_user_id,
  private.person_label(i.assigned_user_id, i.village_id) as assigned_user_name,
  i.duplicate_of_issue_id,
  i.supporter_count,
  i.reopen_count,
  i.version,
  i.created_at,
  i.updated_at,
  i.reviewed_at,
  i.verified_at,
  i.assigned_at,
  i.work_started_at,
  i.resolved_at,
  i.closed_at,
  i.rejected_at,
  i.last_status_change_at,
  (i.created_by = (select auth.uid())) as is_mine,
  private.person_label(i.created_by, i.village_id) as reporter_name,
  case when private.is_village_staff(i.village_id) then i.created_by end as reporter_id,
  exists (select 1 from public.issue_supporters s where s.issue_id = i.id and s.user_id = (select auth.uid())) as i_support,
  private.is_assignee(i.id) as i_am_assignee
from public.issues i
join public.issue_categories c on c.id = i.category_id
left join public.departments d on d.id = i.assigned_department_id
-- Inline form of private.can_view_issue(i.id). Keep the two in step.
where i.village_id = any ((select private.permitted_villages('issue.view_all'))::uuid[])
   or (i.visibility = 'PUBLIC'
       and i.village_id = any ((select private.permitted_villages('issue.view_public'))::uuid[]))
   or (i.created_by = (select auth.uid())
       and i.village_id = any ((select private.permitted_villages('issue.view_own'))::uuid[]))
   or (
     -- is_assignee: cheap index probe first, full check only on a match.
     exists (
       select 1 from public.issue_assignments a
       where a.issue_id = i.id
         and a.ended_at is null
         and (a.assignee_user_id = (select auth.uid())
              or (a.assignee_user_id is null
                  and a.department_id = any ((select private.my_worker_departments())::uuid[])))
     )
     and private.is_assignee(i.id)
   );

-- Resident "My issues": issues I reported or support, newest activity first.
-- Starts from my own rows (indexed) and reads them through issues_view, so every
-- visibility rule still applies.
create or replace function public.list_my_issues(p_limit int default 200)
returns setof public.issues_view
language sql
stable
security definer
set search_path = ''
as $$
  select v.*
  from public.issues_view v
  where v.id in (
    select i.id from public.issues i where i.created_by = (select auth.uid())
    union
    select s.issue_id from public.issue_supporters s where s.user_id = (select auth.uid())
  )
  order by v.last_status_change_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 200);
$$;

revoke all on function public.list_my_issues(int) from public, anon;
grant execute on function public.list_my_issues(int) to authenticated;

-- Worker list: same rows as before, but only open assignments that can be mine
-- reach private.is_assignee.
create or replace function public.list_my_work()
returns table (
  issue_id uuid,
  issue_number text,
  village_id uuid,
  title text,
  status public.issue_status,
  priority public.issue_priority,
  category_name text,
  category_name_local text,
  location_text text,
  latitude numeric,
  longitude numeric,
  version int,
  last_status_change_at timestamptz,
  assignment_id uuid,
  assignment_status public.assignment_status,
  department_name text,
  assigned_to_me boolean,
  assignment_note text,
  assigned_at timestamptz,
  due_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_departments uuid[] := private.my_worker_departments();
begin
  return query
    select i.id, i.issue_number, i.village_id, i.title, i.status, i.priority,
           c.name, c.name_local, i.location_text, i.latitude, i.longitude, i.version,
           i.last_status_change_at,
           a.id, a.status, d.name, coalesce(a.assignee_user_id = v_uid, false), a.note, a.assigned_at, a.due_at
    from public.issue_assignments a
    join public.issues i on i.id = a.issue_id
    join public.issue_categories c on c.id = i.category_id
    join public.departments d on d.id = a.department_id
    where a.ended_at is null
      and (a.assignee_user_id = v_uid
           or (a.assignee_user_id is null and a.department_id = any (v_departments)))
      and i.status in ('ASSIGNED', 'IN_PROGRESS', 'REOPENED', 'RESOLVED')
      and private.is_assignee(i.id)
    order by
      case i.status when 'REOPENED' then 0 when 'ASSIGNED' then 1 when 'IN_PROGRESS' then 2 else 3 end,
      case i.priority when 'CRITICAL' then 0 when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end,
      a.due_at nulls last,
      a.assigned_at;
end;
$$;
