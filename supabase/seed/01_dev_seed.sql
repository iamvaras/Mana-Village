-- =============================================================================
-- DEVELOPMENT / TEST SEED ONLY. Never run against production.
-- Fixed UUIDs so tests can refer to these records.
--
-- Test logins (local only, OTP 123456, configured in config.toml [auth.sms.test_otp]):
--   +91 90000 00001  Super Admin
--   +91 90000 00010  President, Ramapuram (RMP)
--   +91 90000 00011  Vice-President, Ramapuram
--   +91 90000 00012  Secretary, Ramapuram
--   +91 90000 00013  Worker, Ramapuram Electrical
--   +91 90000 00014  Worker, Ramapuram Sanitation
--   +91 90000 00015  Citizen, Ramapuram (Lakshmi)
--   +91 90000 00016  Citizen, Ramapuram (Ravi)
--   +91 90000 00017  Citizen, Ramapuram (Sita)   reporter of the sample issues in 02_sample_issues.sql
--   +91 90000 00018  Citizen, Ramapuram (Gopal)  reporter of the sample issues in 02_sample_issues.sql
--   +91 90000 00020  Secretary, Kondapalli (KDP)
--   +91 90000 00021  Citizen, Kondapalli
-- =============================================================================

insert into public.villages (id, code, name, name_local, mandal, district, state, center_lat, center_lng, settings) values
  ('a0000000-0000-4000-8000-000000000001', 'RMP', 'Ramapuram', 'రామాపురం', 'Example Mandal', 'Example District', 'Andhra Pradesh', 16.506200, 80.648000,
   '{"auto_close_days": 7, "reminder_days": 3, "max_issues_per_user_per_day": 10, "similar_issue_radius_m": 200}'),
  ('a0000000-0000-4000-8000-000000000002', 'KDP', 'Kondapalli', 'కొండపల్లి', 'Example Mandal', 'Example District', 'Andhra Pradesh', 16.620000, 80.540000, '{}');

insert into public.departments (id, village_id, name, name_local) values
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Electrical', 'విద్యుత్ విభాగం'),
  ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Sanitation', 'పారిశుద్ధ్య విభాగం'),
  ('d0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', 'Public Works', 'ప్రజా పనులు');

-- auth users (phone login)
with people(id, phone) as (values
  ('b0000000-0000-4000-8000-000000000001'::uuid, '919000000001'),
  ('b0000000-0000-4000-8000-000000000010'::uuid, '919000000010'),
  ('b0000000-0000-4000-8000-000000000011'::uuid, '919000000011'),
  ('b0000000-0000-4000-8000-000000000012'::uuid, '919000000012'),
  ('b0000000-0000-4000-8000-000000000013'::uuid, '919000000013'),
  ('b0000000-0000-4000-8000-000000000014'::uuid, '919000000014'),
  ('b0000000-0000-4000-8000-000000000015'::uuid, '919000000015'),
  ('b0000000-0000-4000-8000-000000000016'::uuid, '919000000016'),
  ('b0000000-0000-4000-8000-000000000017'::uuid, '919000000017'),
  ('b0000000-0000-4000-8000-000000000018'::uuid, '919000000018'),
  ('b0000000-0000-4000-8000-000000000020'::uuid, '919000000020'),
  ('b0000000-0000-4000-8000-000000000021'::uuid, '919000000021')
), ins as (
  insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new,
                          email_change, phone_change, phone_change_token, email_change_token_current, reauthentication_token)
  select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', phone, now(),
         '{"provider":"phone","providers":["phone"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''
  from people
  returning id, phone
)
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select id::text, id, jsonb_build_object('sub', id::text, 'phone', phone), 'phone', now(), now() from ins;

