-- =============================================================================
-- Production reference data: roles, permission catalog, default role
-- permissions (docs/permissions.md §3) and issue categories.
-- Idempotent (ON CONFLICT DO NOTHING) so it never overwrites later admin edits.
-- =============================================================================

insert into public.roles (key, name, description, scope, is_system) values
  ('CITIZEN',        'Citizen',                 'Village resident who reports and follows issues', 'VILLAGE', true),
  ('PRESIDENT',      'President',               'Village President (Sarpanch)',                    'VILLAGE', true),
  ('VICE_PRESIDENT', 'Vice-President',          'Village Vice-President (configurable)',           'VILLAGE', true),
  ('SECRETARY',      'EO / Panchayat Secretary','Executive Officer / Panchayat Secretary',         'VILLAGE', true),
  ('WORKER',         'Worker / Department Staff','Field worker in a department',                    'VILLAGE', true),
  ('SUPER_ADMIN',    'Super Admin',             'Platform operator across all villages',           'GLOBAL',  true)
on conflict (key) do nothing;

insert into public.permissions (key, description, category, citizen_grantable) values
  ('issue.create',               'Report a new issue',                                  'issues', true),
  ('issue.view_public',          'See public issues in the village',                    'issues', true),
  ('issue.view_own',             'See own issues, including private ones',              'issues', true),
  ('issue.view_all',             'See all issues in the village, including private',    'issues', false),
  ('issue.view_internal',        'See internal notes and internal photos',              'issues', false),
  ('issue.support',              'Mark "I''m affected too"',                            'issues', true),
  ('issue.comment_public',       'Add public comments',                                 'issues', true),
  ('issue.comment_internal',     'Add internal staff notes',                            'issues', false),
  ('issue.review',               'Start review; reconsider rejected/duplicate issues',  'workflow', false),
  ('issue.verify',               'Verify an issue',                                     'workflow', false),
  ('issue.reject',               'Reject an issue',                                     'workflow', false),
  ('issue.mark_duplicate',       'Mark an issue as duplicate',                          'workflow', false),
  ('issue.set_priority',         'Change priority',                                     'workflow', false),
  ('issue.set_visibility',       'Change public/private visibility',                    'workflow', false),
  ('issue.assign',               'Assign and reassign issues',                          'workflow', false),
  ('issue.work',                 'Work on assigned issues (accept, start, resolve)',    'workflow', false),
  ('issue.resolve_any',          'Mark resolved without being the assignee',            'workflow', false),
  ('issue.confirm_resolution',   'Confirm or reject the resolution of own issue',       'workflow', true),
  ('issue.close',                'Close a resolved issue without the citizen',          'workflow', false),
  ('issue.reopen',               'Reopen a resolved or closed issue',                   'workflow', false),
  ('attachment.upload_evidence', 'Add evidence photos to own issue',                    'attachments', true),
  ('attachment.upload_work',     'Add progress/completion photos as staff',             'attachments', false),
  ('content.moderate',           'Hide comments and photos',                            'moderation', false),
  ('user.view_contact',          'Reveal a citizen phone number (audited)',             'users', false),
  ('user.manage',                'Suspend and reactivate users',                        'users', false),
  ('role.assign_worker',         'Grant and revoke the Worker role',                    'users', false),
  ('role.assign_admin',          'Grant and revoke President/VP/Secretary roles',       'users', false),
  ('department.manage',          'Create and edit departments',                         'config', false),
  ('announcement.manage',        'Create and publish announcements',                    'config', false),
  ('analytics.view',             'View dashboard and analytics',                        'reports', false),
  ('audit.view',                 'View audit logs',                                     'reports', false),
  ('village.manage',             'Create and edit villages',                            'platform', false),
  ('category.manage',            'Manage issue categories',                             'platform', false),
  ('permission.manage',          'Edit role permissions',                               'platform', false),
  ('settings.manage',            'Edit village settings',                               'config', false)
on conflict (key) do nothing;

