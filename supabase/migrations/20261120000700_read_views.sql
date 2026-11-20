-- =============================================================================
-- Read views for issues and their records.
--
-- These views run with the owner's rights (security_invoker = false) ON PURPOSE:
-- base tables have no client SELECT grant, and each view applies the visibility
-- rules explicitly via private.can_view_issue / private.can_view_internal.
-- This lets us hide columns per viewer (reporter identity, supporter lists),
-- which RLS alone cannot do. Every view MUST keep its WHERE filter.
-- =============================================================================

-- Staff role of any user in a village (null for plain citizens). Used for labels.
create or replace function private.staff_role_key(p_user_id uuid, p_village_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.key
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = p_user_id
    and ur.revoked_at is null
    and r.key <> 'CITIZEN'
    and (r.scope = 'GLOBAL' or ur.village_id = p_village_id)
  order by case r.key
             when 'PRESIDENT' then 1 when 'VICE_PRESIDENT' then 2 when 'SECRETARY' then 3
             when 'WORKER' then 4 when 'SUPER_ADMIN' then 5 else 6 end
  limit 1;
$$;

-- Name shown to the current viewer for a person acting on an issue.
-- Staff are always named (accountability). Citizens are named only to staff and to
-- themselves; everyone else sees null and the app shows "A resident".
create or replace function private.person_label(p_user_id uuid, p_village_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_user_id is null then null
    when p_user_id = (select auth.uid())
      or private.staff_role_key(p_user_id, p_village_id) is not null
      or private.is_village_staff(p_village_id)
      then (select coalesce(u.display_name, u.full_name) from public.users u where u.id = p_user_id)
    else null
  end;
$$;

create view public.issues_view with (security_invoker = false) as
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
where private.can_view_issue(i.id);

create view public.issue_comments_view with (security_invoker = false) as
select
  cm.id,
  cm.issue_id,
  cm.visibility,
  case when cm.is_hidden then null else cm.body end as body,
  cm.is_hidden,
  case when private.is_village_staff(i.village_id) then cm.hidden_reason end as hidden_reason,
  cm.created_at,
  (cm.author_id = (select auth.uid())) as is_mine,
  private.person_label(cm.author_id, i.village_id) as author_name,
  private.staff_role_key(cm.author_id, i.village_id) as author_role_key
from public.issue_comments cm
join public.issues i on i.id = cm.issue_id
where private.can_view_issue(cm.issue_id)
  and (cm.visibility = 'PUBLIC' or private.can_view_internal(cm.issue_id))
  and (not cm.is_hidden or private.is_village_staff(i.village_id));

create view public.issue_attachments_view with (security_invoker = false) as
select
  a.id,
  a.issue_id,
  a.kind,
  a.visibility,
  a.storage_path,
  a.mime_type,
  a.size_bytes,
  a.width,
  a.height,
  a.status_at_upload,
  a.created_at,
  a.is_hidden,
  (a.uploaded_by = (select auth.uid())) as is_mine,
  private.person_label(a.uploaded_by, i.village_id) as uploaded_by_name,
  private.staff_role_key(a.uploaded_by, i.village_id) as uploaded_by_role_key
from public.issue_attachments a
join public.issues i on i.id = a.issue_id
where private.can_view_issue(a.issue_id)
  and (a.visibility = 'PUBLIC' or private.can_view_internal(a.issue_id))
  and (not a.is_hidden or private.is_village_staff(i.village_id));

-- Unified, ordered timeline. One row per event.
-- event_type: STATUS_CHANGED | ASSIGNMENT_ACCEPTED | ATTACHMENT_ADDED | COMMENT_ADDED
create view public.issue_timeline_view with (security_invoker = false) as
with events as (
  select h.issue_id, h.created_at as occurred_at, 'STATUS_CHANGED'::text as event_type,
         h.actor_user_id, h.actor_role_key,
         h.from_status, h.to_status, h.reason,
         h.metadata, 'PUBLIC'::public.content_visibility as visibility, h.id::text as source_id
  from public.issue_status_history h
  union all
  select a.issue_id, a.responded_at, 'ASSIGNMENT_ACCEPTED', a.assignee_user_id, 'WORKER',
         null, null, a.response_note,
         jsonb_build_object('assignment_id', a.id, 'department_id', a.department_id),
         'PUBLIC', a.id::text
  from public.issue_assignments a
  where a.responded_at is not null and a.status in ('ACCEPTED', 'COMPLETED', 'SUPERSEDED')
  union all
  select t.issue_id, t.created_at, 'ATTACHMENT_ADDED', t.uploaded_by, null,
         null, null, null,
         jsonb_build_object('attachment_id', t.id, 'kind', t.kind),
         t.visibility, t.id::text
  from public.issue_attachments t
  where not t.is_hidden
  union all
  select c.issue_id, c.created_at, 'COMMENT_ADDED', c.author_id, null,
         null, null, null,
         jsonb_build_object('comment_id', c.id),
         c.visibility, c.id::text
  from public.issue_comments c
  where not c.is_hidden
)
select
  e.issue_id,
  e.occurred_at,
  e.event_type,
  e.from_status,
  e.to_status,
  e.reason,
  e.metadata,
  e.visibility,
  e.source_id,
  coalesce(e.actor_role_key, private.staff_role_key(e.actor_user_id, i.village_id)) as actor_role_key,
  private.person_label(e.actor_user_id, i.village_id) as actor_name,
  (e.actor_user_id = (select auth.uid())) as is_mine,
  (e.actor_user_id is null) as is_system
from events e
join public.issues i on i.id = e.issue_id
where private.can_view_issue(e.issue_id)
  and (e.visibility = 'PUBLIC' or private.can_view_internal(e.issue_id));

revoke all on public.issues_view, public.issue_comments_view, public.issue_attachments_view, public.issue_timeline_view from anon, public;
grant select on public.issues_view, public.issue_comments_view, public.issue_attachments_view, public.issue_timeline_view to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.has_permission(uuid, text),
  private.is_assignee(uuid),
  private.can_view_issue(uuid),
  private.can_view_internal(uuid),
  private.is_village_staff(uuid)
to authenticated;
