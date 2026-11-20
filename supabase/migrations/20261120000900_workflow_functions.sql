-- =============================================================================
-- Issue workflow. See docs/issue-workflow.md §2 (authoritative transition table).
--
-- private.apply_transition is the ONLY code path that changes issues.status.
-- In one transaction it: locks the issue, checks the current status and the
-- expected version, updates status + timestamps + version, writes exactly one
-- issue_status_history row and (for staff/system actions) one audit_logs row.
-- Callers add notifications and any action-specific changes.
-- =============================================================================

create or replace function private.apply_transition(
  p_issue_id         uuid,
  p_expected_version int,
  p_allowed_from     public.issue_status[],
  p_to               public.issue_status,
  p_action           text,
  p_reason           text,
  p_metadata         jsonb,
  p_source           public.action_source
)
returns public.issues
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issue public.issues;
  v_uid uuid := (select auth.uid());
  v_role text;
  v_from public.issue_status;
begin
  select * into v_issue from public.issues where id = p_issue_id for update;
  if not found then
    perform private.raise_app_error('MV_NOT_FOUND', 'issue not found');
  end if;
  if not (v_issue.status = any (p_allowed_from)) then
    perform private.raise_app_error('MV_INVALID_TRANSITION',
      'cannot ' || p_action || ' an issue that is ' || v_issue.status);
  end if;
  if p_expected_version is not null and p_expected_version <> v_issue.version then
    perform private.raise_app_error('MV_CONFLICT', 'issue was changed by someone else, please refresh');
  end if;

  v_from := v_issue.status;
  v_role := case when v_uid is null then 'SYSTEM' else private.acting_role_key(v_issue.village_id) end;

  perform set_config('mana.workflow', 'on', true);
  update public.issues
     set status = p_to,
         version = version + 1,
         last_status_change_at = clock_timestamp(),
         reviewed_at     = case when p_to = 'UNDER_REVIEW' then coalesce(reviewed_at, now()) else reviewed_at end,
         verified_at     = case when p_to = 'VERIFIED' then coalesce(verified_at, now()) else verified_at end,
         assigned_at     = case when p_to = 'ASSIGNED' then now() else assigned_at end,
         work_started_at = case when p_to = 'IN_PROGRESS' then coalesce(work_started_at, now()) else work_started_at end,
         resolved_at     = case when p_to = 'RESOLVED' then now() else resolved_at end,
         closed_at       = case when p_to = 'CLOSED' then now() else closed_at end,
         rejected_at     = case when p_to = 'REJECTED' then now() else rejected_at end,
         reopen_count    = case when p_to = 'REOPENED' then reopen_count + 1 else reopen_count end
   where id = p_issue_id
  returning * into v_issue;
  perform set_config('mana.workflow', 'off', true);

  insert into public.issue_status_history
    (issue_id, from_status, to_status, actor_user_id, actor_role_key, reason, metadata, source)
  values (p_issue_id, v_from, p_to, v_uid, v_role, nullif(btrim(coalesce(p_reason, '')), ''),
          coalesce(p_metadata, '{}'::jsonb), p_source);

  if v_role is distinct from 'CITIZEN' then
    perform private.write_audit('issue.' || p_action, 'issue', p_issue_id::text, v_issue.village_id,
      null, jsonb_build_object('status', p_to, 'version', v_issue.version),
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('reason', p_reason));
  end if;

  return v_issue;
end;
$$;

