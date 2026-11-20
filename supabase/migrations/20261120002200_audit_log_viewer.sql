-- =============================================================================
-- Phase 11 (part 2): audit log viewer (docs/ui-ux.md admin 13, permission audit.view).
--
-- Read-only. The table already has an RLS select policy, but the viewer also
-- needs who did it (users has no read policy) and the issue number, so this one
-- function joins them in. Newest first; `p_before_id` pages backwards.
-- Audit rows never hold phone numbers (contact reveals record only who looked).
-- =============================================================================

create or replace function public.list_audit_logs(
  p_village_id  uuid,
  p_area        text default null,         -- issue | user | content | config
  p_actor_id    uuid default null,
  p_entity_id   text default null,
  p_from        timestamptz default null,
  p_to          timestamptz default null,
  p_before_id   bigint default null,
  p_limit       int default 50
)
returns table (
  id              bigint,
  occurred_at     timestamptz,
  actor_user_id   uuid,
  actor_name      text,
  actor_role_key  text,
  action          text,
  entity_type     text,
  entity_id       text,
  issue_number    text,
  before          jsonb,
  after           jsonb,
  metadata        jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  perform private.require_permission(p_village_id, 'audit.view');
  if p_area is not null and p_area not in ('issue', 'user', 'content', 'config') then
    perform private.raise_app_error('MV_VALIDATION', 'unknown area');
  end if;

  return query
    select a.id, a.occurred_at, a.actor_user_id,
           case when u.status = 'DELETED' then null else u.full_name end,
           a.actor_role_key, a.action, a.entity_type, a.entity_id,
           i.issue_number, a.before, a.after, a.metadata
      from public.audit_logs a
      left join public.users u on u.id = a.actor_user_id
      left join public.issues i on a.entity_type = 'issue' and i.id::text = a.entity_id
     where a.village_id = p_village_id
       and (p_area is null
            or (p_area = 'issue' and split_part(a.action, '.', 1) = 'issue')
            or (p_area = 'user' and split_part(a.action, '.', 1) in ('user', 'user_role'))
            or (p_area = 'content' and split_part(a.action, '.', 1) = 'content')
            or (p_area = 'config' and split_part(a.action, '.', 1)
                  in ('village', 'department', 'category', 'role_permission', 'announcement')))
       and (p_actor_id is null or a.actor_user_id = p_actor_id)
       and (p_entity_id is null or a.entity_id = p_entity_id)
       and (p_from is null or a.occurred_at >= p_from)
       and (p_to is null or a.occurred_at < p_to)
       and (p_before_id is null or a.id < p_before_id)
     order by a.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke all on function public.list_audit_logs(uuid, text, uuid, text, timestamptz, timestamptz, bigint, int)
  from public, anon;
grant execute on function public.list_audit_logs(uuid, text, uuid, text, timestamptz, timestamptz, bigint, int)
  to authenticated;
