# API and Service Architecture

## 1. Three kinds of server interface

| Kind | Used for | Auth |
|---|---|---|
| **PostgREST reads** (`supabase.from(...).select()`) | Lists, details, timeline, notifications, announcements | User JWT; RLS decides rows; column grants decide columns |
| **Postgres RPCs** (`supabase.rpc(...)`) | Every write that matters: workflow, comments, supporters, attachments registration, admin actions, analytics | User JWT; function checks `has_permission` + context |
| **Edge Functions** | Things Postgres cannot do: call Expo Push, create auth users for staff invites | `send-push`/`push-receipts`: internal only (webhook secret / cron). `invite-staff`: user JWT + permission check, then service role |

Simple owner-only writes use direct table access with RLS: update own profile, mark own notifications read, register/revoke own push token.

## 2. RPC catalog

All RPCs: `SECURITY DEFINER`, `SET search_path = ''`, validate every argument, raise typed errors (§4), return the updated row or a small result object.

### Citizen
| RPC | Args | Returns |
|---|---|---|
| `create_issue` | village_id, category_id, title, description, location_text, latitude, longitude, location_accuracy_m, visibility?, client_request_id | issue (id, issue_number) |
| `add_issue_photos` | issue_id, kind, attachments (see §5), visibility | count |
| `find_similar_issues` | category_id, latitude, longitude, radius_m? | list (id, issue_number, title, status, distance_m, supporter_count, thumbnail_path) |
| `support_issue` / `unsupport_issue` | issue_id | supporter_count |
| `add_comment` | issue_id, body, visibility | comment |
| `confirm_resolution` | issue_id, solved boolean, reason?, expected_version | issue |
| `get_my_permissions` | village_id | text[] |

`client_request_id` (uuid generated on the phone) makes `create_issue` idempotent: if a flaky network makes the app retry, the same issue is returned instead of a second one.

### Staff workflow
`start_review`, `verify_issue`, `reject_issue`, `mark_duplicate`, `assign_issue`, `accept_assignment`, `decline_assignment`, `start_work`, `add_progress_update`, `resolve_issue`, `close_issue`, `reopen_issue`, `reconsider_issue`, `set_issue_priority`, `set_issue_visibility`, `hide_comment`, `hide_attachment`.
Each takes `issue_id`, `expected_version`, plus the fields in [issue-workflow.md](issue-workflow.md) §2.

### Administration
| RPC | Permission |
|---|---|
| `grant_role` / `revoke_role` (user_id, role_key, village_id, department_id?, reason) | `role.assign_worker` / `role.assign_admin` |
| `set_user_status` (user_id, status, reason) | `user.manage` |
| `admin_get_user_contact` (user_id) | `user.view_contact`; always audited |
| `upsert_department`, `set_department_active` | `department.manage` |
| `upsert_category`, `set_category_active` | `category.manage` |
| `upsert_announcement`, `publish_announcement`, `archive_announcement` | `announcement.manage` |
| `set_role_permissions` (role_key, permission_keys[]) | `permission.manage` |
| `update_village_settings` (village_id, settings) | `settings.manage` |

### Analytics (read-only, `analytics.view`)
`dashboard_stats(village_id, from, to)` → totals per status bucket, critical count, resolution rate, avg resolution time, pending count.
`issues_by_category`, `issues_by_department`, `resolution_trend(village_id, interval)`.
Definitions (approved 2026-11-20): **Open** = not in CLOSED/REJECTED/DUPLICATE. **Resolution rate** = CLOSED ÷ (all − REJECTED − DUPLICATE). **Average resolution time** = created_at → first RESOLVED, closed issues only.

### Edge Functions
| Function | Trigger | Does |
|---|---|---|
| `send-push` | Database webhook on `notifications` INSERT | loads recipient's active push tokens, sends via Expo Push API in batches, sets `push_status`, stores ticket ids |
| `push-receipts` | pg_cron every 15 min | checks Expo receipts, revokes `DeviceNotRegistered` tokens, retries transient failures (max 3) |
| `invite-staff` | Admin web | verifies caller has `role.assign_worker`/`role.assign_admin`, creates or finds auth user by phone, then calls `grant_role` |

### Scheduled jobs (pg_cron)
`auto_close_resolved` (hourly), `resolution_reminders` (daily), `cleanup_orphan_uploads` (daily: storage objects with no `issue_attachments` row after 24 h).

## 3. Shared service layer (`packages/services`)

