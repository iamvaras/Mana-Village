# Mana Village: Design Docs

Status: **All Phase 0 questions answered (2026-11-20); docs updated to match. Awaiting approval to start Phase 2.** No application code has been written.

Mana Village is an issue tracking, resolution and transparency system for village civic problems. It is not a complaint form. Every issue carries a permanent, reconstructable timeline of who did what and when.

## How these docs map to the 12 items you asked for

| # | Item requested | Where |
|---|---|---|
| 1 | Recommended final architecture | [architecture.md](architecture.md) |
| 2 | Complete database ERD/design | [database.md](database.md) |
| 3 | Role and permission matrix | [permissions.md](permissions.md) |
| 4 | Complete issue lifecycle | [issue-workflow.md](issue-workflow.md) |
| 5 | API/service architecture | [api.md](api.md) |
| 6 | Mobile screen architecture | [ui-ux.md](ui-ux.md) §2 |
| 7 | Admin screen architecture | [ui-ux.md](ui-ux.md) §3 |
| 8 | Recommended project folder structure | [architecture.md](architecture.md) §6 |
| 9 | Security architecture | [security.md](security.md) |
| 10 | V1 development plan | [development-plan.md](development-plan.md) |
| 11 | Risks and architectural problems | [phase0-analysis.md](phase0-analysis.md) §1 |
| 12 | Missing requirements | [phase0-analysis.md](phase0-analysis.md) §2 |
| – | **Open questions for you** | [phase0-analysis.md](phase0-analysis.md) §3 |
| – | Product requirements (consolidated) | [product-requirements.md](product-requirements.md) |
| – | Testing plan | [testing.md](testing.md) |

## Proposed changes to your suggested structure (explained before adopting)

1. **`packages/` folder added** (`packages/core`, `packages/services`). Both apps need the same status machine, permission keys, validation schemas and Supabase data-access functions. Without a shared package these would be duplicated in mobile and admin, which breaks rule 4 ("no duplicate components/services").
2. **`docs/development-plan.md` and `docs/phase0-analysis.md` added.** The V1 plan, risks and open questions did not fit cleanly in the nine docs you listed.
3. **`supabase/tests/` added** for database-level tests (RLS and workflow functions). Authorization lives in the database, so it must be tested there.

## Proposed supporting tables (beyond your 15 entities)

Each is explained in [database.md](database.md) §3.

| Table | Why it is needed |
|---|---|
| `permissions` | Catalog of permission keys, so permissions are data, not code |
| `role_permissions` | Makes role permissions configurable (needed for "Vice-President permissions must be configurable") |
| `issue_number_counters` | Gap-free, concurrency-safe `VLG-2026-00124` numbering per village per year |
| `push_tokens` | A user can have several devices; Expo tokens expire and must be tracked separately from users |

One **view** (not a table): `issue_timeline`, which merges status history, assignments, attachments and public comments into one ordered timeline.

## Changes made while building Phase 2

These refine the design above; the code and these notes win where they differ.

1. **Photo upload path** is `issue-attachments/{user_id}/{attachment_id}.jpg` (not per issue). Photos are uploaded first and passed to the action that needs them, so required photos are enforced in the database. See [api.md](api.md) §5.
2. **Clients never read issue tables directly.** They read `issues_view`, `issue_timeline_view`, `issue_comments_view` and `issue_attachments_view`. These apply the visibility rules and hide the reporter's name and the supporter list from other citizens, which row-level security alone cannot do (it hides rows, not columns).
3. **Reassignment is also allowed while IN_PROGRESS** (status goes back to ASSIGNED, reason required).
4. **The assignment stays active through RESOLVED** and ends (COMPLETED) only when the issue is CLOSED, so after "NO, STILL NOT SOLVED" the same worker can restart.
5. **Accepting a department-level assignment claims it**: the accepting worker becomes the assignee. Starting work also implicitly accepts.
6. Added columns: `issues.client_request_id` (safe retries), `issue_categories.photo_required`, `permissions.citizen_grantable` (blocks granting internal-only permissions to citizens).
7. Event times in history, comments and photos use the exact clock time so the timeline order is precise.
8. Telugu notification and category texts are first drafts and need a native-speaker review before launch.
