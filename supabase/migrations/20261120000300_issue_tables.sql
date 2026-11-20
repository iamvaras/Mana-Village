-- =============================================================================
-- Issues and everything attached to them. See docs/database.md §3.
-- History and audit tables are append-only (enforced in a later migration).
-- =============================================================================

create table public.issue_number_counters (
  village_id  uuid not null references public.villages (id),
  year        int not null check (year between 2000 and 2999),
  last_value  int not null default 0 check (last_value >= 0),
  primary key (village_id, year)
);

create table public.issues (
  id                      uuid primary key default gen_random_uuid(),
  issue_number            text not null unique,
  village_id              uuid not null references public.villages (id),
  created_by              uuid not null references public.users (id),
  category_id             uuid not null references public.issue_categories (id),
  title                   text not null check (char_length(btrim(title)) between 5 and 120),
  description             text check (description is null or char_length(description) <= 2000),
  location_text           text check (location_text is null or char_length(location_text) <= 200),
  latitude                numeric(9,6) check (latitude between -90 and 90),
  longitude               numeric(9,6) check (longitude between -180 and 180),
  location_accuracy_m     numeric(8,2) check (location_accuracy_m is null or location_accuracy_m >= 0),
  priority                public.issue_priority not null default 'MEDIUM',
  status                  public.issue_status not null default 'SUBMITTED',
  visibility              public.issue_visibility not null default 'PUBLIC',
  assigned_department_id  uuid references public.departments (id),
  assigned_user_id        uuid references public.users (id),
  duplicate_of_issue_id   uuid references public.issues (id),
  supporter_count         int not null default 0 check (supporter_count >= 0),
  reopen_count            int not null default 0 check (reopen_count >= 0),
  version                 int not null default 1 check (version >= 1),
  client_request_id       uuid not null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  reviewed_at             timestamptz,
  verified_at             timestamptz,
  assigned_at             timestamptz,
  work_started_at         timestamptz,
  resolved_at             timestamptz,
  closed_at               timestamptz,
  rejected_at             timestamptz,
  last_status_change_at   timestamptz not null default now(),
  constraint issues_lat_lng_together check ((latitude is null) = (longitude is null)),
  constraint issues_location_present check (latitude is not null or char_length(btrim(coalesce(location_text, ''))) >= 3),
  constraint issues_not_self_duplicate check (duplicate_of_issue_id is null or duplicate_of_issue_id <> id),
  constraint issues_duplicate_has_target check (status <> 'DUPLICATE' or duplicate_of_issue_id is not null),
  -- Idempotent creation: a retried submit from the phone returns the same issue.
  constraint issues_client_request_uq unique (created_by, client_request_id)
);
create index issues_village_status_idx on public.issues (village_id, status);
create index issues_village_created_idx on public.issues (village_id, created_at desc, id);
create index issues_created_by_idx on public.issues (created_by, created_at desc);
create index issues_assigned_user_idx on public.issues (assigned_user_id) where assigned_user_id is not null;
create index issues_assigned_department_idx on public.issues (assigned_department_id) where assigned_department_id is not null;
create index issues_similar_idx on public.issues (village_id, category_id, status);
create index issues_resolved_idx on public.issues (status, last_status_change_at) where status = 'RESOLVED';

create table public.issue_assignments (
  id                uuid primary key default gen_random_uuid(),
  issue_id          uuid not null references public.issues (id),
  department_id     uuid not null references public.departments (id),
  assignee_user_id  uuid references public.users (id),
  assigned_by       uuid not null references public.users (id),
  assigned_at       timestamptz not null default now(),
  status            public.assignment_status not null default 'PENDING',
  responded_at      timestamptz,
  response_note     text check (response_note is null or char_length(response_note) <= 500),
  note              text check (note is null or char_length(note) <= 500),
  due_at            timestamptz,
  ended_at          timestamptz,
  constraint issue_assignments_ended_consistent
    check ((ended_at is null) = (status in ('PENDING', 'ACCEPTED')))
);
create unique index issue_assignments_one_active_uq on public.issue_assignments (issue_id) where ended_at is null;
create index issue_assignments_issue_idx on public.issue_assignments (issue_id, assigned_at);
create index issue_assignments_assignee_idx on public.issue_assignments (assignee_user_id) where ended_at is null;
create index issue_assignments_department_idx on public.issue_assignments (department_id) where ended_at is null;

