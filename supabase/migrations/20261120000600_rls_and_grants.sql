-- =============================================================================
-- Row Level Security and grants. See docs/security.md §3.
--
-- Model:
--   * anon: no access to any table.
--   * authenticated: SELECT on reference/config tables (filtered by RLS);
--     issues and their child tables are NOT directly readable: clients read them
--     through the *_view views (next migration), which apply private.can_view_issue()
--     and hide reporter identity / supporter lists / internal content.
--   * All writes go through SECURITY DEFINER functions (workflow migration),
--     except marking own notifications as read.
-- =============================================================================

-- Enable RLS on every table (even those with no client grants: defense in depth).
alter table public.villages              enable row level security;
alter table public.users                 enable row level security;
alter table public.roles                 enable row level security;
alter table public.permissions           enable row level security;
alter table public.role_permissions      enable row level security;
alter table public.departments           enable row level security;
alter table public.user_roles            enable row level security;
alter table public.issue_categories      enable row level security;
alter table public.issue_number_counters enable row level security;
alter table public.issues                enable row level security;
alter table public.issue_assignments     enable row level security;
alter table public.issue_status_history  enable row level security;
alter table public.issue_comments        enable row level security;
alter table public.issue_attachments     enable row level security;
alter table public.issue_supporters      enable row level security;
alter table public.notifications         enable row level security;
alter table public.push_tokens           enable row level security;
alter table public.announcements         enable row level security;
alter table public.audit_logs            enable row level security;

-- Remove Supabase's default broad grants, then grant explicitly.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant select on
  public.villages, public.roles, public.permissions, public.role_permissions,
  public.departments, public.issue_categories, public.user_roles,
  public.notifications, public.push_tokens, public.announcements, public.audit_logs
to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- villages ------------------------------------------------------------------
create policy villages_select on public.villages for select to authenticated
  using (is_active or (select private.has_permission(id, 'village.manage')));

-- roles / permissions: readable catalog -------------------------------------
create policy roles_select on public.roles for select to authenticated using (true);
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);

-- departments ---------------------------------------------------------------
create policy departments_select on public.departments for select to authenticated
  using ((select private.has_permission(village_id, 'issue.view_public'))
         or (select private.has_permission(village_id, 'department.manage')));

-- issue categories ----------------------------------------------------------
create policy issue_categories_select on public.issue_categories for select to authenticated
  using (is_active or (select private.has_permission(null, 'category.manage')));

-- user_roles: own grants, plus people who manage users/roles in that village --
create policy user_roles_select on public.user_roles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (village_id is not null and (
         (select private.has_permission(village_id, 'user.manage'))
      or (select private.has_permission(village_id, 'role.assign_worker'))
      or (select private.has_permission(village_id, 'role.assign_admin'))))
    or (village_id is null and (select private.has_permission(null, 'role.assign_admin')))
  );

-- notifications: only the recipient; may only set read_at --------------------
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- push tokens: own (writes via register_push_token / revoke_push_token) -------
create policy push_tokens_select on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));

-- announcements -------------------------------------------------------------
create policy announcements_select on public.announcements for select to authenticated
  using (
    (status = 'PUBLISHED' and (expires_at is null or expires_at > now())
      and (select private.has_permission(village_id, 'issue.view_public')))
    or (select private.has_permission(village_id, 'announcement.manage'))
  );

-- audit logs ----------------------------------------------------------------
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    (village_id is not null and (select private.has_permission(village_id, 'audit.view')))
    or (village_id is null and (select private.has_permission(null, 'audit.view')))
  );

-- No policies (= no access) for: users, issue_number_counters, issues, issue_assignments,
-- issue_status_history, issue_comments, issue_attachments, issue_supporters.
-- Those are read via views and written via functions only.
