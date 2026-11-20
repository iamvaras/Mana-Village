-- =============================================================================
-- Integrity triggers:
--   * append-only history and audit (no UPDATE/DELETE, ever)
--   * no hard deletes of issues and their child records
--   * issue status/workflow columns change only inside workflow functions
--   * role grant scope rules
--   * supporter counter
--   * audit of configuration changes
-- =============================================================================

create or replace function private.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501',
    message = 'MV_FORBIDDEN: ' || tg_table_name || ' rows are permanent and cannot be ' || lower(tg_op) || 'd';
end;
$$;

create trigger issue_status_history_append_only before update or delete on public.issue_status_history
  for each row execute function private.forbid_change();
create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function private.forbid_change();

-- Never hard-delete issues or their records (moderation hides instead).
create trigger issues_no_delete before delete on public.issues
  for each row execute function private.forbid_change();
create trigger issue_assignments_no_delete before delete on public.issue_assignments
  for each row execute function private.forbid_change();
create trigger issue_comments_no_delete before delete on public.issue_comments
  for each row execute function private.forbid_change();
create trigger issue_attachments_no_delete before delete on public.issue_attachments
  for each row execute function private.forbid_change();
create trigger user_roles_no_delete before delete on public.user_roles
  for each row execute function private.forbid_change();
create trigger users_no_delete before delete on public.users
  for each row execute function private.forbid_change();

-- Truncate is also blocked on permanent tables.
create trigger issue_status_history_no_truncate before truncate on public.issue_status_history
  for each statement execute function private.forbid_change();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function private.forbid_change();
create trigger issues_no_truncate before truncate on public.issues
  for each statement execute function private.forbid_change();

-- ---------------------------------------------------------------------------
-- Workflow guard: status and workflow-owned columns may only change while the
-- transaction-local flag `mana.workflow` is 'on'. Only private.apply_transition
-- (and other workflow functions) set it. This protects even against service-role
-- or SQL-editor mistakes, in addition to column-level grants.
-- ---------------------------------------------------------------------------
create or replace function private.guard_issue_workflow_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('mana.workflow', true), '') = 'on' then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.issue_number is distinct from old.issue_number
     or new.village_id is distinct from old.village_id
     or new.created_by is distinct from old.created_by
     or new.priority is distinct from old.priority
     or new.visibility is distinct from old.visibility
     or new.assigned_department_id is distinct from old.assigned_department_id
     or new.assigned_user_id is distinct from old.assigned_user_id
     or new.duplicate_of_issue_id is distinct from old.duplicate_of_issue_id
     or new.reopen_count is distinct from old.reopen_count
     or new.version is distinct from old.version
     or new.client_request_id is distinct from old.client_request_id
     or new.created_at is distinct from old.created_at
     or new.reviewed_at is distinct from old.reviewed_at
     or new.verified_at is distinct from old.verified_at
     or new.assigned_at is distinct from old.assigned_at
     or new.work_started_at is distinct from old.work_started_at
     or new.resolved_at is distinct from old.resolved_at
     or new.closed_at is distinct from old.closed_at
     or new.rejected_at is distinct from old.rejected_at
     or new.last_status_change_at is distinct from old.last_status_change_at
  then
    raise exception using errcode = '42501',
      message = 'MV_FORBIDDEN: issue workflow fields can only be changed through workflow actions';
  end if;
  return new;
end;
$$;

create trigger issues_workflow_guard before update on public.issues
  for each row execute function private.guard_issue_workflow_columns();

-- New issues must start as SUBMITTED.
create or replace function private.guard_issue_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'SUBMITTED' then
    raise exception 'MV_VALIDATION: new issues must start as SUBMITTED';
  end if;
  return new;
end;
$$;
create trigger issues_insert_guard before insert on public.issues
  for each row execute function private.guard_issue_insert();

-- Citizen edits of title/description/location (allowed only while SUBMITTED) are audited.
create or replace function private.audit_issue_content_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.location_text is distinct from old.location_text then
    perform private.write_audit(
      'issue.edited', 'issue', new.id::text, new.village_id,
      jsonb_build_object('title', old.title, 'description', old.description, 'location_text', old.location_text),
      jsonb_build_object('title', new.title, 'description', new.description, 'location_text', new.location_text)
    );
  end if;
  return new;
end;
$$;
create trigger issues_audit_content_edit after update on public.issues
  for each row execute function private.audit_issue_content_edit();

