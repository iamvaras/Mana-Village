-- =============================================================================
-- Phase 7: departments and workers screens (docs/api.md §1, docs/ui-ux.md §3.7–3.8).
--
-- Writes to departments go through these functions only (no table write grants).
-- Every change is audited by the existing trigger on public.departments
-- (department.created / department.updated, with old and new values).
-- Worker lists never include phone numbers; staff use the audited
-- admin_get_user_contact when they really need one.
-- =============================================================================

-- Create (p_id null) or edit a department.
create or replace function public.upsert_department(
  p_village_id  uuid,
  p_name        text,
  p_name_local  text default null,
  p_description text default null,
  p_id          uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_local text := nullif(btrim(coalesce(p_name_local, '')), '');
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_id uuid;
begin
  perform private.require_user();
  perform private.require_permission(p_village_id, 'department.manage');

  if char_length(v_name) not between 2 and 100 then
    perform private.raise_app_error('MV_VALIDATION', 'name must be 2-100 characters');
  end if;
  if v_local is not null and char_length(v_local) > 100 then
    perform private.raise_app_error('MV_VALIDATION', 'local name must be at most 100 characters');
  end if;
  if v_desc is not null and char_length(v_desc) > 500 then
    perform private.raise_app_error('MV_VALIDATION', 'description must be at most 500 characters');
  end if;
  if exists (select 1 from public.departments
              where village_id = p_village_id and lower(name) = lower(v_name)
                and (p_id is null or id <> p_id)) then
    perform private.raise_app_error('MV_VALIDATION', 'a department with this name already exists');
  end if;

  if p_id is null then
    insert into public.departments (village_id, name, name_local, description)
    values (p_village_id, v_name, v_local, v_desc)
    returning id into v_id;
  else
    update public.departments
       set name = v_name, name_local = v_local, description = v_desc, updated_at = now()
     where id = p_id and village_id = p_village_id
    returning id into v_id;
    if v_id is null then
      perform private.raise_app_error('MV_NOT_FOUND', 'department not found');
    end if;
  end if;
  return v_id;
end;
$$;

-- Deactivate or reactivate. A department with open work cannot be deactivated:
-- its issues must be reassigned first, so nothing is left without an owner.
create or replace function public.set_department_active(p_department_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dept public.departments;
  v_open int;
begin
  perform private.require_user();
  select * into v_dept from public.departments where id = p_department_id;
  if not found then
    perform private.raise_app_error('MV_NOT_FOUND', 'department not found');
  end if;
  perform private.require_permission(v_dept.village_id, 'department.manage');
  if v_dept.is_active = p_active then
    return;
  end if;

  if not p_active then
    select count(*) into v_open from public.issue_assignments
     where department_id = p_department_id and ended_at is null;
    if v_open > 0 then
      perform private.raise_app_error('MV_VALIDATION',
        'reassign the ' || v_open || ' open issue(s) of this department first');
    end if;
  end if;

  update public.departments set is_active = p_active, updated_at = now() where id = p_department_id;
end;
$$;

-- Departments with staff and open-work counts. Used by the Departments screen
-- and the assignment dialog.
create or replace function public.admin_list_departments(p_village_id uuid)
returns table (
  id uuid, name text, name_local text, description text, is_active boolean,
  worker_count bigint, open_issue_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  if not (private.has_permission(p_village_id, 'department.manage')
          or private.has_permission(p_village_id, 'issue.assign')) then
    perform private.raise_app_error('MV_FORBIDDEN', 'you cannot view departments here');
  end if;
  return query
    select d.id, d.name, d.name_local, d.description, d.is_active,
           (select count(distinct ur.user_id) from public.user_roles ur
              join public.roles r on r.id = ur.role_id and r.key = 'WORKER'
              join public.users u on u.id = ur.user_id and u.status = 'ACTIVE'
             where ur.department_id = d.id and ur.revoked_at is null),
           (select count(*) from public.issue_assignments a
             where a.department_id = d.id and a.ended_at is null)
    from public.departments d
    where d.village_id = p_village_id
    order by d.is_active desc, d.name;
end;
$$;

-- Workers of a village (optionally one department) with workload. No phone numbers.
create or replace function public.admin_list_workers(p_village_id uuid, p_department_id uuid default null)
returns table (
  user_role_id uuid, user_id uuid, full_name text, display_name text, user_status public.user_status,
  department_id uuid, department_name text, granted_at timestamptz,
  open_assignments bigint, completed_assignments bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  if not (private.has_permission(p_village_id, 'role.assign_worker')
          or private.has_permission(p_village_id, 'issue.assign')) then
    perform private.raise_app_error('MV_FORBIDDEN', 'you cannot view workers here');
  end if;
  return query
    select ur.id, u.id, u.full_name, u.display_name, u.status,
           d.id, d.name, ur.granted_at,
           (select count(*) from public.issue_assignments a
             where a.assignee_user_id = u.id and a.department_id = d.id and a.ended_at is null),
           (select count(*) from public.issue_assignments a
             where a.assignee_user_id = u.id and a.department_id = d.id and a.status = 'COMPLETED')
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.key = 'WORKER'
    join public.users u on u.id = ur.user_id
    join public.departments d on d.id = ur.department_id
    where ur.village_id = p_village_id
      and ur.revoked_at is null
      and (p_department_id is null or ur.department_id = p_department_id)
    order by d.name, u.full_name;
end;
$$;

revoke all on function
  public.upsert_department(uuid, text, text, text, uuid),
  public.set_department_active(uuid, boolean),
  public.admin_list_departments(uuid),
  public.admin_list_workers(uuid, uuid)
from public, anon;
grant execute on function
  public.upsert_department(uuid, text, text, text, uuid),
  public.set_department_active(uuid, boolean),
  public.admin_list_departments(uuid),
  public.admin_list_workers(uuid, uuid)
to authenticated;
