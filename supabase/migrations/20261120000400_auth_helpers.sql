-- =============================================================================
-- Authorization, audit and notification helpers (schema `private`, not exposed via API).
--
-- All SECURITY DEFINER functions: search_path = '' and fully qualified names.
-- They bypass RLS on purpose (to read user_roles etc. without policy recursion),
-- so each one only ever answers questions about the CURRENT user (auth.uid()).
-- =============================================================================

-- True if the current user is ACTIVE and holds a non-revoked role, in that village
-- (or a GLOBAL role), that includes the permission.
create or replace function private.has_permission(p_village_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    join public.user_roles ur on ur.user_id = u.id and ur.revoked_at is null
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = r.id
    where u.id = (select auth.uid())
      and u.status = 'ACTIVE'
      and rp.permission_key = p_permission
      and (r.scope = 'GLOBAL' or ur.village_id = p_village_id)
  );
$$;

-- Role key to record in history/audit as "acting as". Highest-ranked active role.
create or replace function private.acting_role_key(p_village_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.key
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = (select auth.uid())
    and ur.revoked_at is null
    and (r.scope = 'GLOBAL' or ur.village_id = p_village_id)
  order by case r.key
             when 'PRESIDENT' then 1 when 'VICE_PRESIDENT' then 2 when 'SECRETARY' then 3
             when 'WORKER' then 4 when 'SUPER_ADMIN' then 5 when 'CITIZEN' then 6 else 7 end
  limit 1;
$$;

-- True if the current user is the active assignee of the issue, or (when no person is
-- assigned) an active WORKER of the assigned department. Requires `issue.work`.
create or replace function private.is_assignee(p_issue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.issue_assignments a
    join public.issues i on i.id = a.issue_id
    where a.issue_id = p_issue_id
      and a.ended_at is null
      and private.has_permission(i.village_id, 'issue.work')
      and (
        a.assignee_user_id = (select auth.uid())
        or (
          a.assignee_user_id is null
          and exists (
            select 1
            from public.user_roles ur
            join public.roles r on r.id = ur.role_id and r.key = 'WORKER'
            where ur.user_id = (select auth.uid())
              and ur.revoked_at is null
              and ur.department_id = a.department_id
          )
        )
      )
  );
$$;

-- Single source of truth for "may the current user see this issue at all".
create or replace function private.can_view_issue(p_issue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.issues i
    where i.id = p_issue_id
      and (
        (i.created_by = (select auth.uid()) and private.has_permission(i.village_id, 'issue.view_own'))
        or (i.visibility = 'PUBLIC' and private.has_permission(i.village_id, 'issue.view_public'))
        or private.has_permission(i.village_id, 'issue.view_all')
        or private.is_assignee(i.id)
      )
  );
$$;

-- May the current user see INTERNAL comments/attachments of this issue?
create or replace function private.can_view_internal(p_issue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.issues i
    where i.id = p_issue_id
      and (private.has_permission(i.village_id, 'issue.view_internal') or private.is_assignee(i.id))
  );
$$;

-- Is the current user a staff member (holds view_all) in the village?
create or replace function private.is_village_staff(p_village_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission(p_village_id, 'issue.view_all');
$$;

create or replace function private.village_setting_int(p_village_id uuid, p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (v.settings ->> p_key)::int from public.villages v where v.id = p_village_id), p_default);
$$;

-- ---------------------------------------------------------------------------
-- Audit log writer. Called from workflow functions and triggers.
-- ---------------------------------------------------------------------------
create or replace function private.write_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   text,
  p_village_id  uuid,
  p_before      jsonb default null,
  p_after       jsonb default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_user_id, actor_role_key, village_id, action, entity_type, entity_id, before, after, metadata)
  values (
    (select auth.uid()),
    case when (select auth.uid()) is null then 'SYSTEM' else private.acting_role_key(p_village_id) end,
    p_village_id, p_action, p_entity_type, p_entity_id, p_before, p_after, coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications. Title is localized at insert time in the recipient's language.
-- NOTE: Telugu strings must be reviewed by a native speaker before launch.
-- ---------------------------------------------------------------------------
create or replace function private.notification_title(p_type text, p_lang text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_lang = 'te' then case p_type
      when 'ISSUE_NEEDS_REVIEW'          then 'కొత్త సమస్య నమోదైంది'
      when 'ISSUE_UNDER_REVIEW'          then 'మీ సమస్యను పరిశీలిస్తున్నారు'
      when 'ISSUE_VERIFIED'              then 'సమస్య ధృవీకరించబడింది'
      when 'ISSUE_REJECTED'              then 'మీ సమస్య తిరస్కరించబడింది'
      when 'ISSUE_DUPLICATE'             then 'ఈ సమస్య ఇప్పటికే నమోదైంది'
      when 'ISSUE_ASSIGNED'              then 'పని అప్పగించబడింది'
      when 'WORK_ASSIGNED_TO_YOU'        then 'మీకు కొత్త పని అప్పగించబడింది'
      when 'ASSIGNMENT_DECLINED'         then 'పని తిరస్కరించబడింది'
      when 'WORK_STARTED'                then 'పని ప్రారంభమైంది'
      when 'RESOLUTION_CONFIRM_REQUEST'  then 'ఈ సమస్య నిజంగా పరిష్కరించబడిందా?'
      when 'RESOLUTION_REMINDER'         then 'గుర్తు: ఈ సమస్య పరిష్కరించబడిందా?'
      when 'ISSUE_CLOSED'                then 'సమస్య ముగించబడింది'
      when 'ISSUE_REOPENED'              then 'సమస్య మళ్లీ తెరవబడింది'
      when 'ISSUE_RECONSIDERED'          then 'సమస్యను మళ్లీ పరిశీలిస్తున్నారు'
      else 'మన విలేజ్ అప్‌డేట్'
    end
    else case p_type
      when 'ISSUE_NEEDS_REVIEW'          then 'New issue reported'
      when 'ISSUE_UNDER_REVIEW'          then 'Your issue is being checked'
      when 'ISSUE_VERIFIED'              then 'Issue verified'
      when 'ISSUE_REJECTED'              then 'Your issue was rejected'
      when 'ISSUE_DUPLICATE'             then 'This issue was already reported'
      when 'ISSUE_ASSIGNED'              then 'Work assigned'
      when 'WORK_ASSIGNED_TO_YOU'        then 'New work assigned to you'
      when 'ASSIGNMENT_DECLINED'         then 'Assignment declined'
      when 'WORK_STARTED'                then 'Work started'
      when 'RESOLUTION_CONFIRM_REQUEST'  then 'Was this problem actually solved?'
      when 'RESOLUTION_REMINDER'         then 'Reminder: was this problem solved?'
      when 'ISSUE_CLOSED'                then 'Issue closed'
      when 'ISSUE_REOPENED'              then 'Issue reopened'
      when 'ISSUE_RECONSIDERED'          then 'Issue is being reviewed again'
      else 'Mana Village update'
    end
  end;
$$;

create or replace function private.notify(p_recipient_id uuid, p_issue_id uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issue public.issues;
  v_lang text;
  v_route text;
begin
  select * into v_issue from public.issues where id = p_issue_id;
  select preferred_language into v_lang from public.users where id = p_recipient_id and status = 'ACTIVE';
  if v_lang is null then
    return; -- suspended/deleted users get nothing
  end if;
  v_route := case p_type
               when 'RESOLUTION_CONFIRM_REQUEST' then '/issue/' || p_issue_id || '/confirm'
               when 'RESOLUTION_REMINDER' then '/issue/' || p_issue_id || '/confirm'
               when 'WORK_ASSIGNED_TO_YOU' then '/work/' || p_issue_id
               else '/issue/' || p_issue_id
             end;
  insert into public.notifications (recipient_id, village_id, type, issue_id, title, body, data)
  values (
    p_recipient_id, v_issue.village_id, p_type, p_issue_id,
    private.notification_title(p_type, v_lang),
    v_issue.issue_number || ' · ' || v_issue.title,
    jsonb_build_object('route', v_route, 'issue_id', p_issue_id, 'issue_number', v_issue.issue_number)
  );
end;
$$;

-- Reporter + supporters (people following the issue), except the actor.
create or replace function private.notify_followers(p_issue_id uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select i.created_by as user_id from public.issues i where i.id = p_issue_id
    union
    select s.user_id from public.issue_supporters s where s.issue_id = p_issue_id
  loop
    if r.user_id is distinct from (select auth.uid()) then
      perform private.notify(r.user_id, p_issue_id, p_type);
    end if;
  end loop;
end;
$$;

-- Everyone in the issue's village who holds a permission (e.g. reviewers), except the actor.
create or replace function private.notify_permission_holders(p_issue_id uuid, p_permission text, p_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select distinct ur.user_id
    from public.issues i
    join public.user_roles ur on ur.village_id = i.village_id and ur.revoked_at is null
    join public.role_permissions rp on rp.role_id = ur.role_id and rp.permission_key = p_permission
    join public.roles ro on ro.id = ur.role_id and ro.scope = 'VILLAGE'
    where i.id = p_issue_id
  loop
    if r.user_id is distinct from (select auth.uid()) then
      perform private.notify(r.user_id, p_issue_id, p_type);
    end if;
  end loop;
end;
$$;

-- The current assignee, or all workers of the assigned department if no person is set.
create or replace function private.notify_assignees(p_issue_id uuid, p_type text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select a.assignee_user_id as user_id
    from public.issue_assignments a
    where a.issue_id = p_issue_id and a.ended_at is null and a.assignee_user_id is not null
    union
    select ur.user_id
    from public.issue_assignments a
    join public.user_roles ur on ur.department_id = a.department_id and ur.revoked_at is null
    join public.roles ro on ro.id = ur.role_id and ro.key = 'WORKER'
    where a.issue_id = p_issue_id and a.ended_at is null and a.assignee_user_id is null
  loop
    if r.user_id is distinct from (select auth.uid()) then
      perform private.notify(r.user_id, p_issue_id, p_type);
    end if;
  end loop;
end;
$$;

-- Lock down: nothing in `private` is callable by anon; authenticated may call only the
-- read-only predicates that RLS policies need.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.has_permission(uuid, text),
  private.is_assignee(uuid),
  private.can_view_issue(uuid),
  private.can_view_internal(uuid),
  private.is_village_staff(uuid)
to authenticated;
