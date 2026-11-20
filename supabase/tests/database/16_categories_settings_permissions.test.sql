begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
-- Phase 11 (part 3): categories (Super Admin), village settings (settings.manage),
-- role permissions (Super Admin, with lock-out and citizen guards).
create function pg_temp.login(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.u(p_n text) returns uuid language sql immutable as $$
  select ('b0000000-0000-4000-8000-0000000000' || p_n)::uuid $$;
create function pg_temp.settings(p_v uuid) returns jsonb language sql stable security definer as $$
  select settings from public.villages where id = p_v $$;
create function pg_temp.audits(p_action text) returns int language sql stable security definer as $$
  select count(*)::int from public.audit_logs where action = p_action $$;
create temp table c (id uuid);
grant select, insert on c to authenticated;

select plan(24);

-- Categories --------------------------------------------------------------
select pg_temp.login(pg_temp.u('12'));
select throws_like($$select public.upsert_category('PARKS', 'Parks')$$, '%MV_FORBIDDEN%',
  'a village secretary cannot change categories (they are shared)');

select pg_temp.login(pg_temp.u('01'));
insert into c select public.upsert_category('parks', 'Parks and playgrounds', 'పార్కులు', 'tree', 'LOW', 90, false);
select is((select key from public.issue_categories where id = (select id from c)), 'PARKS', 'super admin adds a category; code is upper-cased');
select throws_like($$select public.upsert_category('PARKS', 'Another parks')$$, '%MV_VALIDATION%', 'codes are unique');
select throws_like($$select public.upsert_category('GARDEN', 'Garbage')$$, '%MV_VALIDATION%', 'names are unique');
select lives_ok(format($$select public.upsert_category('IGNORED', 'Parks', null, null, null, 95, true, %L)$$, (select id from c)),
  'super admin edits a category');
select is((select key || ':' || name || ':' || photo_required from public.issue_categories where id = (select id from c)),
  'PARKS:Parks:true', 'editing keeps the code');
select lives_ok(format('select public.set_category_active(%L, false)', (select id from c)), 'super admin hides a category');
select is((select is_active from public.issue_categories where id = (select id from c)), false, 'it is hidden');
select ok(pg_temp.audits('category.updated') >= 2, 'category changes are audited');

select pg_temp.login(pg_temp.u('15'));
select is((select count(*)::int from public.issue_categories where id = (select id from c)), 0,
  'residents do not see a hidden category');

-- Village settings --------------------------------------------------------
select pg_temp.login(pg_temp.u('15'));
select throws_like($$select public.update_village_settings('a0000000-0000-4000-8000-000000000001', '{"auto_close_days": 10}')$$,
  '%MV_FORBIDDEN%', 'a resident cannot change settings');
select pg_temp.login(pg_temp.u('20'));
select throws_like($$select public.update_village_settings('a0000000-0000-4000-8000-000000000001', '{"auto_close_days": 10}')$$,
  '%MV_FORBIDDEN%', 'another village''s secretary cannot change them');

select pg_temp.login(pg_temp.u('12'));
select lives_ok($$select public.update_village_settings('a0000000-0000-4000-8000-000000000001',
  '{"auto_close_days": 10, "reminder_days": 4, "default_issue_visibility": "PRIVATE"}')$$, 'secretary saves settings');
select is(pg_temp.settings('a0000000-0000-4000-8000-000000000001') ->> 'auto_close_days', '10', 'auto-close saved');
select throws_like($$select public.update_village_settings('a0000000-0000-4000-8000-000000000001', '{"reminder_days": 10}')$$,
  '%MV_VALIDATION%', 'the reminder must come before auto-close');
select throws_like($$select public.update_village_settings('a0000000-0000-4000-8000-000000000001', '{"admin_phone": "9"}')$$,
  '%MV_VALIDATION%', 'unknown settings are refused');
select throws_like($$select public.update_village_settings('a0000000-0000-4000-8000-000000000001', '{"auto_close_days": "7; drop"}')$$,
  '%MV_VALIDATION%', 'numbers must be whole numbers');
select lives_ok($$select public.update_village_settings('a0000000-0000-4000-8000-000000000001', '{"default_issue_visibility": null}')$$,
  'null puts a setting back to its default');
select is(pg_temp.settings('a0000000-0000-4000-8000-000000000001') ? 'default_issue_visibility', false, 'the key is gone');

-- Role permissions ---------------------------------------------------------
select pg_temp.login(pg_temp.u('12'));
select throws_like($$select public.set_role_permissions('WORKER', array['issue.work'])$$, '%MV_FORBIDDEN%',
  'a secretary cannot edit role permissions');

select pg_temp.login(pg_temp.u('01'));
select throws_like($$select public.set_role_permissions('SUPER_ADMIN', array['issue.view_all'])$$, '%MV_FORBIDDEN%',
  'the Super Admin role cannot be edited (no lock-out)');
select throws_like($$select public.set_role_permissions('CITIZEN', array['issue.create', 'issue.view_internal'])$$, '%MV_VALIDATION%',
  'residents cannot receive staff-only permissions');
select throws_like($$select public.set_role_permissions('PRESIDENT', array['village.manage'])$$, '%MV_VALIDATION%',
  'village roles cannot receive platform permissions');
select is(public.set_role_permissions('WORKER',
  array(select rp.permission_key from public.role_permissions rp join public.roles r on r.id = rp.role_id
         where r.key = 'WORKER' and rp.permission_key <> 'issue.support')), 1,
  'removing one permission changes one row (and is audited by the trigger)');

select * from finish();
rollback;