create table public.issue_status_history (
  id              bigint generated always as identity primary key,
  issue_id        uuid not null references public.issues (id),
  from_status     public.issue_status,
  to_status       public.issue_status not null,
  actor_user_id   uuid references public.users (id),
  actor_role_key  text,
  reason          text check (reason is null or char_length(reason) <= 1000),
  metadata        jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  source          public.action_source not null,
  created_at      timestamptz not null default clock_timestamp(),
  constraint history_actor_or_system check (actor_user_id is not null or source = 'SYSTEM')
);
create index issue_status_history_issue_idx on public.issue_status_history (issue_id, id);

create table public.issue_comments (
  id             uuid primary key default gen_random_uuid(),
  issue_id       uuid not null references public.issues (id),
  author_id      uuid not null references public.users (id),
  body           text not null check (char_length(btrim(body)) between 1 and 1000),
  visibility     public.content_visibility not null default 'PUBLIC',
  created_at     timestamptz not null default clock_timestamp(),
  is_hidden      boolean not null default false,
  hidden_by      uuid references public.users (id),
  hidden_at      timestamptz,
  hidden_reason  text check (hidden_reason is null or char_length(hidden_reason) <= 500)
);
create index issue_comments_issue_idx on public.issue_comments (issue_id, created_at);

create table public.issue_attachments (
  id                uuid primary key default gen_random_uuid(),
  issue_id          uuid not null references public.issues (id),
  uploaded_by       uuid not null references public.users (id),
  kind              public.attachment_kind not null,
  visibility        public.content_visibility not null default 'PUBLIC',
  storage_path      text not null unique,
  mime_type         text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes        int not null check (size_bytes > 0 and size_bytes <= 5242880),
  width             int check (width is null or width > 0),
  height            int check (height is null or height > 0),
  status_at_upload  public.issue_status not null,
  created_at        timestamptz not null default clock_timestamp(),
  is_hidden         boolean not null default false,
  hidden_by         uuid references public.users (id),
  hidden_at         timestamptz,
  hidden_reason     text check (hidden_reason is null or char_length(hidden_reason) <= 500)
);
create index issue_attachments_issue_idx on public.issue_attachments (issue_id, created_at);

create table public.issue_supporters (
  issue_id    uuid not null references public.issues (id),
  user_id     uuid not null references public.users (id),
  created_at  timestamptz not null default now(),
  primary key (issue_id, user_id)
);
create index issue_supporters_user_idx on public.issue_supporters (user_id);

create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  recipient_id   uuid not null references public.users (id),
  village_id     uuid references public.villages (id),
  type           text not null check (type ~ '^[A-Z_]{2,60}$'),
  issue_id       uuid references public.issues (id),
  title          text not null check (char_length(title) <= 200),
  body           text not null check (char_length(body) <= 1000),
  data           jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  read_at        timestamptz,
  push_status    public.push_status not null default 'PENDING',
  push_attempts  int not null default 0,
  push_error     text,
  created_at     timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;
create index notifications_push_pending_idx on public.notifications (created_at) where push_status = 'PENDING';

create table public.push_tokens (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id),
  expo_push_token  text not null unique check (expo_push_token ~ '^(Exponent|Expo)PushToken\[.+\]$'),
  platform         text not null check (platform in ('ios', 'android')),
  app_version      text check (app_version is null or char_length(app_version) <= 40),
  last_seen_at     timestamptz not null default now(),
  revoked_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id) where revoked_at is null;

create table public.announcements (
  id            uuid primary key default gen_random_uuid(),
  village_id    uuid not null references public.villages (id),
  title         text not null check (char_length(btrim(title)) between 3 and 150),
  body          text not null check (char_length(btrim(body)) between 1 and 5000),
  title_local   text check (title_local is null or char_length(title_local) <= 150),
  body_local    text check (body_local is null or char_length(body_local) <= 5000),
  status        public.announcement_status not null default 'DRAFT',
  is_pinned     boolean not null default false,
  published_at  timestamptz,
  expires_at    timestamptz,
  created_by    uuid not null references public.users (id),
  updated_by    uuid references public.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint announcements_published_has_time check (status <> 'PUBLISHED' or published_at is not null)
);
create index announcements_village_idx on public.announcements (village_id, status, published_at desc);

create table public.audit_logs (
  id              bigint generated always as identity primary key,
  occurred_at     timestamptz not null default now(),
  actor_user_id   uuid references public.users (id),
  actor_role_key  text,
  village_id      uuid references public.villages (id),
  action          text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type     text not null,
  entity_id       text,
  before          jsonb,
  after           jsonb,
  metadata        jsonb not null default '{}'::jsonb
);
create index audit_logs_village_idx on public.audit_logs (village_id, occurred_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id, occurred_at desc);

create trigger issues_updated_at before update on public.issues
  for each row execute function private.set_updated_at();
create trigger announcements_updated_at before update on public.announcements
  for each row execute function private.set_updated_at();
