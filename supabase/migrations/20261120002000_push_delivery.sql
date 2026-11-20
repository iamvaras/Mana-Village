-- =============================================================================
-- Phase 10: push delivery (docs/api.md §Edge Functions, docs/database.md §notifications).
--
-- The notifications table is both the in-app inbox and the push outbox. Nothing
-- here changes what is stored in the inbox; it only tracks delivery to phones.
--
--   1. send-push (Edge Function, service role) calls push_claim_batch, sends
--      the messages to Expo, and reports back with push_record_send.
--   2. push-receipts (Edge Function, every 15 min) asks Expo what happened to
--      each ticket and reports dead phone tokens with push_record_receipts.
--
-- The functions are callable by the service role only. A statement trigger on
-- notifications and a once-a-minute pg_cron job wake send-push through pg_net;
-- both do nothing until the function URL and secret are stored in Vault, so a
-- local or test database never calls out.
--
-- Privacy: push text never contains phone numbers (the inbox text has none).
-- For a PRIVATE issue the lock-screen text is only the issue number.
-- =============================================================================

-- A person can turn phone notifications off (Settings). The in-app inbox is unaffected.
alter table public.users add column push_enabled boolean not null default true;

-- Delivery bookkeeping on the outbox rows.
alter table public.notifications
  add column push_tickets jsonb not null default '[]'::jsonb
    check (jsonb_typeof(push_tickets) = 'array'),
  add column push_claimed_at timestamptz,
  add column pushed_at timestamptz,
  add column push_receipts_checked_at timestamptz;

create index notifications_push_receipts_idx on public.notifications (pushed_at)
  where push_status = 'SENT' and push_receipts_checked_at is null;

-- The worker's steps live on the issue screen (Phase 8), so every issue alert
-- opens /issue/<id>; only the "Was it fixed?" alerts open the confirm screen.
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

-- The profile now also says whether phone notifications are on.
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
    'push_enabled', u.push_enabled,
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('role', r.key, 'village_id', ur.village_id, 'department_id', ur.department_id))
      from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = u.id and ur.revoked_at is null), '[]'::jsonb)
  )
  from public.users u
  join auth.users au on au.id = u.id
  where u.id = (select auth.uid());
$$;

-- Settings switch for the signed-in person.
create or replace function public.set_push_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
begin
  update public.users set push_enabled = coalesce(p_enabled, true), updated_at = now() where id = v_uid;
end;
$$;

