-- =============================================================================
-- Client-callable functions (RPC): profile, permissions, issue creation, support,
-- comments, attachments, push tokens, notifications.
-- Workflow transitions are in the next migration.
--
-- Every function: SECURITY DEFINER, search_path = '', checks auth + permission +
-- context itself, validates all input. Errors use private.raise_app_error.
-- =============================================================================

create or replace function private.require_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    perform private.raise_app_error('MV_AUTH_REQUIRED', 'sign in required');
  end if;
  if not exists (select 1 from public.users where id = v_uid and status = 'ACTIVE') then
    perform private.raise_app_error('MV_FORBIDDEN', 'profile missing or account not active');
  end if;
  return v_uid;
end;
$$;

create or replace function private.require_permission(p_village_id uuid, p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission(p_village_id, p_permission) then
    perform private.raise_app_error('MV_FORBIDDEN', 'missing permission ' || p_permission);
  end if;
end;
$$;

create or replace function private.check_source(p_source text)
returns public.action_source
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_source not in ('MOBILE', 'ADMIN_WEB') then
    perform private.raise_app_error('MV_VALIDATION', 'invalid source');
  end if;
  return p_source::public.action_source;
end;
$$;

create or replace function private.check_reason(p_reason text, p_min int default 10)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v) < p_min or char_length(v) > 500 then
    perform private.raise_app_error('MV_VALIDATION', 'reason must be ' || p_min || '-500 characters');
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Attachments: the phone uploads each photo to Storage at
--   issue-attachments/{auth.uid()}/{attachment_id}.{jpg|png|webp}
-- then passes [{ "id": uuid, "path": text, "width": int?, "height": int? }]
-- here. We verify the object exists, belongs to the caller, and check the real
-- MIME type and size recorded by Storage (not values sent by the client).
-- ---------------------------------------------------------------------------
create or replace function private.register_attachments(
  p_issue_id    uuid,
  p_kind        public.attachment_kind,
  p_visibility  public.content_visibility,
  p_attachments jsonb
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item jsonb;
  v_id uuid;
  v_path text;
  v_obj record;
  v_status public.issue_status;
  v_count int := 0;
begin
  if p_attachments is null or jsonb_typeof(p_attachments) <> 'array' then
    return 0;
  end if;
  if jsonb_array_length(p_attachments) > 4 then
    perform private.raise_app_error('MV_VALIDATION', 'at most 4 photos at a time');
  end if;
  select status into v_status from public.issues where id = p_issue_id;
  if (select count(*) from public.issue_attachments where issue_id = p_issue_id) + jsonb_array_length(p_attachments) > 30 then
    perform private.raise_app_error('MV_VALIDATION', 'too many photos on this issue');
  end if;

  for v_item in select * from jsonb_array_elements(p_attachments) loop
    begin
      v_id := (v_item ->> 'id')::uuid;
    exception when others then
      perform private.raise_app_error('MV_VALIDATION', 'invalid attachment id');
    end;
    v_path := v_item ->> 'path';
    if v_path is null or v_path !~ ('^' || v_uid::text || '/' || v_id::text || '\.(jpg|jpeg|png|webp)$') then
      perform private.raise_app_error('MV_VALIDATION', 'invalid attachment path');
    end if;

    select o.metadata ->> 'mimetype' as mime, (o.metadata ->> 'size')::bigint as size
      into v_obj
      from storage.objects o
     where o.bucket_id = 'issue-attachments' and o.name = v_path and o.owner_id = v_uid::text;
    if not found then
      perform private.raise_app_error('MV_VALIDATION', 'photo not uploaded: ' || v_id);
    end if;
    if v_obj.mime not in ('image/jpeg', 'image/png', 'image/webp') then
      perform private.raise_app_error('MV_VALIDATION', 'only JPEG, PNG or WebP photos are allowed');
    end if;
    if v_obj.size is null or v_obj.size <= 0 or v_obj.size > 5242880 then
      perform private.raise_app_error('MV_VALIDATION', 'photo must be 5 MB or smaller');
    end if;

    insert into public.issue_attachments
      (id, issue_id, uploaded_by, kind, visibility, storage_path, mime_type, size_bytes, width, height, status_at_upload)
    values
      (v_id, p_issue_id, v_uid, p_kind, p_visibility, v_path, v_obj.mime, v_obj.size,
       nullif(v_item ->> 'width', '')::int, nullif(v_item ->> 'height', '')::int, v_status);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ===========================================================================
-- Profile
-- ===========================================================================

-- First login: create the profile and the CITIZEN role in the chosen village.
-- Later calls update name/language (village changes go through change_home_village).
create or replace function public.complete_profile(
  p_full_name          text,
  p_home_village_id    uuid,
  p_preferred_language text default 'te',
  p_display_name       text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_citizen uuid;
begin
  if v_uid is null then
    perform private.raise_app_error('MV_AUTH_REQUIRED', 'sign in required');
  end if;
  if not exists (select 1 from public.villages where id = p_home_village_id and is_active) then
    perform private.raise_app_error('MV_VALIDATION', 'unknown village');
  end if;

  if exists (select 1 from public.users where id = v_uid) then
    if exists (select 1 from public.users where id = v_uid and status <> 'ACTIVE') then
      perform private.raise_app_error('MV_FORBIDDEN', 'account not active');
    end if;
    update public.users
       set full_name = btrim(p_full_name),
           display_name = nullif(btrim(coalesce(p_display_name, '')), ''),
           preferred_language = p_preferred_language
     where id = v_uid;
    return;
  end if;

  insert into public.users (id, full_name, display_name, home_village_id, preferred_language)
  values (v_uid, btrim(p_full_name), nullif(btrim(coalesce(p_display_name, '')), ''), p_home_village_id, p_preferred_language);

  select id into v_citizen from public.roles where key = 'CITIZEN';
  insert into public.user_roles (user_id, role_id, village_id, granted_by)
  values (v_uid, v_citizen, p_home_village_id, v_uid);
end;
$$;

create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', u.id,
    'full_name', u.full_name,
    'display_name', u.display_name,
    'home_village_id', u.home_village_id,
    'preferred_language', u.preferred_language,
    'status', u.status,
    'phone', au.phone,
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('role', r.key, 'village_id', ur.village_id, 'department_id', ur.department_id))
      from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = u.id and ur.revoked_at is null), '[]'::jsonb)
  )
  from public.users u
  join auth.users au on au.id = u.id
  where u.id = (select auth.uid());
