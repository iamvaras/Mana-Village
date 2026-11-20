-- =============================================================================
-- Phase 11 (part 1): announcements (docs/api.md §Admin, docs/ui-ux.md admin 11, mobile 14).
--
-- Writes go through these functions only (no table write grants). Every insert
-- and update is audited by the existing announcements_audit trigger.
-- Residents read published, unexpired announcements of villages they can see
-- through the existing RLS policy; staff with announcement.manage see all.
--
-- Publishing sends one in-app alert (and so a push) to every active resident
-- whose home village it is, in their own language, unless the author opts out.
-- =============================================================================

-- Create (p_id null) or edit a draft or published announcement.
create or replace function public.upsert_announcement(
  p_village_id  uuid,
  p_title       text,
  p_body        text,
  p_title_local text default null,
  p_body_local  text default null,
  p_is_pinned   boolean default false,
  p_expires_at  timestamptz default null,
  p_id          uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_title_local text := nullif(btrim(coalesce(p_title_local, '')), '');
  v_body_local text := nullif(btrim(coalesce(p_body_local, '')), '');
  v_current public.announcements;
  v_id uuid;
begin
  perform private.require_permission(p_village_id, 'announcement.manage');

  if char_length(v_title) not between 3 and 150 then
    perform private.raise_app_error('MV_VALIDATION', 'title must be 3-150 characters');
  end if;
  if char_length(v_body) not between 1 and 5000 then
    perform private.raise_app_error('MV_VALIDATION', 'message must be 1-5000 characters');
  end if;
  if v_title_local is not null and char_length(v_title_local) > 150 then
    perform private.raise_app_error('MV_VALIDATION', 'Telugu title must be at most 150 characters');
  end if;
  if v_body_local is not null and char_length(v_body_local) > 5000 then
    perform private.raise_app_error('MV_VALIDATION', 'Telugu message must be at most 5000 characters');
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    perform private.raise_app_error('MV_VALIDATION', 'the end date must be in the future');
  end if;

  if p_id is null then
    insert into public.announcements
      (village_id, title, body, title_local, body_local, is_pinned, expires_at, created_by, updated_by)
    values (p_village_id, v_title, v_body, v_title_local, v_body_local, coalesce(p_is_pinned, false),
            p_expires_at, v_uid, v_uid)
    returning id into v_id;
  else
    select * into v_current from public.announcements where id = p_id and village_id = p_village_id for update;
    if not found then
      perform private.raise_app_error('MV_NOT_FOUND', 'announcement not found');
    end if;
    if v_current.status = 'ARCHIVED' then
      perform private.raise_app_error('MV_INVALID_TRANSITION', 'an archived announcement cannot be edited');
    end if;
    update public.announcements
       set title = v_title, body = v_body, title_local = v_title_local, body_local = v_body_local,
           is_pinned = coalesce(p_is_pinned, false), expires_at = p_expires_at,
           updated_by = v_uid, updated_at = now()
     where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- DRAFT -> PUBLISHED. Returns how many residents were alerted.
create or replace function public.publish_announcement(p_id uuid, p_notify boolean default true)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_a public.announcements;
  v_count int := 0;
begin
  select * into v_a from public.announcements where id = p_id for update;
  if not found then
    perform private.raise_app_error('MV_NOT_FOUND', 'announcement not found');
  end if;
  perform private.require_permission(v_a.village_id, 'announcement.manage');
  if v_a.status <> 'DRAFT' then
    perform private.raise_app_error('MV_INVALID_TRANSITION', 'only a draft can be published');
  end if;
  if v_a.expires_at is not null and v_a.expires_at <= now() then
    perform private.raise_app_error('MV_VALIDATION', 'the end date has already passed');
  end if;

  update public.announcements
     set status = 'PUBLISHED', published_at = now(), updated_by = v_uid, updated_at = now()
   where id = p_id;

  if coalesce(p_notify, true) then
    insert into public.notifications (recipient_id, village_id, type, title, body, data)
    select u.id, v_a.village_id, 'ANNOUNCEMENT',
           left(case when u.preferred_language = 'te' and v_a.title_local is not null
                     then v_a.title_local else v_a.title end, 200),
           left(case when u.preferred_language = 'te' and v_a.body_local is not null
                     then v_a.body_local else v_a.body end, 300),
           jsonb_build_object('route', '/announcements/' || v_a.id, 'announcement_id', v_a.id)
      from public.users u
     where u.home_village_id = v_a.village_id
       and u.status = 'ACTIVE'
       and u.id <> v_uid;
    get diagnostics v_count = row_count;
  end if;
  return v_count;
end;
$$;

-- PUBLISHED or DRAFT -> ARCHIVED (taken down; kept for the record).
create or replace function public.archive_announcement(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_a public.announcements;
begin
  select * into v_a from public.announcements where id = p_id for update;
  if not found then
    perform private.raise_app_error('MV_NOT_FOUND', 'announcement not found');
  end if;
  perform private.require_permission(v_a.village_id, 'announcement.manage');
  if v_a.status = 'ARCHIVED' then
    return;
  end if;
  update public.announcements
     set status = 'ARCHIVED', is_pinned = false, updated_by = v_uid, updated_at = now()
   where id = p_id;
end;
$$;

revoke all on function
  public.upsert_announcement(uuid, text, text, text, text, boolean, timestamptz, uuid),
  public.publish_announcement(uuid, boolean),
  public.archive_announcement(uuid)
from public, anon;
grant execute on function
  public.upsert_announcement(uuid, text, text, text, text, boolean, timestamptz, uuid),
  public.publish_announcement(uuid, boolean),
  public.archive_announcement(uuid)
to authenticated;
