# Database Design

PostgreSQL (Supabase). All tables in `public` unless noted. All primary keys `uuid` (`gen_random_uuid()`) except append-only logs, which use `bigint generated always as identity` for cheap, strictly ordered inserts. All timestamps `timestamptz`, stored UTC.

## 1. ERD

```mermaid
erDiagram
  villages ||--o{ users : "home village"
  villages ||--o{ departments : has
  villages ||--o{ issues : has
  villages ||--o{ announcements : publishes
  villages ||--o{ user_roles : scopes
  villages ||--o{ issue_number_counters : numbers

  users ||--o{ user_roles : holds
  roles ||--o{ user_roles : granted_as
  roles ||--o{ role_permissions : grants
  permissions ||--o{ role_permissions : included_in
  departments ||--o{ user_roles : "staff of (workers)"

  issue_categories ||--o{ issues : classifies
  users ||--o{ issues : creates
  departments ||--o{ issues : "currently assigned"
  users ||--o{ issues : "currently assigned person"
  issues ||--o{ issues : "duplicate_of"

  issues ||--o{ issue_assignments : "assignment history"
  departments ||--o{ issue_assignments : to
  users ||--o{ issue_assignments : "assignee / assigned_by"

  issues ||--o{ issue_status_history : "transitions"
  users ||--o{ issue_status_history : actor

  issues ||--o{ issue_comments : has
  issues ||--o{ issue_attachments : has
  issues ||--o{ issue_supporters : "affected residents"
  users ||--o{ issue_supporters : supports

  users ||--o{ notifications : receives
  users ||--o{ push_tokens : registers
  users ||--o{ audit_logs : "actor"
```

## 2. Enums

```sql
issue_status      : SUBMITTED, UNDER_REVIEW, VERIFIED, ASSIGNED, IN_PROGRESS,
                    RESOLVED, CLOSED, REJECTED, REOPENED, DUPLICATE
issue_priority    : LOW, MEDIUM, HIGH, CRITICAL
issue_visibility  : PUBLIC, PRIVATE          -- PRIVATE = reporter + admins only
content_visibility: PUBLIC, INTERNAL         -- comments/attachments; INTERNAL = staff only
attachment_kind   : INITIAL_EVIDENCE, PROGRESS, COMPLETION, OTHER
assignment_status : PENDING, ACCEPTED, DECLINED, SUPERSEDED, COMPLETED
user_status       : ACTIVE, SUSPENDED, DELETED
announcement_status: DRAFT, PUBLISHED, ARCHIVED
push_status       : PENDING, SENT, FAILED, SKIPPED
action_source     : MOBILE, ADMIN_WEB, SYSTEM
```

Enums are Postgres enums (adding values later is a safe migration; removing is not, so we only add).

## 3. Tables

### villages
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| code | text unique not null | 2–6 uppercase letters, e.g. `VLG`; used in issue numbers; immutable once issues exist |
| name | text not null | |
| name_local | text | e.g. Telugu name |
| mandal, district, state | text | |
| timezone | text not null default `'Asia/Kolkata'` | |
| center_lat, center_lng | numeric(9,6) | used to sanity-check issue locations |
| settings | jsonb not null default `{}` | validated keys: `auto_close_days`, `reopen_window_days`, `default_issue_visibility`, `max_issues_per_user_per_day` |
| is_active | boolean default true | |
| created_at, updated_at | timestamptz | |

### users  (1:1 with `auth.users`)
| column | type | notes |
|---|---|---|
| id | uuid PK, FK → auth.users.id | |
| full_name | text not null | 2–80 chars |
| display_name | text | what other citizens see; default first name |
| home_village_id | uuid FK villages | citizen's village |
| preferred_language | text check in (`te`,`en`) default `'te'` | Telugu first |
| avatar_path | text | storage path, optional |
| status | user_status default ACTIVE | suspended users fail all permission checks |
| created_at, updated_at, deleted_at | timestamptz | |

