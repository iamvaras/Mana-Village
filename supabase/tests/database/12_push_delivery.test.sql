begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
-- Phase 10: the push outbox. Claiming, skipping, retries, tickets, receipts and
-- revoking dead phone tokens; only the service role may drive it.
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.u(p_n text) returns uuid language sql immutable as $$
  select ('b0000000-0000-4000-8000-0000000000' || p_n)::uuid $$;
create function pg_temp.n(p_num text) returns uuid language sql stable security definer as $$
  select id from public.issues where issue_number = 'RMP-' || extract(year from now())::int || '-' || p_num $$;
create function pg_temp.ver(p_issue uuid) returns int language sql stable security definer as $$
  select version from public.issues where id = p_issue $$;
create function pg_temp.push(p_id uuid) returns text language sql stable security definer as $$
  select push_status::text || '/' || push_attempts from public.notifications where id = p_id $$;

select plan(21);

-- Only the service role drives delivery
select pg_temp.login(pg_temp.u('16'));
select throws_like('select * from public.push_claim_batch()', '%permission denied%', 'a signed-in person cannot claim pushes');
select throws_like($$select public.push_record_send('[]')$$, '%permission denied%', 'nor report results');

-- Ravi (16) has a phone; Lakshmi (15) has a phone but turns push off
select lives_ok($$select public.register_push_token('ExponentPushToken[ravi-phone]', 'android', '0.1.0')$$, 'Ravi registers his phone');
select pg_temp.login(pg_temp.u('15'));
select public.register_push_token('ExponentPushToken[lakshmi-phone]', 'android', '0.1.0');
select lives_ok('select public.set_push_enabled(false)', 'Lakshmi turns phone notifications off');
select pg_temp.logout();

create temp table ids as
with ins as (
  insert into public.notifications (recipient_id, village_id, type, issue_id, title, body, data)
  values
    (pg_temp.u('16'), 'a0000000-0000-4000-8000-000000000001', 'ISSUE_CLOSED', pg_temp.n('00002'), 'Issue closed', 'RMP · Pothole', '{"route": "/issue/x"}'),
    (pg_temp.u('16'), 'a0000000-0000-4000-8000-000000000001', 'ISSUE_CLOSED', pg_temp.n('00003'), 'Issue closed', 'RMP · Private title', '{"route": "/issue/y"}'),
    (pg_temp.u('15'), 'a0000000-0000-4000-8000-000000000001', 'ISSUE_CLOSED', pg_temp.n('00002'), 'Issue closed', 'RMP · Pothole', '{}')
  returning id, recipient_id, issue_id
)
select (select id from ins where recipient_id = pg_temp.u('16') and issue_id = pg_temp.n('00002')) as a,
       (select id from ins where recipient_id = pg_temp.u('16') and issue_id = pg_temp.n('00003')) as b,
       (select id from ins where recipient_id = pg_temp.u('15')) as c;
set local mana.workflow = 'on';
update public.issues set visibility = 'PRIVATE' where id = pg_temp.n('00003');
set local mana.workflow = 'off';
grant select on ids to service_role;

select pg_temp.as_service();
create temp table batch as select * from public.push_claim_batch(100);
select pg_temp.logout();
select is((select array_agg(notification_id order by notification_id) from batch),
  (select array_agg(x order by x) from (select a as x from ids union all select b from ids) s),
  'only Ravi''s two alerts are claimed');
select is((select tokens from batch where notification_id = (select a from ids)), array['ExponentPushToken[ravi-phone]'],
  'with his active phone');
select is((select body from batch where notification_id = (select b from ids)),
  'RMP-' || extract(year from now())::int || '-00003', 'a private issue shows only its number on the lock screen');
select is((select push_status::text || ':' || push_error from public.notifications where id = (select c from ids)),
  'SKIPPED:push turned off', 'Lakshmi''s alert is skipped: push is off');
select is((select count(*)::int from public.notifications where push_status = 'PENDING'), 2,
  'seeded alerts for people without a phone are skipped too');

