begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
-- Phase 11 (part 1): announcements. Only staff with announcement.manage write;
-- residents see only published, unexpired announcements of their own village.
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.u(p_n text) returns uuid language sql immutable as $$
  select ('b0000000-0000-4000-8000-0000000000' || p_n)::uuid $$;
create function pg_temp.seen(p_id uuid) returns int language sql stable as $$
  select count(*)::int from public.announcements where id = p_id $$;

create function pg_temp.residents(p_village uuid, p_except uuid) returns int language sql stable security definer as $$
  select count(*)::int from public.users where home_village_id = p_village and status = 'ACTIVE' and id <> p_except $$;
create temp table a (id uuid);
grant select, insert on a to authenticated;

select plan(17);

select pg_temp.login(pg_temp.u('15'));
select throws_like($$select public.upsert_announcement('a0000000-0000-4000-8000-000000000001', 'Water cut tomorrow', 'No water 10am-2pm')$$,
  '%MV_FORBIDDEN%', 'a resident cannot write announcements');

select pg_temp.login(pg_temp.u('12'));
select throws_like($$select public.upsert_announcement('a0000000-0000-4000-8000-000000000001', 'Hi', 'x')$$,
  '%MV_VALIDATION%', 'the title needs at least 3 letters');
insert into a select public.upsert_announcement('a0000000-0000-4000-8000-000000000001',
  'Water supply off on Sunday', 'Tank cleaning: no water from 10am to 2pm.',
  'ఆదివారం నీటి సరఫరా ఉండదు', 'ట్యాంక్ శుభ్రపరచడం: ఉదయం 10 నుండి మధ్యాహ్నం 2 వరకు నీరు ఉండదు.', true);
select is((select status::text from public.announcements where id = (select id from a)), 'DRAFT', 'secretary saves a draft');

select pg_temp.login(pg_temp.u('15'));
select is(pg_temp.seen((select id from a)), 0, 'residents do not see drafts');

select pg_temp.login(pg_temp.u('20'));
select throws_like(format('select public.publish_announcement(%L)', (select id from a)), '%MV_FORBIDDEN%',
  'another village''s secretary cannot publish it');

select pg_temp.login(pg_temp.u('12'));
select is(public.publish_announcement((select id from a)),
  pg_temp.residents('a0000000-0000-4000-8000-000000000001', pg_temp.u('12')),
  'publishing alerts every active resident of the village except the author');
select throws_like(format('select public.publish_announcement(%L)', (select id from a)), '%MV_INVALID_TRANSITION%',
  'it cannot be published twice');
select pg_temp.logout();
select is((select array[title, data ->> 'route'] from public.notifications
            where type = 'ANNOUNCEMENT' and recipient_id = pg_temp.u('15')),
  array[(select case when preferred_language = 'te' then 'ఆదివారం నీటి సరఫరా ఉండదు' else 'Water supply off on Sunday' end
           from public.users where id = pg_temp.u('15')), '/announcements/' || (select id from a)],
  'the alert is in the resident''s language and opens the announcement');
select is((select count(*)::int from public.notifications where type = 'ANNOUNCEMENT'
            and recipient_id = pg_temp.u('21')), 0, 'residents of other villages are not alerted');

select pg_temp.login(pg_temp.u('15'));
select is(pg_temp.seen((select id from a)), 1, 'residents see it once published');
select pg_temp.login(pg_temp.u('21'));
select is(pg_temp.seen((select id from a)), 0, 'a resident of another village does not');

-- Editing a published one is allowed; past end dates are refused
select pg_temp.login(pg_temp.u('12'));
select lives_ok(format($$select public.upsert_announcement('a0000000-0000-4000-8000-000000000001',
  'Water supply off on Sunday', 'Tank cleaning: no water from 10am to 3pm.', null, null, true, now() + interval '3 days', %L)$$, (select id from a)),
  'secretary corrects a published announcement');
select throws_like(format($$select public.upsert_announcement('a0000000-0000-4000-8000-000000000001',
  'Water supply off on Sunday', 'x', null, null, true, now() - interval '1 day', %L)$$, (select id from a)),
  '%MV_VALIDATION%', 'an end date in the past is refused');

-- Expired announcements disappear for residents
select pg_temp.logout();
update public.announcements set expires_at = now() - interval '1 minute' where id = (select id from a);
select pg_temp.login(pg_temp.u('15'));
select is(pg_temp.seen((select id from a)), 0, 'an expired announcement is hidden from residents');
select pg_temp.logout();
update public.announcements set expires_at = null where id = (select id from a);

-- Archive takes it down for good
select pg_temp.login(pg_temp.u('12'));
select public.archive_announcement((select id from a));
select throws_like(format($$select public.upsert_announcement('a0000000-0000-4000-8000-000000000001', 'Water again', 'x', null, null, false, null, %L)$$, (select id from a)),
  '%MV_INVALID_TRANSITION%', 'an archived announcement cannot be edited');
select pg_temp.login(pg_temp.u('15'));
select is(pg_temp.seen((select id from a)), 0, 'archived announcements are hidden from residents');
select pg_temp.logout();

select cmp_ok((select count(*)::int from public.audit_logs where entity_id = (select id from a)::text), '>=', 4,
  'every change is in the audit log');

select * from finish();
rollback;