$$;

create or replace function public.change_home_village(p_village_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_old uuid;
  v_citizen uuid;
begin
  if not exists (select 1 from public.villages where id = p_village_id and is_active) then
    perform private.raise_app_error('MV_VALIDATION', 'unknown village');
  end if;
  select home_village_id into v_old from public.users where id = v_uid;
  if v_old = p_village_id then
    return;
  end if;
  select id into v_citizen from public.roles where key = 'CITIZEN';

  update public.user_roles
     set revoked_at = now(), revoked_by = v_uid, revoke_reason = 'Changed home village'
   where user_id = v_uid and role_id = v_citizen and revoked_at is null;
  insert into public.user_roles (user_id, role_id, village_id, granted_by)
  values (v_uid, v_citizen, p_village_id, v_uid);
  update public.users set home_village_id = p_village_id where id = v_uid;

  perform private.write_audit('user.village_changed', 'user', v_uid::text, p_village_id,
    jsonb_build_object('home_village_id', v_old), jsonb_build_object('home_village_id', p_village_id));
end;
$$;

-- For the UI only (show/hide buttons). Enforcement happens in every function.
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
    and (r.scope = 'GLOBAL' or ur.village_id = p_village_id);
$$;

-- ===========================================================================
-- Issue creation
-- ===========================================================================
create or replace function public.create_issue(
  p_village_id          uuid,
  p_category_id         uuid,
  p_title               text,
  p_client_request_id   uuid,
  p_description         text default null,
  p_location_text       text default null,
  p_latitude            numeric default null,
  p_longitude           numeric default null,
  p_location_accuracy_m numeric default null,
  p_visibility          public.issue_visibility default null,
  p_attachments         jsonb default '[]'::jsonb,
  p_source              text default 'MOBILE'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_existing public.issues;
  v_village public.villages;
  v_category public.issue_categories;
  v_year int;
  v_seq int;
  v_issue_id uuid := gen_random_uuid();
  v_number text;
  v_photos int;
  v_source public.action_source := private.check_source(p_source);
begin
  -- Idempotency: a retry with the same client_request_id returns the same issue.
  select * into v_existing from public.issues where created_by = v_uid and client_request_id = p_client_request_id;
  if found then
    return jsonb_build_object('id', v_existing.id, 'issue_number', v_existing.issue_number, 'created', false);
  end if;

  select * into v_village from public.villages where id = p_village_id and is_active;
  if not found then
    perform private.raise_app_error('MV_VALIDATION', 'unknown village');
  end if;
  perform private.require_permission(p_village_id, 'issue.create');

  select * into v_category from public.issue_categories where id = p_category_id and is_active;
  if not found then
    perform private.raise_app_error('MV_VALIDATION', 'unknown category');
  end if;

  if (select count(*) from public.issues
       where created_by = v_uid and created_at > now() - interval '24 hours')
     >= private.village_setting_int(p_village_id, 'max_issues_per_user_per_day', 10) then
    perform private.raise_app_error('MV_RATE_LIMIT', 'daily report limit reached');
  end if;

  if (p_latitude is null) <> (p_longitude is null) then
    perform private.raise_app_error('MV_VALIDATION', 'latitude and longitude must be given together');
  end if;
  if p_latitude is null and char_length(btrim(coalesce(p_location_text, ''))) < 3 then
    perform private.raise_app_error('MV_VALIDATION', 'location or landmark is required');
  end if;

  v_photos := coalesce(jsonb_array_length(case when jsonb_typeof(p_attachments) = 'array' then p_attachments end), 0);
  if v_category.photo_required and v_photos < 1 then
    perform private.raise_app_error('MV_VALIDATION', 'at least one photo is required');
  end if;

  -- Gap-free number per village per year (row lock serializes concurrent submits).
  v_year := extract(year from (now() at time zone v_village.timezone))::int;
  insert into public.issue_number_counters (village_id, year, last_value)
  values (p_village_id, v_year, 1)
  on conflict (village_id, year) do update set last_value = public.issue_number_counters.last_value + 1
  returning last_value into v_seq;
  v_number := v_village.code || '-' || v_year || '-' || lpad(v_seq::text, 5, '0');

  insert into public.issues (
    id, issue_number, village_id, created_by, category_id, title, description, location_text,
    latitude, longitude, location_accuracy_m, priority, status, visibility, client_request_id
  ) values (
    v_issue_id, v_number, p_village_id, v_uid, p_category_id, btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''), nullif(btrim(coalesce(p_location_text, '')), ''),
    p_latitude, p_longitude, p_location_accuracy_m,
    coalesce(v_category.default_priority, 'MEDIUM'), 'SUBMITTED',
    coalesce(p_visibility, (v_village.settings ->> 'default_issue_visibility')::public.issue_visibility, 'PUBLIC'),
    p_client_request_id
  );

  perform private.register_attachments(v_issue_id, 'INITIAL_EVIDENCE', 'PUBLIC', p_attachments);

  insert into public.issue_status_history (issue_id, from_status, to_status, actor_user_id, actor_role_key, source)
  values (v_issue_id, null, 'SUBMITTED', v_uid, private.acting_role_key(p_village_id), v_source);

  perform private.notify_permission_holders(v_issue_id, 'issue.review', 'ISSUE_NEEDS_REVIEW');

  return jsonb_build_object('id', v_issue_id, 'issue_number', v_number, 'created', true);
end;
$$;

-- Reporter may correct text while the issue is still SUBMITTED. Audited by trigger.
create or replace function public.edit_my_issue(
  p_issue_id uuid,
  p_expected_version int,
  p_title text,
  p_description text default null,
  p_location_text text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_issue public.issues;
begin
  select * into v_issue from public.issues where id = p_issue_id for update;
  if not found or v_issue.created_by <> v_uid then
    perform private.raise_app_error('MV_NOT_FOUND', 'issue not found');
  end if;
  if v_issue.status <> 'SUBMITTED' then
    perform private.raise_app_error('MV_INVALID_TRANSITION', 'issue can only be edited before review starts');
  end if;
  if v_issue.version <> p_expected_version then
    perform private.raise_app_error('MV_CONFLICT', 'issue was changed, please refresh');
  end if;
  perform set_config('mana.workflow', 'on', true);
  update public.issues
     set title = btrim(p_title),
         description = nullif(btrim(coalesce(p_description, '')), ''),
         location_text = coalesce(nullif(btrim(coalesce(p_location_text, '')), ''), location_text),
         version = version + 1
   where id = p_issue_id;
  perform set_config('mana.workflow', 'off', true);
end;
$$;

-- Open, public issues of the same category near a point ("Is it one of these?").
create or replace function public.find_similar_issues(
  p_village_id  uuid,
  p_category_id uuid,
  p_latitude    numeric,
  p_longitude   numeric,
  p_radius_m    int default null
)
returns table (
  id uuid, issue_number text, title text, status public.issue_status,
  supporter_count int, distance_m int, created_at timestamptz, i_support boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select coalesce(p_radius_m, private.village_setting_int(p_village_id, 'similar_issue_radius_m', 200)) as radius
  ), candidates as (
    select i.*,
           -- Equirectangular approximation: accurate to well under 1% at village scale.
           (6371000 * sqrt(
              power(radians(i.latitude - p_latitude), 2)
            + power(radians(i.longitude - p_longitude) * cos(radians((i.latitude + p_latitude) / 2)), 2)
           ))::int as dist
    from public.issues i
    where i.village_id = p_village_id
      and i.category_id = p_category_id
      and i.visibility = 'PUBLIC'
      and i.status not in ('CLOSED', 'REJECTED', 'DUPLICATE')
      and i.latitude is not null
      and i.created_by <> (select auth.uid())
  )
  select c.id, c.issue_number, c.title, c.status, c.supporter_count, c.dist, c.created_at,
         exists (select 1 from public.issue_supporters s where s.issue_id = c.id and s.user_id = (select auth.uid()))
  from candidates c, params p
  where c.dist <= least(p.radius, 2000)
    and private.has_permission(p_village_id, 'issue.view_public')
    and p_latitude between -90 and 90 and p_longitude between -180 and 180
  order by c.dist, c.created_at desc
  limit 5;
$$;

-- ===========================================================================
-- "I'm affected too"
-- ===========================================================================
create or replace function public.support_issue(p_issue_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_issue public.issues;
begin
  select * into v_issue from public.issues where id = p_issue_id;
  if not found or not private.can_view_issue(p_issue_id) then
    perform private.raise_app_error('MV_NOT_FOUND', 'issue not found');
  end if;
  perform private.require_permission(v_issue.village_id, 'issue.support');
  if v_issue.created_by = v_uid then
    perform private.raise_app_error('MV_VALIDATION', 'you reported this issue');
  end if;
  if v_issue.visibility <> 'PUBLIC' or v_issue.status in ('CLOSED', 'REJECTED', 'DUPLICATE') then
    perform private.raise_app_error('MV_VALIDATION', 'this issue cannot be supported');
  end if;
  insert into public.issue_supporters (issue_id, user_id) values (p_issue_id, v_uid)
  on conflict do nothing;
  return (select supporter_count from public.issues where id = p_issue_id);
end;
$$;

create or replace function public.unsupport_issue(p_issue_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
begin
  delete from public.issue_supporters where issue_id = p_issue_id and user_id = v_uid;
  return coalesce((select supporter_count from public.issues where id = p_issue_id and private.can_view_issue(id)), 0);
end;
$$;

-- ===========================================================================
-- Comments and photos
-- ===========================================================================
create or replace function public.add_comment(
  p_issue_id   uuid,
  p_body       text,
  p_visibility public.content_visibility default 'PUBLIC'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_issue public.issues;
  v_id uuid;
begin
  select * into v_issue from public.issues where id = p_issue_id;
  if not found or not private.can_view_issue(p_issue_id) then
    perform private.raise_app_error('MV_NOT_FOUND', 'issue not found');
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then
    perform private.raise_app_error('MV_VALIDATION', 'comment must be 1-1000 characters');
  end if;

  if p_visibility = 'INTERNAL' then
    if not (private.has_permission(v_issue.village_id, 'issue.comment_internal') or private.is_assignee(p_issue_id)) then
      perform private.raise_app_error('MV_FORBIDDEN', 'cannot add internal notes');
    end if;
  else
    perform private.require_permission(v_issue.village_id, 'issue.comment_public');
    -- Citizens comment on issues they reported or support; staff and assignees on any visible issue.
    if not (v_issue.created_by = v_uid
            or exists (select 1 from public.issue_supporters s where s.issue_id = p_issue_id and s.user_id = v_uid)
            or private.is_village_staff(v_issue.village_id)
            or private.is_assignee(p_issue_id)) then
      perform private.raise_app_error('MV_FORBIDDEN', 'support this issue to comment');
    end if;
  end if;

  insert into public.issue_comments (issue_id, author_id, body, visibility)
  values (p_issue_id, v_uid, btrim(p_body), p_visibility)
  returning id into v_id;
  return v_id;
end;
$$;

-- Add photos to an existing issue (evidence by reporter, work photos by assignee/staff).
-- Completion photos are normally added through resolve_issue.
create or replace function public.add_issue_photos(
  p_issue_id    uuid,
  p_kind        public.attachment_kind,
  p_attachments jsonb,
  p_visibility  public.content_visibility default 'PUBLIC'
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_issue public.issues;
  v_staff_or_assignee boolean;
begin
  select * into v_issue from public.issues where id = p_issue_id;
  if not found or not private.can_view_issue(p_issue_id) then
    perform private.raise_app_error('MV_NOT_FOUND', 'issue not found');
  end if;
  v_staff_or_assignee := private.is_assignee(p_issue_id)
    or (private.has_permission(v_issue.village_id, 'attachment.upload_work') and private.is_village_staff(v_issue.village_id));

  if p_kind = 'INITIAL_EVIDENCE' then
    if not (v_issue.created_by = v_uid
            and private.has_permission(v_issue.village_id, 'attachment.upload_evidence')
            and v_issue.status in ('SUBMITTED', 'UNDER_REVIEW')) then
      perform private.raise_app_error('MV_FORBIDDEN', 'evidence photos can only be added by the reporter before verification');
    end if;
  elsif p_kind in ('PROGRESS', 'COMPLETION') then
    if not v_staff_or_assignee then
      perform private.raise_app_error('MV_FORBIDDEN', 'only the assigned worker or staff can add work photos');
    end if;
    if v_issue.status not in ('ASSIGNED', 'IN_PROGRESS', 'REOPENED', 'RESOLVED') then
      perform private.raise_app_error('MV_INVALID_TRANSITION', 'work photos are not allowed in this status');
    end if;
  else -- OTHER
    if not (v_issue.created_by = v_uid or v_staff_or_assignee) then
      perform private.raise_app_error('MV_FORBIDDEN', 'cannot add photos to this issue');
    end if;
  end if;

  if p_visibility = 'INTERNAL' and not (private.can_view_internal(p_issue_id)) then
    perform private.raise_app_error('MV_FORBIDDEN', 'cannot add internal photos');
  end if;

  return private.register_attachments(p_issue_id, p_kind, p_visibility, p_attachments);
end;
$$;

-- ===========================================================================
-- Push tokens and notifications
-- ===========================================================================
create or replace function public.register_push_token(p_token text, p_platform text, p_app_version text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
begin
  if p_token !~ '^(Exponent|Expo)PushToken\[.+\]$' or char_length(p_token) > 200 then
    perform private.raise_app_error('MV_VALIDATION', 'invalid push token');
  end if;
  if p_platform not in ('ios', 'android') then
    perform private.raise_app_error('MV_VALIDATION', 'invalid platform');
  end if;
  -- A device that signs in as a different user moves the token to that user.
  insert into public.push_tokens (user_id, expo_push_token, platform, app_version)
  values (v_uid, p_token, p_platform, p_app_version)
  on conflict (expo_push_token) do update
    set user_id = excluded.user_id, platform = excluded.platform, app_version = excluded.app_version,
        last_seen_at = now(), revoked_at = null;
end;
$$;

create or replace function public.revoke_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.push_tokens set revoked_at = now()
   where expo_push_token = p_token and user_id = (select auth.uid()) and revoked_at is null;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.notifications set read_at = now()
   where recipient_id = (select auth.uid()) and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