insert into public.users (id, full_name, display_name, home_village_id, preferred_language) values
  ('b0000000-0000-4000-8000-000000000001', 'Platform Admin',      'Admin',     null,                                   'en'),
  ('b0000000-0000-4000-8000-000000000010', 'Srinivas Rao',        'Srinivas',  'a0000000-0000-4000-8000-000000000001', 'te'),
  ('b0000000-0000-4000-8000-000000000011', 'Padma Devi',          'Padma',     'a0000000-0000-4000-8000-000000000001', 'te'),
  ('b0000000-0000-4000-8000-000000000012', 'Kiran Kumar',         'Kiran',     'a0000000-0000-4000-8000-000000000001', 'en'),
  ('b0000000-0000-4000-8000-000000000013', 'Ramesh (Electrical)', 'Ramesh',    'a0000000-0000-4000-8000-000000000001', 'te'),
  ('b0000000-0000-4000-8000-000000000014', 'Suresh (Sanitation)', 'Suresh',    'a0000000-0000-4000-8000-000000000001', 'te'),
  ('b0000000-0000-4000-8000-000000000015', 'Lakshmi Narayana',    'Lakshmi',   'a0000000-0000-4000-8000-000000000001', 'te'),
  ('b0000000-0000-4000-8000-000000000016', 'Ravi Teja',           'Ravi',      'a0000000-0000-4000-8000-000000000001', 'en'),
  ('b0000000-0000-4000-8000-000000000017', 'Sita Mahalakshmi',    'Sita',      'a0000000-0000-4000-8000-000000000001', 'te'),
  ('b0000000-0000-4000-8000-000000000018', 'Gopal Krishna',       'Gopal',     'a0000000-0000-4000-8000-000000000001', 'en'),
  ('b0000000-0000-4000-8000-000000000020', 'Anjali Reddy',        'Anjali',    'a0000000-0000-4000-8000-000000000002', 'en'),
  ('b0000000-0000-4000-8000-000000000021', 'Venkat Rao',          'Venkat',    'a0000000-0000-4000-8000-000000000002', 'te');

with grants(user_id, role_key, village_id, department_id) as (values
  ('b0000000-0000-4000-8000-000000000001'::uuid, 'SUPER_ADMIN', null::uuid, null::uuid),
  ('b0000000-0000-4000-8000-000000000010', 'CITIZEN',        'a0000000-0000-4000-8000-000000000001', null),
  ('b0000000-0000-4000-8000-000000000010', 'PRESIDENT',      'a0000000-0000-4000-8000-000000000001', null),
  ('b0000000-0000-4000-8000-000000000011', 'CITIZEN',        'a0000000-0000-4000-8000-000000000001', null),
  ('b0000000-0000-4000-8000-000000000011', 'VICE_PRESIDENT', 'a0000000-0000-4000-8000-000000000001', null),
  ('b0000000-0000-4000-8000-000000000012', 'CITIZEN',        'a0000000-0000-4000-8000-000000000001', null),
  ('b0000000-0000-4000-8000-000000000012', 'SECRETARY',      'a0000000-0000-4000-8000-000000000001', null),
  ('b0000000-0000-4000-8000-000000000013', 'CITIZEN',        'a0000000-0000-4000-8000-000000000001', null),
  ('b0000000-0000-4000-8000-000000000013', 'WORKER',         'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000014', 'CITIZEN',        'a0000000-0000-4000-8000-000000000001', null),
  ('b0000000-0000-4000-8000-000000000014', 'WORKER',         'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000015', 'CITIZEN',        'a0000000-0000-4000-8000-000000000001', null),
  ('b0000000-0000-4000-8000-000000000016', 'CITIZEN',        'a0000000-0000-4000-8000-000000000001', null),
  ('b0000000-0000-4000-8000-000000000017', 'CITIZEN',        'a0000000-0000-4000-8000-000000000001', null),
  ('b0000000-0000-4000-8000-000000000018', 'CITIZEN',        'a0000000-0000-4000-8000-000000000001', null),
  ('b0000000-0000-4000-8000-000000000020', 'CITIZEN',        'a0000000-0000-4000-8000-000000000002', null),
  ('b0000000-0000-4000-8000-000000000020', 'SECRETARY',      'a0000000-0000-4000-8000-000000000002', null),
  ('b0000000-0000-4000-8000-000000000021', 'CITIZEN',        'a0000000-0000-4000-8000-000000000002', null)
)
insert into public.user_roles (user_id, role_id, village_id, department_id)
select g.user_id, r.id, g.village_id, g.department_id from grants g join public.roles r on r.key = g.role_key;
