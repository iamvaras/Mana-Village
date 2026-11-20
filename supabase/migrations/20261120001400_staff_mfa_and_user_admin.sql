-- =============================================================================
-- Phase 3: staff MFA enforcement, role grant/revoke, user suspension,
-- audited phone reveal, user listing for admins.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- MFA: permissions of roles that require MFA count ONLY when the session has
-- completed a second factor (JWT aal = 'aal2'). Enforced in the database, so a
-- staff member signed in with OTP only (e.g. on a phone) acts as a citizen.
-- ---------------------------------------------------------------------------
alter table public.roles add column requires_mfa boolean not null default false;
update public.roles set requires_mfa = true where key in ('PRESIDENT', 'VICE_PRESIDENT', 'SECRETARY', 'SUPER_ADMIN');

create or replace function private.session_is_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2';
$$;

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
      and (not r.requires_mfa or private.session_is_aal2())
  );
$$;

create or replace function public.get_my_permissions(p_village_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct rp.permission_key order by rp.permission_key), '{}')
  from public.users u
  join public.user_roles ur on ur.user_id = u.id and ur.revoked_at is null
  join public.roles r on r.id = ur.role_id
  join public.role_permissions rp on rp.role_id = r.id
  where u.id = (select auth.uid())
    and u.status = 'ACTIVE'
    and (r.scope = 'GLOBAL' or ur.village_id = p_village_id)
    and (not r.requires_mfa or private.session_is_aal2());
$$;

