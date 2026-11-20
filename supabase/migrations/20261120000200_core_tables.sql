-- =============================================================================
-- Villages, users, roles and permissions, departments, categories.
-- See docs/database.md §3.
-- =============================================================================

create table public.villages (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (code ~ '^[A-Z]{2,6}$'),
  name         text not null check (char_length(btrim(name)) between 2 and 100),
  name_local   text check (name_local is null or char_length(name_local) <= 100),
  mandal       text check (mandal is null or char_length(mandal) <= 100),
  district     text check (district is null or char_length(district) <= 100),
  state        text check (state is null or char_length(state) <= 100),
  timezone     text not null default 'Asia/Kolkata',
  center_lat   numeric(9,6) check (center_lat between -90 and 90),
  center_lng   numeric(9,6) check (center_lng between -180 and 180),
  settings     jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on column public.villages.code is 'Used in issue numbers (VLG-2026-00124). Immutable once issues exist.';
comment on column public.villages.settings is
  'Keys: auto_close_days (int, default 7), reminder_days (int, default 3), default_issue_visibility (PUBLIC|PRIVATE), max_issues_per_user_per_day (int, default 10), similar_issue_radius_m (int, default 200).';

-- 1:1 with auth.users. Phone number is deliberately NOT stored here (it stays in auth.users).
create table public.users (
  id                  uuid primary key references auth.users (id) on delete restrict,
  full_name           text not null check (char_length(btrim(full_name)) between 2 and 80),
  display_name        text check (display_name is null or char_length(btrim(display_name)) between 1 and 80),
  home_village_id     uuid references public.villages (id),
  preferred_language  text not null default 'te' check (preferred_language in ('te', 'en')),
  avatar_path         text check (avatar_path is null or char_length(avatar_path) <= 300),
  status              public.user_status not null default 'ACTIVE',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index users_home_village_idx on public.users (home_village_id);

create table public.roles (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique check (key ~ '^[A-Z_]{2,40}$'),
  name         text not null,
  description  text,
  scope        public.role_scope not null default 'VILLAGE',
  is_system    boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.permissions (
  key          text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  description  text not null,
  category     text not null,
  -- Permissions that must never be granted to the CITIZEN role (e.g. internal notes).
  citizen_grantable boolean not null default true
);

create table public.role_permissions (
  role_id         uuid not null references public.roles (id),
  permission_key  text not null references public.permissions (key),
  updated_by      uuid references public.users (id),
  updated_at      timestamptz not null default now(),
  primary key (role_id, permission_key)
);

create table public.departments (
  id           uuid primary key default gen_random_uuid(),
  village_id   uuid not null references public.villages (id),
  name         text not null check (char_length(btrim(name)) between 2 and 100),
  name_local   text check (name_local is null or char_length(name_local) <= 100),
  description  text check (description is null or char_length(description) <= 500),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index departments_village_name_uq on public.departments (village_id, lower(name));

create table public.user_roles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id),
  role_id        uuid not null references public.roles (id),
  village_id     uuid references public.villages (id),
  department_id  uuid references public.departments (id),
  granted_by     uuid references public.users (id),
  granted_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  revoked_by     uuid references public.users (id),
  revoke_reason  text check (revoke_reason is null or char_length(revoke_reason) <= 500)
);
-- One active grant per (user, role, village). Revoked rows are kept forever.
create unique index user_roles_active_uq
  on public.user_roles (user_id, role_id, coalesce(village_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;
create index user_roles_user_idx on public.user_roles (user_id) where revoked_at is null;
create index user_roles_village_idx on public.user_roles (village_id) where revoked_at is null;
create index user_roles_department_idx on public.user_roles (department_id) where revoked_at is null;

create table public.issue_categories (
  id                uuid primary key default gen_random_uuid(),
  key               text not null unique check (key ~ '^[A-Z_]{2,40}$'),
  name              text not null check (char_length(btrim(name)) between 2 and 60),
  name_local        text check (name_local is null or char_length(name_local) <= 60),
  icon              text check (icon is null or char_length(icon) <= 60),
  default_priority  public.issue_priority,
  sort_order        int not null default 0,
  is_active         boolean not null default true,
  -- Whether a photo is required when reporting in this category (OTHER = false).
  photo_required    boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger villages_updated_at before update on public.villages
  for each row execute function private.set_updated_at();
create trigger users_updated_at before update on public.users
  for each row execute function private.set_updated_at();
create trigger departments_updated_at before update on public.departments
  for each row execute function private.set_updated_at();
create trigger issue_categories_updated_at before update on public.issue_categories
  for each row execute function private.set_updated_at();
