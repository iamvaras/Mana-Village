-- Phase 12 load-test data: ~100 villages, ~104k issues, ~1M notifications.
-- LOCAL ONLY. Run after `supabase start` (seed loaded); undo with `supabase db reset`.
-- Writes with session_replication_role = replica (no triggers, no FK checks), so it
-- never touches a hosted project unless you point psql at one: do not.
\timing on
set session_replication_role = replica;
set statement_timeout = 0;
begin;
-- villages
insert into public.villages (id, code, name, timezone, settings, is_active)
select ('a1000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid, 'LV'||chr(65+g/26)||chr(65+g%26), 'Load Village '||g, 'Asia/Kolkata',
       (select settings from public.villages where code='RMP'), true
from generate_series(3,100) g;
create temp table lv as select id, code, (code='RMP') as big from public.villages;
-- departments (4 per new village)
insert into public.departments (village_id, name)
select v.id, d from lv v cross join unnest(array['Electrical','Sanitation','Water','Roads']) d where v.code like 'LV%';
-- people: citizens (200 per village, 2000 extra for RMP) + 4 staff per new village
create temp table lp as
select gen_random_uuid() id, v.id village_id, 'CITIZEN'::text kind, row_number() over () n
from lv v cross join lateral generate_series(1, case when v.big then 2000 else 200 end)
union all
select gen_random_uuid(), v.id, k, 0 from lv v cross join unnest(array['SECRETARY','PRESIDENT','WORKER','WORKER']) k where v.code like 'LV%';
insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, phone_change, phone_change_token, email_change_token_current, reauthentication_token)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '9198'||lpad((row_number() over ())::text,8,'0'), now(),
  '{"provider":"phone","providers":["phone"]}', '{}', now(), now(), '', '', '', '', '', '', '', '' from lp;
insert into public.users (id, full_name, display_name, home_village_id, preferred_language, status)
select id, 'Load '||kind||' '||left(id::text,8), 'L'||left(id::text,6), village_id, 'te', 'ACTIVE' from lp;
insert into public.user_roles (user_id, role_id, village_id, department_id)
select p.id, r.id, p.village_id,
  case when p.kind='WORKER' then (select d.id from public.departments d where d.village_id=p.village_id order by d.name limit 1) end
from lp p join public.roles r on r.key = p.kind;
insert into public.user_roles (user_id, role_id, village_id)
select p.id, r.id, p.village_id from lp p join public.roles r on r.key='CITIZEN' where p.kind<>'CITIZEN';
-- issues: 1000 per village, 5000 for RMP, spread over 2 years
create temp table li as
select gen_random_uuid() id, v.id village_id, v.code, s.g,
  (array['SUBMITTED','UNDER_REVIEW','VERIFIED','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED','CLOSED','CLOSED','CLOSED','REJECTED','REOPENED','REJECTED'])[1+floor(random()*13)::int]::public.issue_status status,
  now() - (random()*730 || ' days')::interval created_at
from lv v cross join lateral generate_series(1, case when v.big then 5000 else 1000 end) s(g);
create temp table cit as select id, village_id, row_number() over (partition by village_id order by id) rn, count(*) over (partition by village_id) cnt from lp where kind='CITIZEN';
create index on cit(village_id, rn);
insert into public.issues (id, issue_number, village_id, created_by, category_id, title, description, location_text, priority, status, visibility,
  assigned_department_id, assigned_user_id, duplicate_of_issue_id, supporter_count, version, client_request_id, created_at, updated_at, last_status_change_at,
  resolved_at, closed_at)