-- Set workflow-owned columns that are not the status (assignment fields etc.).
create or replace function private.set_issue_assignment_fields(
  p_issue_id uuid, p_department_id uuid, p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('mana.workflow', 'on', true);
  update public.issues
     set assigned_department_id = p_department_id, assigned_user_id = p_user_id
   where id = p_issue_id;
  perform set_config('mana.workflow', 'off', true);
end;
$$;

-- Loads the issue for a staff action and enforces village permission.
create or replace function private.load_issue_for(p_issue_id uuid, p_permission text)
returns public.issues
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issue public.issues;
begin
  perform private.require_user();
  select * into v_issue from public.issues where id = p_issue_id;
  if not found then
    perform private.raise_app_error('MV_NOT_FOUND', 'issue not found');
  end if;
  if p_permission is not null then
    perform private.require_permission(v_issue.village_id, p_permission);
  end if;
  return v_issue;
end;
$$;

-- Conflict of interest: staff may not approve/resolve/close their own report.
create or replace function private.forbid_own_issue(p_issue public.issues)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_issue.created_by = (select auth.uid()) then
    perform private.raise_app_error('MV_FORBIDDEN', 'you cannot take this action on an issue you reported');
  end if;
end;
$$;

-- ===========================================================================
-- Review stage
-- ===========================================================================
create or replace function public.start_review(p_issue_id uuid, p_expected_version int, p_source text default 'ADMIN_WEB')
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_issue public.issues := private.load_issue_for(p_issue_id, 'issue.review');
begin
  v_issue := private.apply_transition(p_issue_id, p_expected_version, array['SUBMITTED']::public.issue_status[],
    'UNDER_REVIEW', 'start_review', null, '{}', private.check_source(p_source));
  perform private.notify_followers(p_issue_id, 'ISSUE_UNDER_REVIEW');
  return v_issue.version;
end;
$$;

create or replace function public.verify_issue(
  p_issue_id uuid, p_expected_version int,
  p_priority public.issue_priority default null, p_note text default null, p_source text default 'ADMIN_WEB'
)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_issue public.issues := private.load_issue_for(p_issue_id, 'issue.verify');
begin
  perform private.forbid_own_issue(v_issue);
  if p_priority is not null then
    perform private.require_permission(v_issue.village_id, 'issue.set_priority');
  end if;
  v_issue := private.apply_transition(p_issue_id, p_expected_version, array['UNDER_REVIEW']::public.issue_status[],
    'VERIFIED', 'verify', p_note,
    case when p_priority is null then '{}'::jsonb else jsonb_build_object('priority', p_priority) end,
    private.check_source(p_source));
  if p_priority is not null and p_priority <> v_issue.priority then
    perform set_config('mana.workflow', 'on', true);
    update public.issues set priority = p_priority where id = p_issue_id;
    perform set_config('mana.workflow', 'off', true);
    perform private.write_audit('issue.priority_changed', 'issue', p_issue_id::text, v_issue.village_id,
      jsonb_build_object('priority', v_issue.priority), jsonb_build_object('priority', p_priority));
  end if;
  perform private.notify_followers(p_issue_id, 'ISSUE_VERIFIED');
  return v_issue.version;
end;
$$;

create or replace function public.reject_issue(p_issue_id uuid, p_expected_version int, p_reason text, p_source text default 'ADMIN_WEB')
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_issue public.issues := private.load_issue_for(p_issue_id, 'issue.reject');
begin
  v_issue := private.apply_transition(p_issue_id, p_expected_version,
    array['SUBMITTED', 'UNDER_REVIEW']::public.issue_status[], 'REJECTED', 'reject',
    private.check_reason(p_reason), '{}', private.check_source(p_source));
  perform private.notify_followers(p_issue_id, 'ISSUE_REJECTED');
  return v_issue.version;
end;
$$;

create or replace function public.mark_duplicate(
  p_issue_id uuid, p_expected_version int, p_duplicate_of uuid, p_note text default null, p_source text default 'ADMIN_WEB'
)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_issue public.issues := private.load_issue_for(p_issue_id, 'issue.mark_duplicate');
  v_target public.issues;
begin
  select * into v_target from public.issues where id = p_duplicate_of;
  if not found or v_target.village_id <> v_issue.village_id or v_target.id = v_issue.id then
    perform private.raise_app_error('MV_VALIDATION', 'original issue must be another issue in the same village');
  end if;
  if v_target.status in ('DUPLICATE', 'REJECTED') then
    perform private.raise_app_error('MV_VALIDATION', 'original issue is itself rejected or a duplicate');
  end if;

  perform set_config('mana.workflow', 'on', true);
  update public.issues set duplicate_of_issue_id = p_duplicate_of where id = p_issue_id;
  perform set_config('mana.workflow', 'off', true);

  v_issue := private.apply_transition(p_issue_id, p_expected_version,
    array['SUBMITTED', 'UNDER_REVIEW']::public.issue_status[], 'DUPLICATE', 'mark_duplicate', p_note,
    jsonb_build_object('duplicate_of', p_duplicate_of, 'duplicate_of_number', v_target.issue_number),
    private.check_source(p_source));

  -- The reporter keeps following the problem as a supporter of the original.
  if v_issue.created_by <> v_target.created_by then
    insert into public.issue_supporters (issue_id, user_id) values (p_duplicate_of, v_issue.created_by)
    on conflict do nothing;
  end if;
  perform private.notify_followers(p_issue_id, 'ISSUE_DUPLICATE');
  return v_issue.version;
end;
$$;

create or replace function public.reconsider_issue(p_issue_id uuid, p_expected_version int, p_reason text, p_source text default 'ADMIN_WEB')
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_issue public.issues := private.load_issue_for(p_issue_id, 'issue.review');
begin
  v_issue := private.apply_transition(p_issue_id, p_expected_version,
    array['REJECTED', 'DUPLICATE']::public.issue_status[], 'UNDER_REVIEW', 'reconsider',
    private.check_reason(p_reason), jsonb_build_object('previous_duplicate_of', v_issue.duplicate_of_issue_id),
    private.check_source(p_source));
  perform set_config('mana.workflow', 'on', true);
  update public.issues set duplicate_of_issue_id = null where id = p_issue_id;
  perform set_config('mana.workflow', 'off', true);
  perform private.notify_followers(p_issue_id, 'ISSUE_RECONSIDERED');
  return v_issue.version;
end;
$$;

-- ===========================================================================
-- Assignment stage
-- ===========================================================================

-- Assign (VERIFIED/REOPENED → ASSIGNED) or reassign (ASSIGNED/IN_PROGRESS → ASSIGNED, reason required).
-- Department is required; person is optional (any worker in the department can then accept).
create or replace function public.assign_issue(
  p_issue_id uuid, p_expected_version int, p_department_id uuid,
  p_assignee_user_id uuid default null, p_note text default null, p_due_at timestamptz default null,
  p_reason text default null, p_source text default 'ADMIN_WEB'
)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid;
  v_issue public.issues := private.load_issue_for(p_issue_id, 'issue.assign');
  v_is_reassign boolean := v_issue.status in ('ASSIGNED', 'IN_PROGRESS');
  v_assignment_id uuid;
  v_prev uuid;
begin
  v_uid := (select auth.uid());
  if not exists (select 1 from public.departments
                  where id = p_department_id and village_id = v_issue.village_id and is_active) then
    perform private.raise_app_error('MV_VALIDATION', 'department not found in this village');
  end if;
  if p_assignee_user_id is not null and not exists (
       select 1 from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.key = 'WORKER'
       join public.users u on u.id = ur.user_id and u.status = 'ACTIVE'
       where ur.user_id = p_assignee_user_id and ur.department_id = p_department_id and ur.revoked_at is null) then
    perform private.raise_app_error('MV_VALIDATION', 'assignee must be an active worker of that department');
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    perform private.raise_app_error('MV_VALIDATION', 'note must be at most 500 characters');
  end if;

  -- End any active assignment (reassignment, or a REOPENED issue that kept its assignment).
  update public.issue_assignments
     set status = 'SUPERSEDED', ended_at = now()
   where issue_id = p_issue_id and ended_at is null
  returning id into v_prev;

  insert into public.issue_assignments (issue_id, department_id, assignee_user_id, assigned_by, note, due_at)
  values (p_issue_id, p_department_id, p_assignee_user_id, v_uid, nullif(btrim(coalesce(p_note, '')), ''), p_due_at)
  returning id into v_assignment_id;

  perform private.set_issue_assignment_fields(p_issue_id, p_department_id, p_assignee_user_id);

  v_issue := private.apply_transition(p_issue_id, p_expected_version,
    array['VERIFIED', 'REOPENED', 'ASSIGNED', 'IN_PROGRESS']::public.issue_status[], 'ASSIGNED',
    case when v_is_reassign then 'reassign' else 'assign' end,
    case when v_is_reassign then private.check_reason(p_reason) else p_note end,
    jsonb_build_object('assignment_id', v_assignment_id, 'department_id', p_department_id,
                       'assignee_user_id', p_assignee_user_id, 'reassigned', v_is_reassign,
                       'previous_assignment_id', v_prev),
    private.check_source(p_source));

  perform private.notify_assignees(p_issue_id, 'WORK_ASSIGNED_TO_YOU');
  if not v_is_reassign then
    perform private.notify_followers(p_issue_id, 'ISSUE_ASSIGNED');
  end if;
  return v_issue.version;
end;
$$;

-- Worker accepts (and, for department-level assignments, claims) the work. No status change.
create or replace function public.accept_assignment(p_issue_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_issue public.issues;
  v_assignment public.issue_assignments;
begin
  select * into v_issue from public.issues where id = p_issue_id;
  if not found or not private.is_assignee(p_issue_id) then
    perform private.raise_app_error('MV_FORBIDDEN', 'this work is not assigned to you');
  end if;
  select * into v_assignment from public.issue_assignments
   where issue_id = p_issue_id and ended_at is null for update;
  if v_assignment.status <> 'PENDING' then
    perform private.raise_app_error('MV_INVALID_TRANSITION', 'assignment was already answered');
  end if;
  update public.issue_assignments
     set status = 'ACCEPTED', responded_at = now(), assignee_user_id = coalesce(assignee_user_id, v_uid)
   where id = v_assignment.id;
  if v_assignment.assignee_user_id is null then
    perform private.set_issue_assignment_fields(p_issue_id, v_assignment.department_id, v_uid);
  end if;
  perform private.write_audit('issue.accept_assignment', 'issue', p_issue_id::text, v_issue.village_id,
    null, jsonb_build_object('assignment_id', v_assignment.id, 'assignee_user_id', v_uid));
end;
$$;

create or replace function public.decline_assignment(p_issue_id uuid, p_expected_version int, p_reason text, p_source text default 'MOBILE')
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_issue public.issues;
  v_assignment public.issue_assignments;
  v_reason text := private.check_reason(p_reason);
begin
  if not private.is_assignee(p_issue_id) then
    perform private.raise_app_error('MV_FORBIDDEN', 'this work is not assigned to you');
  end if;
  select * into v_assignment from public.issue_assignments
   where issue_id = p_issue_id and ended_at is null for update;
  if v_assignment.status <> 'PENDING' then
    perform private.raise_app_error('MV_INVALID_TRANSITION', 'accepted work cannot be declined; ask an admin to reassign');
  end if;

  v_issue := private.apply_transition(p_issue_id, p_expected_version, array['ASSIGNED']::public.issue_status[],
    'VERIFIED', 'decline_assignment', v_reason,
    jsonb_build_object('assignment_id', v_assignment.id), private.check_source(p_source));

  update public.issue_assignments
     set status = 'DECLINED', responded_at = now(), response_note = v_reason, ended_at = now(),
         assignee_user_id = coalesce(assignee_user_id, v_uid)
   where id = v_assignment.id;
  perform private.set_issue_assignment_fields(p_issue_id, null, null);
  perform private.notify_permission_holders(p_issue_id, 'issue.assign', 'ASSIGNMENT_DECLINED');
  return v_issue.version;
end;
$$;

-- ===========================================================================
-- Work stage
-- ===========================================================================
create or replace function public.start_work(p_issue_id uuid, p_expected_version int, p_source text default 'MOBILE')
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_issue public.issues;
  v_assignment public.issue_assignments;
  v_is_assignee boolean := private.is_assignee(p_issue_id);
begin
  select * into v_issue from public.issues where id = p_issue_id;
  if not found then
    perform private.raise_app_error('MV_NOT_FOUND', 'issue not found');
  end if;
  if not (v_is_assignee or private.has_permission(v_issue.village_id, 'issue.assign')) then
    perform private.raise_app_error('MV_FORBIDDEN', 'this work is not assigned to you');
  end if;
  select * into v_assignment from public.issue_assignments
   where issue_id = p_issue_id and ended_at is null for update;
  if not found then
    perform private.raise_app_error('MV_VALIDATION', 'assign the issue before starting work');
  end if;

  v_issue := private.apply_transition(p_issue_id, p_expected_version,
    array['ASSIGNED', 'REOPENED']::public.issue_status[], 'IN_PROGRESS', 'start_work', null,
    jsonb_build_object('assignment_id', v_assignment.id), private.check_source(p_source));

  -- Starting work implicitly accepts (and claims) a pending assignment.
  if v_assignment.status = 'PENDING' then
    update public.issue_assignments
       set status = 'ACCEPTED', responded_at = now(),
           assignee_user_id = coalesce(assignee_user_id, case when v_is_assignee then v_uid end)
     where id = v_assignment.id;
    if v_assignment.assignee_user_id is null and v_is_assignee then
      perform private.set_issue_assignment_fields(p_issue_id, v_assignment.department_id, v_uid);
    end if;
  end if;
  perform private.notify_followers(p_issue_id, 'WORK_STARTED');
  return (select version from public.issues where id = p_issue_id);
end;
$$;

-- Progress note (public comment) and/or progress photos. No status change.
create or replace function public.add_progress_update(
  p_issue_id uuid, p_note text default null, p_attachments jsonb default '[]'::jsonb
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_issue public.issues;
begin
  perform private.require_user();
  select * into v_issue from public.issues where id = p_issue_id;
  if not found or not (private.is_assignee(p_issue_id)
      or (private.has_permission(v_issue.village_id, 'attachment.upload_work') and private.is_village_staff(v_issue.village_id))) then
    perform private.raise_app_error('MV_FORBIDDEN', 'only the assigned worker or staff can post progress');
  end if;
  if v_issue.status <> 'IN_PROGRESS' then
    perform private.raise_app_error('MV_INVALID_TRANSITION', 'progress can only be added while work is in progress');
  end if;
  if char_length(btrim(coalesce(p_note, ''))) = 0
     and coalesce(jsonb_array_length(case when jsonb_typeof(p_attachments) = 'array' then p_attachments end), 0) = 0 then
    perform private.raise_app_error('MV_VALIDATION', 'add a note or a photo');
  end if;
  if char_length(btrim(coalesce(p_note, ''))) > 0 then
    if char_length(p_note) > 1000 then
      perform private.raise_app_error('MV_VALIDATION', 'note must be at most 1000 characters');
    end if;
    insert into public.issue_comments (issue_id, author_id, body, visibility)
    values (p_issue_id, (select auth.uid()), btrim(p_note), 'PUBLIC');
  end if;
  perform private.register_attachments(p_issue_id, 'PROGRESS', 'PUBLIC', p_attachments);
end;
$$;

-- IN_PROGRESS → RESOLVED. Requires a completion photo taken during this work cycle.
create or replace function public.resolve_issue(
  p_issue_id uuid, p_expected_version int, p_note text default null,
  p_attachments jsonb default '[]'::jsonb, p_source text default 'MOBILE'
)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_issue public.issues;
  v_via text;
begin
  perform private.require_user();
  select * into v_issue from public.issues where id = p_issue_id;
  if not found then
    perform private.raise_app_error('MV_NOT_FOUND', 'issue not found');
  end if;
  if private.is_assignee(p_issue_id) then
    v_via := 'assignee';
  elsif private.has_permission(v_issue.village_id, 'issue.resolve_any') then
    v_via := 'admin_override';
  else
    perform private.raise_app_error('MV_FORBIDDEN', 'this work is not assigned to you');
  end if;
  perform private.forbid_own_issue(v_issue);
  if v_issue.status <> 'IN_PROGRESS' then
    perform private.raise_app_error('MV_INVALID_TRANSITION', 'cannot resolve an issue that is ' || v_issue.status);
  end if;

  perform private.register_attachments(p_issue_id, 'COMPLETION', 'PUBLIC', p_attachments);
  if not exists (select 1 from public.issue_attachments
                  where issue_id = p_issue_id and kind = 'COMPLETION' and not is_hidden
                    and created_at > v_issue.last_status_change_at) then
    perform private.raise_app_error('MV_VALIDATION', 'a completion photo is required');
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    perform private.raise_app_error('MV_VALIDATION', 'note must be at most 1000 characters');
  end if;

  v_issue := private.apply_transition(p_issue_id, p_expected_version, array['IN_PROGRESS']::public.issue_status[],
    'RESOLVED', 'resolve', p_note, jsonb_build_object('resolved_via', v_via), private.check_source(p_source));
  perform private.notify(v_issue.created_by, p_issue_id, 'RESOLUTION_CONFIRM_REQUEST');
  return v_issue.version;
end;
$$;

-- ===========================================================================
-- Confirmation / closing
-- ===========================================================================

-- Reporter answers "Was this problem actually solved?".
create or replace function public.confirm_resolution(
  p_issue_id uuid, p_expected_version int, p_solved boolean,
  p_reason text default null, p_attachments jsonb default '[]'::jsonb, p_source text default 'MOBILE'
)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_issue public.issues;
begin
  select * into v_issue from public.issues where id = p_issue_id;
  if not found or v_issue.created_by <> v_uid then
    perform private.raise_app_error('MV_FORBIDDEN', 'only the person who reported this issue can confirm');
  end if;
  perform private.require_permission(v_issue.village_id, 'issue.confirm_resolution');

  if p_solved then
    v_issue := private.apply_transition(p_issue_id, p_expected_version, array['RESOLVED']::public.issue_status[],
      'CLOSED', 'confirm_solved', null, jsonb_build_object('confirmation', 'SOLVED'), private.check_source(p_source));
    update public.issue_assignments set status = 'COMPLETED', ended_at = now()
     where issue_id = p_issue_id and ended_at is null;
    perform private.notify_assignees(p_issue_id, 'ISSUE_CLOSED');
    perform private.notify_followers(p_issue_id, 'ISSUE_CLOSED');
  else
    v_issue := private.apply_transition(p_issue_id, p_expected_version, array['RESOLVED']::public.issue_status[],
      'REOPENED', 'confirm_not_solved', private.check_reason(p_reason),
      jsonb_build_object('confirmation', 'NOT_SOLVED'), private.check_source(p_source));
    perform private.register_attachments(p_issue_id, 'OTHER', 'PUBLIC', p_attachments);
    -- Assignment stays active so the same worker can restart; admins are told too.
    perform private.notify_assignees(p_issue_id, 'ISSUE_REOPENED');
    perform private.notify_permission_holders(p_issue_id, 'issue.assign', 'ISSUE_REOPENED');
  end if;
  return v_issue.version;
end;
$$;

-- Admin closes a RESOLVED issue without the citizen (reason required).
create or replace function public.close_issue(p_issue_id uuid, p_expected_version int, p_reason text, p_source text default 'ADMIN_WEB')
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_issue public.issues := private.load_issue_for(p_issue_id, 'issue.close');
begin
  perform private.forbid_own_issue(v_issue);
  v_issue := private.apply_transition(p_issue_id, p_expected_version, array['RESOLVED']::public.issue_status[],
    'CLOSED', 'close', private.check_reason(p_reason), jsonb_build_object('closed_without_citizen', true),
    private.check_source(p_source));
  update public.issue_assignments set status = 'COMPLETED', ended_at = now()
   where issue_id = p_issue_id and ended_at is null;
  perform private.notify_followers(p_issue_id, 'ISSUE_CLOSED');
  return v_issue.version;
end;
$$;

-- Admin reopens a RESOLVED or CLOSED issue (citizens use confirm_resolution instead).
create or replace function public.reopen_issue(p_issue_id uuid, p_expected_version int, p_reason text, p_source text default 'ADMIN_WEB')
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_issue public.issues := private.load_issue_for(p_issue_id, 'issue.reopen');
begin
  v_issue := private.apply_transition(p_issue_id, p_expected_version,
    array['RESOLVED', 'CLOSED']::public.issue_status[], 'REOPENED', 'reopen',
    private.check_reason(p_reason), '{}', private.check_source(p_source));
  perform private.notify_followers(p_issue_id, 'ISSUE_REOPENED');
  perform private.notify_assignees(p_issue_id, 'ISSUE_REOPENED');
  return v_issue.version;
end;
$$;

-- ===========================================================================
-- Classification and moderation (no status change; audited)
-- ===========================================================================
create or replace function public.set_issue_priority(p_issue_id uuid, p_expected_version int, p_priority public.issue_priority)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_issue public.issues := private.load_issue_for(p_issue_id, 'issue.set_priority');
begin
  if v_issue.version <> p_expected_version then
    perform private.raise_app_error('MV_CONFLICT', 'issue was changed by someone else, please refresh');
  end if;
  if v_issue.priority = p_priority then
    return v_issue.version;
  end if;
  perform set_config('mana.workflow', 'on', true);
  update public.issues set priority = p_priority, version = version + 1 where id = p_issue_id;
  perform set_config('mana.workflow', 'off', true);
  perform private.write_audit('issue.priority_changed', 'issue', p_issue_id::text, v_issue.village_id,
    jsonb_build_object('priority', v_issue.priority), jsonb_build_object('priority', p_priority));
  return v_issue.version + 1;
end;
$$;

create or replace function public.set_issue_visibility(p_issue_id uuid, p_expected_version int, p_visibility public.issue_visibility)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_issue public.issues := private.load_issue_for(p_issue_id, 'issue.set_visibility');
begin
  if v_issue.version <> p_expected_version then
    perform private.raise_app_error('MV_CONFLICT', 'issue was changed by someone else, please refresh');
  end if;
  if v_issue.visibility = p_visibility then
    return v_issue.version;
  end if;
  perform set_config('mana.workflow', 'on', true);
  update public.issues set visibility = p_visibility, version = version + 1 where id = p_issue_id;
  perform set_config('mana.workflow', 'off', true);
  perform private.write_audit('issue.visibility_changed', 'issue', p_issue_id::text, v_issue.village_id,
    jsonb_build_object('visibility', v_issue.visibility), jsonb_build_object('visibility', p_visibility));
  return v_issue.version + 1;
end;
$$;

create or replace function public.hide_comment(p_comment_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_village uuid;
  v_reason text := private.check_reason(p_reason, 5);
begin
  perform private.require_user();
  select i.village_id into v_village
    from public.issue_comments c join public.issues i on i.id = c.issue_id where c.id = p_comment_id;
  if v_village is null then
    perform private.raise_app_error('MV_NOT_FOUND', 'comment not found');
  end if;
  perform private.require_permission(v_village, 'content.moderate');
  update public.issue_comments
     set is_hidden = true, hidden_by = (select auth.uid()), hidden_at = now(), hidden_reason = v_reason
   where id = p_comment_id and not is_hidden;
  perform private.write_audit('content.comment_hidden', 'issue_comment', p_comment_id::text, v_village,
    null, jsonb_build_object('reason', v_reason));
end;
$$;

create or replace function public.hide_attachment(p_attachment_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_village uuid;
  v_reason text := private.check_reason(p_reason, 5);
begin
  perform private.require_user();
  select i.village_id into v_village
    from public.issue_attachments a join public.issues i on i.id = a.issue_id where a.id = p_attachment_id;
  if v_village is null then
    perform private.raise_app_error('MV_NOT_FOUND', 'photo not found');
  end if;
  perform private.require_permission(v_village, 'content.moderate');
  update public.issue_attachments
     set is_hidden = true, hidden_by = (select auth.uid()), hidden_at = now(), hidden_reason = v_reason
   where id = p_attachment_id and not is_hidden;
  perform private.write_audit('content.attachment_hidden', 'issue_attachment', p_attachment_id::text, v_village,
    null, jsonb_build_object('reason', v_reason));
end;
$$;

-- ===========================================================================
-- Scheduled (pg_cron) — run as SYSTEM (auth.uid() is null)
-- ===========================================================================
create or replace function private.auto_close_resolved()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select i.id, i.version
    from public.issues i
    where i.status = 'RESOLVED'
      and i.last_status_change_at < now() - make_interval(days => private.village_setting_int(i.village_id, 'auto_close_days', 7))
    order by i.last_status_change_at
    limit 500
  loop
    perform private.apply_transition(r.id, r.version, array['RESOLVED']::public.issue_status[], 'CLOSED',
      'auto_close', null, jsonb_build_object('auto_closed', true), 'SYSTEM');
    update public.issue_assignments set status = 'COMPLETED', ended_at = now()
     where issue_id = r.id and ended_at is null;
    perform private.notify_followers(r.id, 'ISSUE_CLOSED');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function private.send_resolution_reminders()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select i.id, i.created_by
    from public.issues i
    where i.status = 'RESOLVED'
      and i.last_status_change_at < now() - make_interval(days => private.village_setting_int(i.village_id, 'reminder_days', 3))
      and not exists (select 1 from public.notifications n
                       where n.issue_id = i.id and n.type = 'RESOLUTION_REMINDER'
                         and n.created_at > i.last_status_change_at)
    limit 1000
  loop
    perform private.notify(r.created_by, r.id, 'RESOLUTION_REMINDER');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