-- -----------------------------------------------------------------------------
-- send-push: claim a batch.
-- Rows nobody can receive are marked SKIPPED first (push off, no active phone,
-- or older than a day: a late alert is worse than none, the inbox still has it).
-- A claim lasts 5 minutes; a crashed sender's rows are picked up again after that.
-- At most 3 attempts per row.
-- -----------------------------------------------------------------------------
create or replace function public.push_claim_batch(p_limit int default 100)
returns table (
  notification_id uuid,
  title text,
  body text,
  route text,
  issue_id uuid,
  tokens text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications n
     set push_status = 'SKIPPED',
         push_error = case
           when n.created_at < now() - interval '1 day' then 'too old'
           when u.status <> 'ACTIVE' then 'account not active'
           when not u.push_enabled then 'push turned off'
           else 'no active phone'
         end
    from public.users u
   where u.id = n.recipient_id
     and n.push_status = 'PENDING'
     and (n.created_at < now() - interval '1 day'
          or not u.push_enabled
          or u.status <> 'ACTIVE'
          or not exists (select 1 from public.push_tokens t
                          where t.user_id = n.recipient_id and t.revoked_at is null));

  return query
    with picked as (
      select n.id
        from public.notifications n
       where n.push_status = 'PENDING'
         and n.push_attempts < 3
         and (n.push_claimed_at is null or n.push_claimed_at < now() - interval '5 minutes')
       order by n.created_at
       limit greatest(1, least(coalesce(p_limit, 100), 500))
       for update skip locked
    ), claimed as (
      update public.notifications n
         set push_claimed_at = now(), push_attempts = n.push_attempts + 1
        from picked
       where n.id = picked.id
      returning n.*
    )
    select c.id,
           c.title,
           case when i.visibility = 'PRIVATE' then coalesce(i.issue_number, c.body) else c.body end,
           c.data ->> 'route',
           c.issue_id,
           array(select t.expo_push_token from public.push_tokens t
                  where t.user_id = c.recipient_id and t.revoked_at is null
                  order by t.last_seen_at desc limit 10)
      from claimed c
      left join public.issues i on i.id = c.issue_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- send-push: report the outcome for each claimed row.
-- p_results: [{ "notification_id": uuid,
--               "outcome": "SENT" | "RETRY" | "FAILED",
--               "tickets": [{ "id": text, "token": text }],
--               "dead_tokens": [text],
--               "error": text }]
-- RETRY puts the row back to PENDING (until the 3rd attempt, then FAILED).
-- -----------------------------------------------------------------------------
create or replace function public.push_record_send(p_results jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_count int := 0;
  v_outcome text;
begin
  if jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'MV_VALIDATION: results must be an array';
  end if;
  for r in select * from jsonb_array_elements(p_results)
  loop
    v_outcome := r ->> 'outcome';
    if v_outcome not in ('SENT', 'RETRY', 'FAILED') then
      continue;
    end if;
    update public.notifications n
       set push_status = case
             when v_outcome = 'SENT' then 'SENT'::public.push_status
             when v_outcome = 'RETRY' and n.push_attempts < 3 then 'PENDING'::public.push_status
             else 'FAILED'::public.push_status
           end,
           push_tickets = case when v_outcome = 'SENT'
                               then coalesce(r -> 'tickets', '[]'::jsonb) else n.push_tickets end,
           pushed_at = case when v_outcome = 'SENT' then now() else n.pushed_at end,
           push_claimed_at = null,
           push_error = left(nullif(r ->> 'error', ''), 500)
     where n.id = (r ->> 'notification_id')::uuid
       and n.push_status = 'PENDING';
    if found then
      v_count := v_count + 1;
    end if;
    -- Expo can say at once that a phone no longer exists.
    update public.push_tokens
       set revoked_at = now()
     where revoked_at is null
       and expo_push_token in (select jsonb_array_elements_text(coalesce(r -> 'dead_tokens', '[]'::jsonb)));
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- push-receipts: tickets that Expo should have a receipt for by now
-- (sent 15 minutes to 1 day ago; Expo keeps receipts for a day).
-- -----------------------------------------------------------------------------
create or replace function public.push_tickets_to_check(p_limit int default 300)
returns table (notification_id uuid, ticket_id text, token text)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, t ->> 'id', t ->> 'token'
    from (select * from public.notifications
           where push_status = 'SENT' and push_receipts_checked_at is null
             and pushed_at < now() - interval '15 minutes'
             and pushed_at > now() - interval '1 day'
           order by pushed_at
           limit greatest(1, least(coalesce(p_limit, 300), 1000))) n
    cross join lateral jsonb_array_elements(n.push_tickets) t
   where t ->> 'id' is not null;
$$;

-- p_results: { "checked": [uuid], "dead_tokens": [text], "errors": [{ "notification_id": uuid, "error": text }] }
create or replace function public.push_record_receipts(p_results jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if jsonb_typeof(p_results) is distinct from 'object' then
    raise exception 'MV_VALIDATION: results must be an object';
  end if;
  update public.push_tokens
     set revoked_at = now()
   where revoked_at is null
     and expo_push_token in (select jsonb_array_elements_text(coalesce(p_results -> 'dead_tokens', '[]'::jsonb)));

  update public.notifications n
     set push_error = left(e ->> 'error', 500)
    from jsonb_array_elements(coalesce(p_results -> 'errors', '[]'::jsonb)) e
   where n.id = (e ->> 'notification_id')::uuid;

  update public.notifications
     set push_receipts_checked_at = now()
   where id in (select (jsonb_array_elements_text(coalesce(p_results -> 'checked', '[]'::jsonb)))::uuid);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Waking the Edge Functions. Both settings live in Vault (set once per project):
--   edge_functions_url : https://<project-ref>.supabase.co/functions/v1
--   push_secret        : random string, also set as PUSH_SECRET for the functions
-- Without them this does nothing, so local and test databases never call out.
-- -----------------------------------------------------------------------------
create extension if not exists pg_net;

create or replace function private.wake_edge_function(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'edge_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/' || p_name,
    headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
exception when others then
  -- Never let a delivery problem undo the action that created the notification.
  raise warning 'could not wake %: %', p_name, sqlerrm;
end;
$$;

create or replace function private.notifications_wake_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.wake_edge_function('send-push');
  return null;
end;
$$;

-- Once per statement: one workflow step that notifies ten followers wakes send-push once.
create trigger notifications_wake_push
  after insert on public.notifications
  for each statement execute function private.notifications_wake_push();

-- Safety net for retries and for wake-ups that were lost.
select cron.schedule('mana-send-push', '* * * * *',
  $$select private.wake_edge_function('send-push') where exists (select 1 from public.notifications where push_status = 'PENDING')$$);
select cron.schedule('mana-push-receipts', '*/15 * * * *', $$select private.wake_edge_function('push-receipts')$$);

revoke all on function
  public.push_claim_batch(int),
  public.push_record_send(jsonb),
  public.push_tickets_to_check(int),
  public.push_record_receipts(jsonb)
from public, anon, authenticated;
grant execute on function
  public.push_claim_batch(int),
  public.push_record_send(jsonb),
  public.push_tickets_to_check(int),
  public.push_record_receipts(jsonb)
to service_role;

revoke all on function public.set_push_enabled(boolean) from public, anon;
grant execute on function public.set_push_enabled(boolean) to authenticated;
revoke all on function private.wake_edge_function(text), private.notifications_wake_push() from public, anon, authenticated;
