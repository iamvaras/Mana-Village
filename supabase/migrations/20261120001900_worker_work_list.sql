-- =============================================================================
-- Phase 8: the worker's Work list (docs/ui-ux.md §2.3).
--
-- Returns only the issues whose active assignment belongs to the signed-in
-- worker: assigned to them by name, or to their department with no person yet.
-- It reuses private.is_assignee, the same rule the workflow functions use, so
-- the list and the allowed actions can never disagree. A worker never sees the
-- wider village list here. No phone numbers or reporter identities are returned.
-- =============================================================================

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
      and i.status in ('ASSIGNED', 'IN_PROGRESS', 'REOPENED', 'RESOLVED')
      and private.is_assignee(i.id)
    order by
      case i.status when 'REOPENED' then 0 when 'ASSIGNED' then 1 when 'IN_PROGRESS' then 2 else 3 end,
      case i.priority when 'CRITICAL' then 0 when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end,
      a.due_at nulls last,
      a.assigned_at;
end;
$$;

revoke all on function public.list_my_work() from public, anon;
grant execute on function public.list_my_work() to authenticated;