Both apps call the same functions. No component or hook calls Supabase directly.

```ts
// packages/services/src/issues/issues.service.ts (shape only, not final code)
export interface IssuesService {
  listMine(params: { cursor?: string }): Promise<Result<Page<IssueSummary>>>;
  listPublic(params: { villageId: string; status?: IssueStatus[]; cursor?: string }): Promise<Result<Page<IssueSummary>>>;
  getById(id: string): Promise<Result<IssueDetail>>;
  create(input: CreateIssueInput): Promise<Result<{ id: string; issueNumber: string }>>;
  findSimilar(input: SimilarIssueQuery): Promise<Result<SimilarIssue[]>>;
  support(issueId: string): Promise<Result<{ supporterCount: number }>>;
  confirmResolution(input: ConfirmResolutionInput): Promise<Result<IssueDetail>>;
}
```

Modules: `auth`, `issues`, `timeline`, `comments`, `attachments`, `supporters`, `workflow` (staff RPCs), `assignments`, `notifications`, `announcements`, `admin` (users/roles/departments/categories/settings), `analytics`, `audit`.

Rules:
- Each service takes a `SupabaseClient` in its factory (`createIssuesService(client)`), so mobile and admin (server and browser) inject their own client.
- Inputs are validated with the zod schemas from `packages/core/validation` before any network call; the database validates again.
- Return `Result<T, AppError>` instead of throwing, so every screen handles errors explicitly.
- Pagination: keyset (cursor on `created_at, id`), page size 20.

## 4. Error model

| AppError.code | Source | UI behavior |
|---|---|---|
| `NETWORK` | fetch failure / timeout | "No internet. We'll retry." + retry button; drafts kept |
| `AUTH_REQUIRED` | 401 / expired refresh token | send to login, keep draft |
| `FORBIDDEN` | RPC raises `MV_FORBIDDEN` / RLS denies | "You don't have permission for this action." |
| `NOT_FOUND` | no row (or hidden by RLS: treated the same, so we don't leak existence) | "This issue is not available." |
| `VALIDATION` | zod or `MV_VALIDATION` with field key | inline field message |
| `INVALID_TRANSITION` | `MV_INVALID_TRANSITION` | "This issue was already updated." + refresh |
| `CONFLICT` | `MV_CONFLICT` (stale version) | refresh and show latest state |
| `RATE_LIMITED` | `MV_RATE_LIMIT` | "You've reported many issues today, try tomorrow." |
| `UPLOAD_FAILED` | storage error | per-photo retry; issue not submitted until required photos succeed |
| `UNKNOWN` | anything else | generic message + error id logged |

DB functions raise with a custom SQLSTATE class (e.g. `P0001` + `MV_*` message prefix and a `detail` JSON for field errors). `packages/services/errors` maps them once.

## 5. Photo upload flow

```
1. Pick/take photo (expo-image-picker)
2. Resize to max 1600 px, JPEG quality ~0.7, which also strips EXIF (expo-image-manipulator)
3. Generate attachment_id (uuid) client-side
4. Upload to storage: issue-attachments/{auth.uid()}/{attachment_id}.jpg
   → Storage policy: only into your own folder, images only, 5 MB max
5. Pass [{id, path, width, height}] to the action that uses the photos:
   create_issue (evidence), resolve_issue (completion), add_progress_update (progress),
   confirm_resolution (citizen's "not solved" photo) or add_issue_photos.
   The function checks the object exists, belongs to the caller, and re-checks the
   MIME type and size that Storage recorded, then registers it to the issue.
6. On failure at 4: retry per photo with backoff. Uploaded but never registered
   objects are cleaned up by a scheduled job (Phase 4).
```

Photos are uploaded **before** the issue is created, so "photo required" is enforced by `create_issue` itself (except category OTHER) and `resolve_issue` requires a completion photo taken during the current work cycle.

Viewing: `createSignedUrl` (or batch `createSignedUrls`) valid ~1 hour, only after Storage RLS confirms `can_view_issue`.

## 6. Realtime

Only the admin **All Issues** list and **Issue Details** listen for changes. A database trigger sends a content-free signal `issue_changed {id, version, op}` on the private channel `village:<village_id>:issues`; only holders of `issue.view_all` in that village may join (policy on `realtime.messages`). The page then refetches through `issues_view`. (Changed in Phase 6 from `postgres_changes`, which would have exposed every column of the base table.) Mobile does not use Realtime in V1; it refetches on focus and on push receipt (cheaper on battery and data).
