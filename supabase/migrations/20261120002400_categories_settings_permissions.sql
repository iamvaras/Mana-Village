-- =============================================================================
-- Phase 11 (part 3): categories, village settings, role permissions
-- (docs/api.md §Administration, docs/ui-ux.md admin 10 and 14).
--
-- Writes go through these functions only. Every change is audited by the
-- existing triggers on issue_categories, villages and role_permissions.
-- Categories and roles are shared by all villages, so editing them needs a
-- platform (Super Admin) permission; village settings need settings.manage
-- for that village.
-- =============================================================================

-- Categories -----------------------------------------------------------------
create or replace function public.upsert_category(
  p_key              text,
  p_name             text,
  p_name_local       text default null,
  p_icon             text default null,
  p_default_priority public.issue_priority default null,
  p_sort_order       int default 0,
  p_photo_required   boolean default true,
  p_id               uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := upper(btrim(coalesce(p_key, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_local text := nullif(btrim(coalesce(p_name_local, '')), '');
  v_icon text := nullif(btrim(coalesce(p_icon, '')), '');
  v_id uuid;
begin
  perform private.require_user();
  perform private.require_permission(null, 'category.manage');

  if char_length(v_name) not between 2 and 60 then
    perform private.raise_app_error('MV_VALIDATION', 'name must be 2-60 characters');
  end if;
  if v_local is not null and char_length(v_local) > 60 then
    perform private.raise_app_error('MV_VALIDATION', 'Telugu name must be at most 60 characters');
  end if;
  if v_icon is not null and v_icon !~ '^[a-z0-9_-]{1,60}$' then
    perform private.raise_app_error('MV_VALIDATION', 'icon must be a short lowercase name');
  end if;
  if coalesce(p_sort_order, 0) not between 0 and 10000 then
    perform private.raise_app_error('MV_VALIDATION', 'order must be 0-10000');
  end if;
  if exists (select 1 from public.issue_categories
              where lower(name) = lower(v_name) and (p_id is null or id <> p_id)) then
    perform private.raise_app_error('MV_VALIDATION', 'a category with this name already exists');
  end if;

  if p_id is null then
    if v_key !~ '^[A-Z_]{2,40}$' then
      perform private.raise_app_error('MV_VALIDATION', 'code must be 2-40 capital letters or _');
    end if;
    if exists (select 1 from public.issue_categories where key = v_key) then
      perform private.raise_app_error('MV_VALIDATION', 'a category with this code already exists');
    end if;
    insert into public.issue_categories (key, name, name_local, icon, default_priority, sort_order, photo_required)
    values (v_key, v_name, v_local, v_icon, p_default_priority, coalesce(p_sort_order, 0), coalesce(p_photo_required, true))
    returning id into v_id;
  else
    -- The code is fixed once created (reports and analytics refer to it).
    update public.issue_categories
       set name = v_name, name_local = v_local, icon = v_icon, default_priority = p_default_priority,
           sort_order = coalesce(p_sort_order, 0), photo_required = coalesce(p_photo_required, true)
     where id = p_id
    returning id into v_id;
    if v_id is null then
      perform private.raise_app_error('MV_NOT_FOUND', 'category not found');
    end if;
  end if;
  return v_id;
end;
$$;

-- Hidden categories stay on old issues but cannot be picked for new reports.
create or replace function public.set_category_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current boolean;
begin
  perform private.require_user();
  perform private.require_permission(null, 'category.manage');
  select is_active into v_current from public.issue_categories where id = p_id for update;
  if not found then
    perform private.raise_app_error('MV_NOT_FOUND', 'category not found');
  end if;
  if v_current = coalesce(p_active, false) then
    return;
  end if;
  if not coalesce(p_active, false)
     and (select count(*) from public.issue_categories where is_active) <= 1 then
    perform private.raise_app_error('MV_VALIDATION', 'at least one category must stay active');
  end if;
  update public.issue_categories set is_active = coalesce(p_active, false) where id = p_id;
end;
$$;

-- Village settings -----------------------------------------------------------
-- Known keys only (see the comment on villages.settings). Missing keys keep
-- their current value; null removes the key so the default applies again.
create or replace function public.update_village_settings(p_village_id uuid, p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current jsonb;
  v_next jsonb;
  v_key text;
  v_auto int;
  v_remind int;
begin
  perform private.require_user();
  perform private.require_permission(p_village_id, 'settings.manage');
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    perform private.raise_app_error('MV_VALIDATION', 'settings must be an object');
  end if;
  for v_key in select jsonb_object_keys(p_settings) loop
    if v_key not in ('auto_close_days', 'reminder_days', 'default_issue_visibility',
                     'max_issues_per_user_per_day', 'similar_issue_radius_m') then
      perform private.raise_app_error('MV_VALIDATION', 'unknown setting ' || v_key);
    end if;
    if jsonb_typeof(p_settings -> v_key) = 'null' then
      continue;
    end if;
    if v_key = 'default_issue_visibility' then
      if (p_settings ->> v_key) not in ('PUBLIC', 'PRIVATE') then
        perform private.raise_app_error('MV_VALIDATION', 'default visibility must be PUBLIC or PRIVATE');
      end if;
    elsif jsonb_typeof(p_settings -> v_key) <> 'number' or (p_settings ->> v_key) !~ '^\d+$' then
      perform private.raise_app_error('MV_VALIDATION', v_key || ' must be a whole number');
    end if;
  end loop;

  select settings into v_current from public.villages where id = p_village_id for update;
  if not found then
    perform private.raise_app_error('MV_NOT_FOUND', 'village not found');
  end if;
  v_next := jsonb_strip_nulls(v_current || p_settings);

  v_auto := coalesce((v_next ->> 'auto_close_days')::int, 7);
  v_remind := coalesce((v_next ->> 'reminder_days')::int, 3);
  if v_auto not between 3 and 30 then
    perform private.raise_app_error('MV_VALIDATION', 'auto-close must be 3-30 days');
  end if;
  if v_remind < 1 or v_remind >= v_auto then
    perform private.raise_app_error('MV_VALIDATION', 'the reminder must come at least 1 day before auto-close');
  end if;
  if coalesce((v_next ->> 'max_issues_per_user_per_day')::int, 10) not between 1 and 50 then
    perform private.raise_app_error('MV_VALIDATION', 'daily report limit must be 1-50');
  end if;
  if coalesce((v_next ->> 'similar_issue_radius_m')::int, 200) not between 50 and 1000 then
    perform private.raise_app_error('MV_VALIDATION', 'nearby distance must be 50-1000 metres');
  end if;

  update public.villages set settings = v_next where id = p_village_id;
  return v_next;
end;
$$;

-- Role permissions -----------------------------------------------------------
-- Replaces the permission list of one role (roles are shared by all villages).
-- Super Admin's own role cannot be edited here, so nobody can lock the
-- platform out; platform permissions stay with global roles; citizen-safe
-- rules are also enforced by the existing role_permissions trigger.
create or replace function public.set_role_permissions(p_role_key text, p_permission_keys text[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_role public.roles;
  v_keys text[] := coalesce(array(select distinct unnest(p_permission_keys)), '{}');
  v_bad text;
  v_changed int := 0;
  v_n int;
begin
  perform private.require_permission(null, 'permission.manage');
  select * into v_role from public.roles where key = p_role_key;
  if not found then
    perform private.raise_app_error('MV_NOT_FOUND', 'role not found');
  end if;
  if v_role.key = 'SUPER_ADMIN' then
    perform private.raise_app_error('MV_FORBIDDEN', 'the Super Admin role cannot be edited');
  end if;
  select k into v_bad from unnest(v_keys) k where not exists (select 1 from public.permissions p where p.key = k) limit 1;
  if v_bad is not null then
    perform private.raise_app_error('MV_VALIDATION', 'unknown permission ' || v_bad);
  end if;
  if v_role.scope = 'VILLAGE' then
    select k into v_bad from unnest(v_keys) k
      join public.permissions p on p.key = k where p.category = 'platform' limit 1;
    if v_bad is not null then
      perform private.raise_app_error('MV_VALIDATION', v_bad || ' is for platform roles only');
    end if;
  end if;
  if v_role.key = 'CITIZEN' then
    select k into v_bad from unnest(v_keys) k
      join public.permissions p on p.key = k where not p.citizen_grantable limit 1;
    if v_bad is not null then
      perform private.raise_app_error('MV_VALIDATION', v_bad || ' cannot be given to residents');
    end if;
  end if;

  delete from public.role_permissions
   where role_id = v_role.id and not (permission_key = any (v_keys));
  get diagnostics v_n = row_count;
  v_changed := v_n;

  insert into public.role_permissions (role_id, permission_key, updated_by)
  select v_role.id, k, v_uid from unnest(v_keys) k
  on conflict (role_id, permission_key) do nothing;
  get diagnostics v_n = row_count;
  return v_changed + v_n;
end;
$$;

revoke all on function
  public.upsert_category(text, text, text, text, public.issue_priority, int, boolean, uuid),
  public.set_category_active(uuid, boolean),
  public.update_village_settings(uuid, jsonb),
  public.set_role_permissions(text, text[])
from public, anon;
grant execute on function
  public.upsert_category(text, text, text, text, public.issue_priority, int, boolean, uuid),
  public.set_category_active(uuid, boolean),
  public.update_village_settings(uuid, jsonb),
  public.set_role_permissions(text, text[])
to authenticated;