-- Roles held by the current user and whether each needs MFA (for the admin web
-- to decide whether to ask for the security code). Informational only.
create or replace function public.get_my_roles()
returns table (role_key text, village_id uuid, village_name text, department_id uuid, requires_mfa boolean, active_now boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select r.key, ur.village_id, v.name, ur.department_id, r.requires_mfa,
         (not r.requires_mfa or private.session_is_aal2())
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  left join public.villages v on v.id = ur.village_id
  join public.users u on u.id = ur.user_id and u.status = 'ACTIVE'
  where ur.user_id = (select auth.uid()) and ur.revoked_at is null
  order by r.key;
$$;

-- ---------------------------------------------------------------------------
-- Which permission is needed to grant/revoke a role.
-- ---------------------------------------------------------------------------
create or replace function private.require_role_admin(p_role_key text, p_village_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_role_key = 'CITIZEN' then
    perform private.raise_app_error('MV_VALIDATION', 'the citizen role is managed automatically');
  elsif p_role_key = 'WORKER' then
    perform private.require_permission(p_village_id, 'role.assign_worker');
  elsif p_role_key = 'SUPER_ADMIN' then
    perform private.require_permission(null, 'role.assign_admin');
    if not exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                    where ur.user_id = (select auth.uid()) and ur.revoked_at is null and r.key = 'SUPER_ADMIN') then
      perform private.raise_app_error('MV_FORBIDDEN', 'only a super admin can grant super admin');
    end if;
  else
    perform private.require_permission(p_village_id, 'role.assign_admin');
  end if;
end;
$$;

create or replace function public.grant_role(
  p_user_id uuid, p_role_key text, p_village_id uuid default null,
  p_department_id uuid default null, p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_role public.roles;
  v_id uuid;
begin
  select * into v_role from public.roles where key = p_role_key;
  if not found then
    perform private.raise_app_error('MV_VALIDATION', 'unknown role');
  end if;
  perform private.require_role_admin(p_role_key, p_village_id);
  if p_user_id = v_uid then
    perform private.raise_app_error('MV_FORBIDDEN', 'you cannot change your own roles');
  end if;
  if not exists (select 1 from public.users where id = p_user_id and status = 'ACTIVE') then
    perform private.raise_app_error('MV_VALIDATION', 'user not found or not active');
  end if;
  if exists (select 1 from public.user_roles
              where user_id = p_user_id and role_id = v_role.id and revoked_at is null
                and village_id is not distinct from p_village_id) then
    perform private.raise_app_error('MV_VALIDATION', 'user already has this role');
  end if;

  insert into public.user_roles (user_id, role_id, village_id, department_id, granted_by)
  values (p_user_id, v_role.id, p_village_id, p_department_id, v_uid)
  returning id into v_id;
  perform private.write_audit('user.role_granted', 'user', p_user_id::text, p_village_id, null,
    jsonb_build_object('role', p_role_key, 'department_id', p_department_id, 'user_role_id', v_id),
    jsonb_build_object('reason', p_reason));
  return v_id;
end;
$$;

create or replace function public.revoke_role(p_user_role_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_grant public.user_roles;
  v_role_key text;
  v_reason text := private.check_reason(p_reason, 5);
begin
  select * into v_grant from public.user_roles where id = p_user_role_id and revoked_at is null;
  if not found then
    perform private.raise_app_error('MV_NOT_FOUND', 'role grant not found');
  end if;
  select key into v_role_key from public.roles where id = v_grant.role_id;
  perform private.require_role_admin(v_role_key, v_grant.village_id);
  if v_grant.user_id = v_uid then
    perform private.raise_app_error('MV_FORBIDDEN', 'you cannot change your own roles');
  end if;
  update public.user_roles set revoked_at = now(), revoked_by = v_uid, revoke_reason = v_reason
   where id = p_user_role_id;
  perform private.write_audit('user.role_revoked', 'user', v_grant.user_id::text, v_grant.village_id,
    jsonb_build_object('role', v_role_key, 'user_role_id', p_user_role_id), null,
    jsonb_build_object('reason', v_reason));
end;
$$;

-- Suspend / reactivate (user.manage in the user's home village, or global).
create or replace function public.set_user_status(p_user_id uuid, p_status public.user_status, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_user public.users;
  v_reason text := private.check_reason(p_reason, 5);
begin
  if p_status not in ('ACTIVE', 'SUSPENDED') then
    perform private.raise_app_error('MV_VALIDATION', 'status must be ACTIVE or SUSPENDED');
  end if;
  select * into v_user from public.users where id = p_user_id;
  if not found or v_user.status = 'DELETED' then
    perform private.raise_app_error('MV_NOT_FOUND', 'user not found');
  end if;
  perform private.require_permission(v_user.home_village_id, 'user.manage');
  if p_user_id = v_uid then
    perform private.raise_app_error('MV_FORBIDDEN', 'you cannot change your own status');
  end if;
  update public.users set status = p_status where id = p_user_id;
  perform private.write_audit('user.status_changed', 'user', p_user_id::text, v_user.home_village_id,
    jsonb_build_object('status', v_user.status), jsonb_build_object('status', p_status),
    jsonb_build_object('reason', v_reason));
end;
$$;

-- Reveal a citizen's phone number. Every call is audited.
create or replace function public.admin_get_user_contact(p_user_id uuid, p_issue_id uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_village uuid;
  v_phone text;
begin
  perform private.require_user();
  -- Scope: the village of the related issue, otherwise the user's home village.
  if p_issue_id is not null then
    select village_id into v_village from public.issues where id = p_issue_id and created_by = p_user_id;
  end if;
  if v_village is null then
    select home_village_id into v_village from public.users where id = p_user_id;
  end if;
  if v_village is null then
    perform private.raise_app_error('MV_NOT_FOUND', 'user not found');
  end if;
  perform private.require_permission(v_village, 'user.view_contact');
  select phone into v_phone from auth.users where id = p_user_id;
  perform private.write_audit('user.contact_viewed', 'user', p_user_id::text, v_village, null, null,
    jsonb_build_object('issue_id', p_issue_id));
  return v_phone;
end;
$$;

-- Users of a village with their active roles (for Users / Workers screens).
create or replace function public.admin_list_users(
  p_village_id uuid, p_search text default null, p_role_key text default null,
  p_limit int default 50, p_offset int default 0
)
returns table (
  id uuid, full_name text, display_name text, status public.user_status, created_at timestamptz, roles jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  if not (private.has_permission(p_village_id, 'user.manage')
          or private.has_permission(p_village_id, 'role.assign_worker')
          or private.has_permission(p_village_id, 'role.assign_admin')) then
    perform private.raise_app_error('MV_FORBIDDEN', 'missing permission user.manage');
  end if;
  return query
    select u.id, u.full_name, u.display_name, u.status, u.created_at,
           coalesce((select jsonb_agg(jsonb_build_object('user_role_id', ur.id, 'role', r.key,
                                                         'department_id', ur.department_id, 'granted_at', ur.granted_at)
                                      order by r.key)
                       from public.user_roles ur join public.roles r on r.id = ur.role_id
                      where ur.user_id = u.id and ur.revoked_at is null and ur.village_id = p_village_id), '[]'::jsonb)
    from public.users u
    where u.status <> 'DELETED'
      and exists (select 1 from public.user_roles ur where ur.user_id = u.id and ur.village_id = p_village_id and ur.revoked_at is null)
      and (p_search is null or u.full_name ilike '%' || p_search || '%' or u.display_name ilike '%' || p_search || '%')
      and (p_role_key is null or exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                                         where ur.user_id = u.id and ur.village_id = p_village_id
                                           and ur.revoked_at is null and r.key = p_role_key))
    order by u.full_name
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

-- Re-grant the full client allow-list (unchanged from 001300) plus the new functions.
grant execute on function
  public.complete_profile(text, uuid, text, text),
  public.get_my_profile(),
  public.change_home_village(uuid),
  public.get_my_permissions(uuid),
  public.get_my_roles(),
  public.create_issue(uuid, uuid, text, uuid, text, text, numeric, numeric, numeric, public.issue_visibility, jsonb, text),
  public.edit_my_issue(uuid, int, text, text, text),
  public.find_similar_issues(uuid, uuid, numeric, numeric, int),
  public.support_issue(uuid),
  public.unsupport_issue(uuid),
  public.add_comment(uuid, text, public.content_visibility),
  public.add_issue_photos(uuid, public.attachment_kind, jsonb, public.content_visibility),
  public.register_push_token(text, text, text),
  public.revoke_push_token(text),
  public.mark_all_notifications_read(),
  public.start_review(uuid, int, text),
  public.verify_issue(uuid, int, public.issue_priority, text, text),
  public.reject_issue(uuid, int, text, text),
  public.mark_duplicate(uuid, int, uuid, text, text),
  public.reconsider_issue(uuid, int, text, text),
  public.assign_issue(uuid, int, uuid, uuid, text, timestamptz, text, text),
  public.accept_assignment(uuid),
  public.decline_assignment(uuid, int, text, text),
  public.start_work(uuid, int, text),
  public.add_progress_update(uuid, text, jsonb),
  public.resolve_issue(uuid, int, text, jsonb, text),
  public.confirm_resolution(uuid, int, boolean, text, jsonb, text),
  public.close_issue(uuid, int, text, text),
  public.reopen_issue(uuid, int, text, text),
  public.set_issue_priority(uuid, int, public.issue_priority),
  public.set_issue_visibility(uuid, int, public.issue_visibility),
  public.hide_comment(uuid, text),
  public.hide_attachment(uuid, text),
  public.dashboard_stats(uuid, timestamptz, timestamptz),
  public.issues_by_category(uuid, timestamptz, timestamptz),
  public.issues_by_department(uuid, timestamptz, timestamptz),
  public.grant_role(uuid, text, uuid, uuid, text),
  public.revoke_role(uuid, text),
  public.set_user_status(uuid, public.user_status, text),
  public.admin_get_user_contact(uuid, uuid),
  public.admin_list_users(uuid, text, text, int, int)
to authenticated;

grant execute on function
  private.has_permission(uuid, text),
  private.is_assignee(uuid),
  private.can_view_issue(uuid),
  private.can_view_internal(uuid),
  private.is_village_staff(uuid),
  private.is_active_user(),
  private.can_read_attachment_object(text),
  private.person_label(uuid, uuid),
  private.staff_role_key(uuid, uuid),
  private.session_is_aal2()
to authenticated;