select i.id, i.code||'-L-'||lpad(i.g::text,6,'0'), i.village_id,
  coalesce((select c.id from cit c where c.village_id=i.village_id and c.rn = 1 + (i.g % 200)), (select id from public.users limit 1)),
  (select id from public.issue_categories order by key offset (i.g % 9) limit 1),
  'Load test issue number '||i.g, repeat('Street light not working near the temple. ', 3), 'Near the temple road',
  'MEDIUM', i.status, case when i.g % 10 = 0 then 'PRIVATE' else 'PUBLIC' end::public.issue_visibility,
  case when i.status in ('ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED','REOPENED') then (select d.id from public.departments d where d.village_id=i.village_id order by d.name limit 1) end,
  null, null, 3, 5, gen_random_uuid(), i.created_at, i.created_at + interval '3 days', i.created_at + interval '3 days',
  case when i.status in ('RESOLVED','CLOSED') then i.created_at + interval '3 days' end,
  case when i.status = 'CLOSED' then i.created_at + interval '5 days' end
from li i;
update public.issues x set duplicate_of_issue_id = (select y.id from public.issues y where y.village_id=x.village_id and y.id<>x.id and y.status<>'DUPLICATE' limit 1)
where x.status='DUPLICATE' and x.duplicate_of_issue_id is null;
-- history (5 per issue), comments (2), attachments (2), supporters (3), notifications (10), audit (6)
insert into public.issue_status_history (issue_id, from_status, to_status, actor_user_id, actor_role_key, source, created_at)
select i.id, null, i.status, null, null, 'SYSTEM', i.created_at + (s||' hours')::interval from li i, generate_series(1,5) s;
insert into public.issue_comments (issue_id, author_id, body, visibility, created_at)
select i.id, (select c.id from cit c where c.village_id=i.village_id and c.rn = 1 + ((i.g+s) % 200)), 'Load comment '||s,
  case when s=2 then 'INTERNAL' else 'PUBLIC' end::public.content_visibility, i.created_at + (s||' hours')::interval from li i, generate_series(1,2) s;
insert into public.issue_attachments (issue_id, uploaded_by, kind, visibility, storage_path, mime_type, size_bytes, status_at_upload, created_at)
select i.id, (select c.id from cit c where c.village_id=i.village_id and c.rn = 1 + (i.g % 200)), 'INITIAL_EVIDENCE', 'PUBLIC',
  i.village_id||'/'||i.id||'/'||gen_random_uuid()||'.jpg', 'image/jpeg', 200000, 'SUBMITTED', i.created_at from li i, generate_series(1,2) s;
insert into public.issue_supporters (issue_id, user_id, created_at)
select i.id, c.id, i.created_at from li i join cit c on c.village_id=i.village_id and c.rn in (1+((i.g+3) % 200), 1+((i.g+5) % 200), 1+((i.g+7) % 200));
insert into public.notifications (recipient_id, village_id, type, issue_id, title, body, read_at, push_status, created_at)
select (select c.id from cit c where c.village_id=i.village_id and c.rn = 1 + ((i.g+s) % 200)), i.village_id, 'ISSUE_STATUS_CHANGED', i.id, 'Update', 'Your issue changed',
  case when s % 3 = 0 then null else i.created_at end, 'SENT', i.created_at + (s||' hours')::interval from li i, generate_series(1,10) s;
insert into public.audit_logs (occurred_at, actor_role_key, village_id, action, entity_type, entity_id, after)
select i.created_at + (s||' hours')::interval, 'SECRETARY', i.village_id, 'issue.transition', 'issue', i.id::text, '{"x":1}' from li i, generate_series(1,6) s;
insert into public.issue_assignments (issue_id, department_id, assigned_by, assigned_at, status, ended_at)
select i.id, x.assigned_department_id, (select id from public.users limit 1), i.created_at, case when i.status in ('RESOLVED','CLOSED') then 'COMPLETED' else 'ACCEPTED' end::public.assignment_status, case when i.status in ('RESOLVED','CLOSED') then i.created_at + interval '3 days' end
from li i join public.issues x on x.id=i.id where x.assigned_department_id is not null;
commit;
set session_replication_role = origin;
analyze;
select relname, n_live_tup from pg_stat_user_tables where schemaname='public' order by n_live_tup desc limit 14;