**Phone number is not copied here.** It stays in `auth.users.phone`. Admins who are authorized can see it only through `admin_get_user_contact(user_id)`, which writes an audit log entry every time it is used. Column-level grants let other users read only `id, display_name, avatar_path`.

### roles
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| key | text unique | `CITIZEN, PRESIDENT, VICE_PRESIDENT, SECRETARY, WORKER, SUPER_ADMIN` |
| name, description | text | |
| scope | text check in (`VILLAGE`,`GLOBAL`) | SUPER_ADMIN is GLOBAL; others VILLAGE |
| is_system | boolean | system roles cannot be deleted |

### permissions  *(supporting table)*
| key text PK (e.g. `issue.verify`) | description | category |

Why: permission keys must be data so Super Admin can manage them, and so RLS and RPCs reference one catalog.

### role_permissions  *(supporting table)*
| role_id FK | permission_key FK | PK(role_id, permission_key) | updated_by, updated_at |

Why: this is what makes Vice-President (and any role) configurable without code changes. V1 is global per role. **Open question:** do villages need different permission sets for the same role?

### user_roles
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK users | |
| role_id | uuid FK roles | |
| village_id | uuid FK villages, null only for GLOBAL roles | check constraint enforces scope |
| department_id | uuid FK departments, nullable | required for WORKER |
| granted_by | uuid FK users | |
| granted_at | timestamptz | |
| revoked_at, revoked_by, revoke_reason | | **Roles are revoked, never deleted**, so we can always show who held a role at the time of an action |

Partial unique index: one active row per (user_id, role_id, village_id) `where revoked_at is null`.

### departments
| id | village_id FK | name | name_local | description | is_active | created_at | updated_at |

Unique (village_id, lower(name)). Deactivated, never deleted (old assignments reference them).

### issue_categories
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| key | text unique | `ROAD, DRAINAGE, GARBAGE, STREET_LIGHT, WATER, ELECTRICITY, SANITATION, PUBLIC_INFRA, OTHER` |
| name, name_local | text | |
| icon | text | icon name from the app's icon set |
| default_priority | issue_priority | nullable |
| sort_order | int | |
| is_active | boolean | |

V1: global categories managed by Super Admin. Village-specific categories or category→department auto-routing are open questions.

### issues
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| issue_number | text unique not null | `VLG-2026-00124`, generated in `create_issue` |
| village_id | uuid FK not null | |
| created_by | uuid FK users not null | |
| category_id | uuid FK not null | |
| title | text not null | 5–120 chars |
| description | text | ≤ 2000 chars |
| location_text | text | landmark, e.g. "Near ZP High School gate" |
| latitude | numeric(9,6) | check −90..90; nullable if GPS denied (then location_text required) |
| longitude | numeric(9,6) | check −180..180 |
| location_accuracy_m | numeric | from device GPS |
| priority | issue_priority not null default MEDIUM | set by admins only |
| status | issue_status not null default SUBMITTED | **only changed by workflow functions** |
| visibility | issue_visibility not null | default from village settings |
| assigned_department_id | uuid FK departments | denormalized from active assignment |
| assigned_user_id | uuid FK users | denormalized from active assignment |
| duplicate_of_issue_id | uuid FK issues | set when DUPLICATE; check ≠ id |
| supporter_count | int not null default 0 | maintained by trigger |
| reopen_count | int not null default 0 | |
| version | int not null default 1 | optimistic concurrency |
| created_at, updated_at | timestamptz | |
| reviewed_at, verified_at, assigned_at, work_started_at, resolved_at, closed_at, rejected_at | timestamptz | **first** time reached; latest values always derivable from history |
| last_status_change_at | timestamptz | |

Indexes: (village_id, status), (village_id, created_at desc), (created_by), (assigned_user_id) where not null, (assigned_department_id), (category_id), (village_id, category_id, status) for similar-issue lookup.

Timestamp semantics: the timestamp columns are a convenience for listing/analytics. **The authoritative record is `issue_status_history`.** If an issue is reopened and resolved again, `resolved_at` is updated to the latest resolution and analytics can use history for per-cycle durations.

