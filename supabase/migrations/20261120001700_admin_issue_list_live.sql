-- =============================================================================
-- Phase 6: live updates for the admin All Issues list (docs/api.md §6).
--
-- Design: instead of streaming raw `issues` rows (postgres_changes, which would
-- need a direct SELECT policy on the base table and would send every column),
-- the database broadcasts a tiny "issue changed" signal on a private Realtime
-- channel per village. The payload carries only the issue id and version; the
-- admin page then refetches through issues_view, so every privacy rule that
-- applies to normal reads still applies.
--
-- Topic:   village:<village_id>:issues
-- Event:   issue_changed   payload {"id": "<uuid>", "version": <int>, "op": "INSERT"|"UPDATE"}
-- Listen:  only users holding issue.view_all in that village (MFA enforced by
--          private.has_permission), checked by Realtime against the policy below.
-- =============================================================================

create or replace function private.issue_topic_village(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_topic ~ '^village:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:issues$'
      then split_part(p_topic, ':', 2)::uuid
  end;
$$;

-- True when the signed-in user may receive change signals for this topic.
create or replace function private.can_receive_issue_changes(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- The village check comes first: has_permission(null, ...) would be true for
  -- GLOBAL roles, and an unknown topic must never be allowed.
  select private.issue_topic_village(p_topic) is not null
     and private.has_permission(private.issue_topic_village(p_topic), 'issue.view_all');
$$;

revoke all on function private.issue_topic_village(text), private.can_receive_issue_changes(text) from public, anon;
grant execute on function private.issue_topic_village(text), private.can_receive_issue_changes(text) to authenticated;

create policy "staff receive issue change signals for their village"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and private.can_receive_issue_changes((select realtime.topic()))
  );

create or replace function private.broadcast_issue_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A live-update signal must never block or undo a workflow action.
  begin
    perform realtime.send(
      jsonb_build_object('id', new.id, 'version', new.version, 'op', tg_op),
      'issue_changed',
      'village:' || new.village_id || ':issues',
      true
    );
  exception when others then
    raise warning 'issue change broadcast failed: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function private.broadcast_issue_change() from public, anon, authenticated;

create trigger issues_broadcast_change
  after insert or update on public.issues
  for each row execute function private.broadcast_issue_change();