-- A claim is held for 5 minutes
select pg_temp.as_service();
select is((select count(*)::int from public.push_claim_batch(100)), 0, 'claimed alerts are not handed out twice');

-- Results: one sent with a ticket (and one dead phone reported), one to retry
select is(public.push_record_send(jsonb_build_array(
  jsonb_build_object('notification_id', (select a from ids), 'outcome', 'SENT',
    'tickets', jsonb_build_array(jsonb_build_object('id', 'ticket-1', 'token', 'ExponentPushToken[ravi-phone]')),
    'dead_tokens', '[]'::jsonb),
  jsonb_build_object('notification_id', (select b from ids), 'outcome', 'RETRY', 'error', 'Expo returned 503'))), 2,
  'both results are recorded');
select pg_temp.logout();
select is(array[pg_temp.push((select a from ids)), pg_temp.push((select b from ids))], array['SENT/1', 'PENDING/1'],
  'sent stays sent, the failed one waits for another try');

-- Retries stop after the third attempt
select pg_temp.as_service();
select count(*) from public.push_claim_batch(100);
select public.push_record_send(jsonb_build_array(jsonb_build_object('notification_id', (select b from ids), 'outcome', 'RETRY')));
select count(*) from public.push_claim_batch(100);
select public.push_record_send(jsonb_build_array(jsonb_build_object('notification_id', (select b from ids), 'outcome', 'RETRY', 'error', 'still down')));
select pg_temp.logout();
select is(pg_temp.push((select b from ids)), 'FAILED/3', 'after three attempts it is marked failed');

-- Receipts after 15 minutes; Expo says Ravi's phone is gone
update public.notifications set pushed_at = now() - interval '20 minutes' where id = (select a from ids);
select pg_temp.as_service();
select is((select array_agg(ticket_id) from public.push_tickets_to_check(300)), array['ticket-1'], 'the ticket is due for a receipt');
select is(public.push_record_receipts(jsonb_build_object(
  'checked', jsonb_build_array((select a from ids)),
  'dead_tokens', jsonb_build_array('ExponentPushToken[ravi-phone]'),
  'errors', jsonb_build_array(jsonb_build_object('notification_id', (select a from ids), 'error', 'DeviceNotRegistered')))), 1,
  'the receipt is recorded');
select is((select count(*)::int from public.push_tickets_to_check(300)), 0, 'and not checked again');
select pg_temp.logout();
select ok((select revoked_at is not null from public.push_tokens where expo_push_token = 'ExponentPushToken[ravi-phone]'),
  'the dead phone token is revoked');

-- With no active phone, the next alert is skipped
insert into public.notifications (recipient_id, village_id, type, title, body)
values (pg_temp.u('16'), 'a0000000-0000-4000-8000-000000000001', 'ISSUE_CLOSED', 'Issue closed', 'x');
select pg_temp.as_service();
select is((select count(*)::int from public.push_claim_batch(100)), 0, 'nothing to send once the phone is gone');
select pg_temp.logout();

-- Signing in again on the phone brings the token back
select pg_temp.login(pg_temp.u('16'));
select public.register_push_token('ExponentPushToken[ravi-phone]', 'android', '0.1.1');
select pg_temp.logout();
select ok((select revoked_at is null from public.push_tokens where expo_push_token = 'ExponentPushToken[ravi-phone]'),
  're-registering reactivates the token');

-- New issue alerts open the issue screen (the worker's steps live there)
select pg_temp.login(pg_temp.u('12'));
select public.assign_issue(pg_temp.n('00004'), pg_temp.ver(pg_temp.n('00004')),
  'd0000000-0000-4000-8000-000000000001', pg_temp.u('13'));
select pg_temp.logout();
select is((select data ->> 'route' from public.notifications where issue_id = pg_temp.n('00004') and type = 'WORK_ASSIGNED_TO_YOU'
            order by created_at desc limit 1), '/issue/' || pg_temp.n('00004'), 'work alerts open the issue screen');

select is((select count(*)::int from cron.job where jobname in ('mana-send-push', 'mana-push-receipts')), 2,
  'delivery jobs are scheduled');

select * from finish();
rollback;