### issue_number_counters  *(supporting table)*
| village_id FK | year int | last_value int | PK(village_id, year) |

Why: `create_issue` does `UPDATE … SET last_value = last_value + 1 RETURNING` inside the same transaction, which locks the row, so numbers are unique and sequential per village per year even under concurrent submissions. A Postgres sequence would leave gaps on rollback and cannot reset per year.

### issue_assignments  (full assignment history)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| issue_id | uuid FK | |
| department_id | uuid FK not null | |
| assignee_user_id | uuid FK users | nullable = assigned to department, not yet a person |
| assigned_by | uuid FK users | |
| assigned_at | timestamptz | |
| status | assignment_status | PENDING → ACCEPTED/DECLINED; SUPERSEDED on reassignment; COMPLETED on resolution |
| responded_at | timestamptz | |
| response_note | text | required on DECLINED |
| note | text | instruction from admin |
| due_at | timestamptz | optional target date, shown to staff only |
| ended_at | timestamptz | |

Partial unique index: one active assignment per issue `where ended_at is null`. Never deleted.

### issue_status_history  (append-only, permanent)
| column | type | notes |
|---|---|---|
| id | bigint identity PK | |
| issue_id | uuid FK not null | |
| from_status | issue_status | null for initial SUBMITTED |
| to_status | issue_status not null | |
| actor_user_id | uuid FK users | null only for SYSTEM actions (e.g. auto-close) |
| actor_role_key | text | role snapshot at the time (e.g. `SECRETARY`), so history stays correct after role changes |
| reason | text | required for REJECTED, DUPLICATE, REOPENED, citizen "not solved" |
| metadata | jsonb | e.g. `{"duplicate_of": "...", "assignment_id": "...", "confirmation": "SOLVED"}` |
| source | action_source | |
| created_at | timestamptz default now() | |

Protection: `REVOKE UPDATE, DELETE` from all API roles + trigger that raises on UPDATE/DELETE. Inserts only via workflow functions (no INSERT grant to `authenticated`).

### issue_comments
| id | issue_id | author_id | body (1–1000) | visibility (PUBLIC/INTERNAL) | created_at | is_hidden | hidden_by | hidden_at | hidden_reason |

No editing or deletion in V1; moderators can **hide** (row stays, shown as "Comment removed by moderator" to staff with reason). INTERNAL comments = "private administrative notes", never readable by citizens (RLS).

### issue_attachments
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| issue_id | uuid FK | |
| uploaded_by | uuid FK | |
| kind | attachment_kind | |
| visibility | content_visibility | default PUBLIC for evidence/completion |
| storage_path | text unique | `{village_id}/{issue_id}/{attachment_id}.jpg` |
| mime_type | text | allow-list: image/jpeg, image/png, image/webp |
| size_bytes | int | ≤ 5 MB after compression |
| width, height | int | |
| status_at_upload | issue_status | which stage the photo belongs to |
| created_at | timestamptz | |
| is_hidden, hidden_by, hidden_at, hidden_reason | | moderation, no hard delete |

### issue_supporters  ("I'm affected too")
| issue_id FK | user_id FK | created_at | PK(issue_id, user_id) |

Trigger keeps `issues.supporter_count` in sync. Reporter cannot support their own issue. **Open question:** can a supporter withdraw? (Default: yes, removal allowed; this is not issue history.)

### notifications  (in-app inbox + push outbox)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| recipient_id | uuid FK users | |
| village_id | uuid FK | |
| type | text | `ISSUE_STATUS_CHANGED, ISSUE_ASSIGNED, RESOLUTION_CONFIRM_REQUEST, COMMENT_ADDED, ANNOUNCEMENT, ...` |
| issue_id | uuid FK nullable | |
| title, body | text | rendered in recipient's language at insert time |
| data | jsonb | deep link, e.g. `{"route": "/issue/<id>/confirm"}` |
| read_at | timestamptz | |
| push_status | push_status default PENDING | |
| push_attempts | int | |
| push_error | text | |
| created_at | timestamptz | |