with matrix(role_key, permission_key) as (
  values
  -- Citizen
  ('CITIZEN','issue.create'), ('CITIZEN','issue.view_public'), ('CITIZEN','issue.view_own'),
  ('CITIZEN','issue.support'), ('CITIZEN','issue.comment_public'), ('CITIZEN','issue.confirm_resolution'),
  ('CITIZEN','attachment.upload_evidence'),
  -- Worker: citizen rights + work on assigned issues
  ('WORKER','issue.create'), ('WORKER','issue.view_public'), ('WORKER','issue.view_own'),
  ('WORKER','issue.support'), ('WORKER','issue.comment_public'), ('WORKER','issue.confirm_resolution'),
  ('WORKER','attachment.upload_evidence'), ('WORKER','issue.work'),
  -- Super Admin: platform operator, read-only on the issue workflow
  ('SUPER_ADMIN','issue.view_public'), ('SUPER_ADMIN','issue.view_all'), ('SUPER_ADMIN','issue.view_internal'),
  ('SUPER_ADMIN','content.moderate'), ('SUPER_ADMIN','user.view_contact'), ('SUPER_ADMIN','user.manage'),
  ('SUPER_ADMIN','role.assign_worker'), ('SUPER_ADMIN','role.assign_admin'), ('SUPER_ADMIN','department.manage'),
  ('SUPER_ADMIN','analytics.view'), ('SUPER_ADMIN','audit.view'), ('SUPER_ADMIN','village.manage'),
  ('SUPER_ADMIN','category.manage'), ('SUPER_ADMIN','permission.manage'), ('SUPER_ADMIN','settings.manage')
),
village_admin(permission_key) as (
  values
  ('issue.create'), ('issue.view_public'), ('issue.view_own'), ('issue.view_all'), ('issue.view_internal'),
  ('issue.support'), ('issue.comment_public'), ('issue.comment_internal'), ('issue.review'), ('issue.verify'),
  ('issue.reject'), ('issue.mark_duplicate'), ('issue.set_priority'), ('issue.set_visibility'), ('issue.assign'),
  ('issue.resolve_any'), ('issue.confirm_resolution'), ('issue.close'), ('issue.reopen'),
  ('attachment.upload_evidence'), ('attachment.upload_work'), ('content.moderate'), ('user.view_contact'),
  ('announcement.manage'), ('analytics.view')
),
all_rows as (
  select role_key, permission_key from matrix
  union all select 'PRESIDENT', permission_key from village_admin
  union all select 'PRESIDENT', 'audit.view'
  union all select 'VICE_PRESIDENT', permission_key from village_admin
  union all select 'SECRETARY', permission_key from village_admin
  union all select 'SECRETARY', p from (values ('audit.view'), ('user.manage'), ('role.assign_worker'),
                                               ('department.manage'), ('settings.manage')) x(p)
)
insert into public.role_permissions (role_id, permission_key)
select r.id, a.permission_key
from all_rows a join public.roles r on r.key = a.role_key
on conflict do nothing;

insert into public.issue_categories (key, name, name_local, icon, sort_order, photo_required) values
  ('ROAD',         'Road damage',           'రోడ్డు సమస్య',        'road',        10, true),
  ('DRAINAGE',     'Drainage',              'మురుగు కాలువ',        'drain',       20, true),
  ('GARBAGE',      'Garbage',               'చెత్త',               'trash',       30, true),
  ('STREET_LIGHT', 'Street light',          'వీధి దీపం',            'lightbulb',   40, true),
  ('WATER',        'Water problem',         'నీటి సమస్య',          'water',       50, true),
  ('ELECTRICITY',  'Electricity (public)',  'విద్యుత్ సమస్య',       'bolt',        60, true),
  ('SANITATION',   'Sanitation',            'పారిశుద్ధ్యం',          'sanitation',  70, true),
  ('PUBLIC_INFRA', 'Public infrastructure', 'ప్రజా సౌకర్యాలు',       'building',    80, true),
  ('OTHER',        'Other',                 'ఇతర సమస్య',           'other',       90, false)
on conflict (key) do nothing;