-- ---------------------------------------------------------------------------
-- Role grant scope: GLOBAL roles have no village; VILLAGE roles must have one;
-- WORKER requires an active department in the same village.
-- ---------------------------------------------------------------------------
create or replace function private.check_user_role_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role public.roles;
  v_dept public.departments;
begin
  select * into v_role from public.roles where id = new.role_id;
  if v_role.scope = 'GLOBAL' and new.village_id is not null then
    raise exception 'MV_VALIDATION: global role % cannot be scoped to a village', v_role.key;
  end if;
  if v_role.scope = 'VILLAGE' and new.village_id is null then
    raise exception 'MV_VALIDATION: role % requires a village', v_role.key;
  end if;
  if v_role.key = 'WORKER' then
    if new.department_id is null then
      raise exception 'MV_VALIDATION: WORKER role requires a department';
    end if;
    select * into v_dept from public.departments where id = new.department_id;
    if v_dept.village_id is distinct from new.village_id then
      raise exception 'MV_VALIDATION: department belongs to another village';
    end if;
  elsif new.department_id is not null then
    raise exception 'MV_VALIDATION: only WORKER grants carry a department';
  end if;
  -- Only revocation fields may change after a grant is created.
  if tg_op = 'UPDATE' and (new.user_id, new.role_id, new.village_id, new.department_id, new.granted_by, new.granted_at)
       is distinct from (old.user_id, old.role_id, old.village_id, old.department_id, old.granted_by, old.granted_at) then
    raise exception 'MV_VALIDATION: role grants are immutable; revoke and grant again';
  end if;
  if tg_op = 'UPDATE' and old.revoked_at is not null then
    raise exception 'MV_VALIDATION: a revoked grant cannot be changed';
  end if;
  return new;
end;
$$;
create trigger user_roles_scope before insert or update on public.user_roles
  for each row execute function private.check_user_role_scope();

-- Citizens can never receive internal-only permissions.
create or replace function private.check_role_permission_grantable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.roles r where r.id = new.role_id and r.key = 'CITIZEN')
     and exists (select 1 from public.permissions p where p.key = new.permission_key and not p.citizen_grantable) then
    raise exception 'MV_VALIDATION: permission % cannot be granted to citizens', new.permission_key;
  end if;
  return new;
end;
$$;
create trigger role_permissions_grantable before insert or update on public.role_permissions
  for each row execute function private.check_role_permission_grantable();

-- ---------------------------------------------------------------------------
-- Supporter counter (supporter_count has no client UPDATE grant).
-- ---------------------------------------------------------------------------
create or replace function private.sync_supporter_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issue_id uuid := coalesce(new.issue_id, old.issue_id);
begin
  update public.issues
     set supporter_count = (select count(*) from public.issue_supporters s where s.issue_id = v_issue_id)
   where id = v_issue_id;
  return null;
end;
$$;
create trigger issue_supporters_count after insert or delete on public.issue_supporters
  for each row execute function private.sync_supporter_count();

-- ---------------------------------------------------------------------------
-- Generic audit of configuration tables.
-- ---------------------------------------------------------------------------
create or replace function private.audit_config_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_village uuid;
  v_entity_id text;
begin
  v_village := case
    when tg_table_name = 'villages' then (v_row ->> 'id')::uuid
    else (v_row ->> 'village_id')::uuid
  end;
  v_entity_id := coalesce(v_row ->> 'id', (v_row ->> 'role_id') || ':' || (v_row ->> 'permission_key'));
  perform private.write_audit(
    case tg_table_name
      when 'issue_categories' then 'category'
      when 'role_permissions' then 'role_permission'
      when 'user_roles' then 'user_role'
      else rtrim(tg_table_name, 's')
    end || '.' || case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    tg_table_name, v_entity_id, v_village, v_old, v_new
  );
  return null;
end;
$$;

create trigger villages_audit after insert or update on public.villages
  for each row execute function private.audit_config_change();
create trigger departments_audit after insert or update on public.departments
  for each row execute function private.audit_config_change();
create trigger issue_categories_audit after insert or update on public.issue_categories
  for each row execute function private.audit_config_change();
create trigger role_permissions_audit after insert or update or delete on public.role_permissions
  for each row execute function private.audit_config_change();
create trigger user_roles_audit after insert or update on public.user_roles
  for each row execute function private.audit_config_change();
create trigger announcements_audit after insert or update on public.announcements
  for each row execute function private.audit_config_change();

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.has_permission(uuid, text),
  private.is_assignee(uuid),
  private.can_view_issue(uuid),
  private.can_view_internal(uuid),
  private.is_village_staff(uuid)
to authenticated;