### push_tokens  *(supporting table)*
| id | user_id FK | expo_push_token text unique | platform (ios/android) | app_version | last_seen_at | revoked_at |

Why: one user may have several phones; tokens get invalidated (Expo returns `DeviceNotRegistered`) and must be revoked without touching the user row.

### announcements
| id | village_id | title | body | title_local | body_local | status | is_pinned | published_at | expires_at | created_by | updated_by | created_at | updated_at |

Edits after publishing are audited (before/after in `audit_logs`).

### audit_logs  (append-only)
| column | type | notes |
|---|---|---|
| id | bigint identity PK | |
| occurred_at | timestamptz default now() | |
| actor_user_id | uuid | null = SYSTEM |
| actor_role_key | text | |
| village_id | uuid | |
| action | text | e.g. `issue.verify`, `issue.priority_changed`, `user_role.granted`, `user.contact_viewed`, `announcement.updated`, `department.deactivated` |
| entity_type | text | `issue`, `user_role`, `department`, ... |
| entity_id | text | |
| before | jsonb | |
| after | jsonb | |
| metadata | jsonb | request id, client source, user agent where available |

Same protection as status history: no UPDATE/DELETE. Readable only with `audit.view`.

**Relationship between audit_logs and issue_status_history:** status history is the citizen-facing, issue-specific record. Audit logs cover all important administrative actions across the system (role grants, priority changes, contact reveals, moderation, config changes). Workflow actions write to both.

## 4. Views and functions (DB layer)

| Name | Kind | Purpose |
|---|---|---|
| `issue_timeline` | view, `security_invoker = true` | `UNION ALL` of status history, assignments, attachments, comments → `(issue_id, occurred_at, event_type, actor_display_name, actor_role_key, summary, payload)`. RLS on the underlying tables decides what each viewer sees (citizens never see INTERNAL rows) |
| `has_permission(p_village uuid, p_perm text)` | `STABLE SECURITY DEFINER` | true if the current user (`auth.uid()`) is ACTIVE and holds a non-revoked role in that village (or a GLOBAL role) whose permissions include `p_perm` |
| `is_assigned_worker(p_issue uuid)` | `STABLE SECURITY DEFINER` | true if current user is the assignee, or (when no person is assigned) a WORKER in the assigned department |
| `can_view_issue(p_issue uuid)` | `STABLE SECURITY DEFINER` | single place for issue visibility rules; used by RLS on child tables and Storage |
| `get_my_permissions(p_village uuid)` | RPC | returns permission keys for UI button visibility only |
| Workflow RPCs | `SECURITY DEFINER` | see [api.md](api.md) |
| `dashboard_stats`, `issues_by_category`, `issues_by_department`, `resolution_metrics` | RPC | analytics, permission-checked |

All `SECURITY DEFINER` functions use `SET search_path = ''` and schema-qualified names (prevents search_path hijacking).

## 5. Migrations and data safety

- Supabase CLI migrations in `supabase/migrations`, forward-only, reviewed in PRs.
- No `DROP TABLE`/`DROP COLUMN`/destructive `ALTER TYPE` on tables with data. Columns are deprecated first, removed only in a later release after confirming no use, and never on history/audit tables.
- Seed data in `supabase/seed/` is for local and staging only. Production reference data (roles, permissions, categories) is inserted by migrations using `ON CONFLICT DO NOTHING`.
- Production: daily backups + Point-in-Time Recovery (Supabase Pro). Restore drill before launch.

## 6. Account deletion vs. permanent history

Users may ask to delete their account (and India's DPDP Act 2023 gives them rights over their personal data). History must stay. Approach: **anonymize, don't delete**. `users.full_name/display_name` become "Deleted user", `status = DELETED`, auth user is removed, phone is gone. Issues, history and audit rows keep the user id, which now resolves to an anonymized profile. Needs your confirmation (open question).
