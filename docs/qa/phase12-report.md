# Phase 12: QA and security review

Date: 21 Nov 2026. Code reviewed: `main` at PR #11 (Phases 2 to 11), plus the fixes in the Phase 12 PR.

**Result: no open high or critical findings.** One high finding (a resident screen that would time out) and five medium/serious findings were fixed in this PR. What remains is low severity, accepted by design, or needs your accounts or a real phone (section 8).

## 1. Summary of findings

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | **High** | Resident **My issues** took 117 s with 104k issues on the platform. Supabase stops `authenticated` queries at 8 s, so the tab would fail for every resident once the platform grows. | Fixed: `list_my_issues()`, now 8 ms |
| 2 | Medium | Admin **All Issues** exact count took 1.7 to 2 s for a village with 5,000 issues (permission check ran per row). | Fixed: 15 to 28 ms |
| 3 | Medium | Worker **Work** list checked every open assignment in every village. | Fixed: only my assignments are checked |
| 4 | Medium | Admin website had no Content-Security-Policy (security.md asks for a strict CSP) and no HSTS. | Fixed |
| 5 | Critical (advisory label) | `tinypool` (via `vitest` 3) prototype-pollution advisories. Test tool only, never shipped. | Fixed: vitest 4.1.12 |
| 6 | Serious (WCAG 1.4.3) | Grey helper text 4.42:1 on the page background (needs 4.5:1) on All Issues, Issue page, Analytics. | Fixed |
| 7 | Serious (WCAG 4.1.2) | Analytics charts were keyboard-focusable inside `aria-hidden` containers. | Fixed |
| 8 | Minor | Photo alt text read "initial_evidence photo". | Fixed |
| 9 | Advisor ERROR | `security_definer_view` on the 4 read views. | Accepted by design (section 3) |
| 10 | Advisor WARN | `pg_net` extension in the `public` schema. | Open, low (section 3) |
| 11 | Moderate | `minimatch` advisory inside Expo build tooling (`@expo/fingerprint`). Build-time only. | Open, low: clears with an Expo update |
| 12 | Low (WCAG 1.4.11) | Input borders are 1.5:1 against white (non-text contrast asks for 3:1), mobile and admin. | Open: design choice, suggest a darker input border |
| 13 | Medium (process) | Test layers in testing.md not built yet: admin component tests, admin Playwright E2E, Edge Function Deno tests. | Open: follow-up |

## 2. Full test pass

Run on a fresh local stack (all migrations + seed):

| Check | Result |
|---|---|
| Database tests (pgTAP), 17 files | 370 passed (315 before + 55 new in test 17) |
| Unit tests: core 38, mobile 29 | all pass |
| Services integration tests against the local API | 55 passed (none skipped) |
| Typecheck, ESLint, Prettier | clean |
| Generated DB types up to date | yes (regenerated for `list_my_issues`) |
| Admin production build | pass |

## 3. Security checklist (docs/security.md)

Checked directly in the database catalog and code, not just by reading the docs.

| Item | Result |
|---|---|
| RLS enabled on every table in `public` | Yes, 0 tables without RLS |
| `anon` can read any table or view, or call any function in `public`/`private` | No (0 grants) |
| Client write grants on tables | Only `notifications.read_at` (mark as read). Everything else goes through RPCs |
| `SECURITY DEFINER` functions without a fixed `search_path` | 0 |
| Dynamic SQL in functions | None found |
| Service-only functions (push outbox, phone lookup) callable by users | No, `service_role` only |
| Base issue tables readable by clients | No. Reads go through the 4 views, each filtered by `can_view_issue` |
| History and audit tables append-only | Yes, UPDATE raises `MV_FORBIDDEN` (also re-checked after the restore drill) |
| Storage bucket | Private, 5 MB limit, jpeg/png/webp only; 2 policies (insert own folder, read if allowed) |
| Service role key in app bundles or `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` | No. Apps only read the URL and anon key |
| `dangerouslySetInnerHTML` / `eval` in apps | None |
| Admin headers | CSP and HSTS added; X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy already there |
| CSP tested in a browser | Every admin page loaded signed in with 0 CSP violations, including live updates over WebSocket |
| `send-push` / `push-receipts` | Reject calls without the shared secret (constant-time compare) |
| `invite-staff` / `prepare-mfa` | Check the caller's JWT and permission before using the service key; CORS limited to `ADMIN_WEB_ORIGIN` |
| Dependency audit (`pnpm audit`) | After this PR: 1 moderate (build tooling, item 11) |

### Supabase advisors (`supabase db advisors`, local stack)

- **ERROR security_definer_view** (issues, comments, attachments, timeline views). Intentional: the views run as owner so they can hide columns per viewer (reporter identity, internal notes), which RLS alone can't do. Compensating controls: base tables have no client grants, each view filters by `private.can_view_issue`, and new pgTAP test 17 checks for every seeded person (with and without MFA, suspended, revoked) that `issues_view` returns exactly the issues `can_view_issue` allows. Two deliberately broken versions of the view were both caught by the test. Recommendation: accept.
- **WARN extension_in_public** (`pg_net`). Moving it needs a drop and re-create, which can fail on a hosted project. Low risk. Fix for production: enable `pg_net` from the Supabase dashboard (it goes into the `extensions` schema) **before** the first `supabase db push`; the migration then skips it.
- **INFO**: 17 foreign keys without an index (actor/audit columns that are never joined in hot paths), 9 "unused" indexes (meaningless on a fresh local database), 8 tables with RLS on and no policy (intentional deny-all; read through views and RPCs). No action.

## 4. Load test of RLS queries

Data: 100 villages, 22k users, **104k issues**, 520k status history rows, 624k audit rows, **1.04M notifications**, 312k supporters, 208k comments, 208k photo rows, 64k assignments. The largest village (Ramapuram) has 5,000 issues and 2,000 residents. Each query ran as the real user role with their JWT, through the same views and functions the apps call. Median of 3 runs, local Docker, so read the numbers as relative.

| Who | Query | Before (ms) | After (ms) |
|---|---|---:|---:|
| Resident | My issues (old query shape) | **117,216** | 31 |
| Resident | My issues via `list_my_issues()` (now used by the app) | – | 8 |
| Resident | Village feed, 50 newest | 29 | 3 |
| Resident | Issue detail / timeline / comments / photos | 2 to 7 | 3 to 7 |
| Resident | Notifications, 50 newest; unread count | < 1 | < 1 |
| Busy resident (100 issues) | My issues | – | 113 |
| Secretary | All Issues page 1 + exact count | **1,687** | 17 |
| Secretary | All Issues, open filter | 385 | 8 |
| Secretary | All Issues, page 100 | **1,648** | 28 |
| Secretary | All Issues, search | 10 | 13 |
| Secretary | Dashboard, analytics (1 year), by category | 1 to 13 | 1 to 13 |
| Secretary | Audit log first page; users list | 44; 5 | 48; 8 |
| Worker | Work list (1,125 open items, far more than real) | **1,197** | 491 |
| Super Admin | All Issues page 1 + count | **2,057** | 15 |

What changed (migration `20261121000100_read_performance.sql`): `issues_view` now writes the `can_view_issue` rule inline so the permission lookups run once per query instead of once per row; the visibility rules themselves are unchanged and pinned by test 17. `list_my_issues()` starts from the resident's own issues and supported issues. `list_my_work()` only checks assignments that can be the worker's. The work list still checks each of its own rows, which is fine at real sizes (tens of items).

The scripts are in `supabase/load-test/` so this can be re-run before each release.

## 5. Accessibility pass

**Admin website**: axe-core (WCAG 2.0/2.1 A and AA plus best practices) on every page, signed in as the secretary: Dashboard, All Issues, Issue page, Departments, Workers, Users, Announcements, Analytics, Audit Logs, Categories, Settings, and Login. Found items 6 to 8 above; after the fixes, **0 violations on every page**.

**Mobile app** (code review; automated tools need a device): buttons, radios and switches carry roles, labels and state; the photo "remove" buttons have labels and a larger touch area; font scaling is never turned off; minimum touch heights are 40 to 50 pt. Text colours all pass AA (lowest: brand green on the soft green background, 4.87:1; muted text 5.99:1). Open: input border contrast (item 12).

## 6. Restore drill

Done on the loaded database (about 3.1M rows in total).

1. `pg_dump -Fc` of the whole database: 14 s, 119 MB.
2. `pg_restore -j 4` into a brand-new database: 15 s.
3. Row counts identical for issues, history, audit, notifications, comments, photos, users, auth users, roles and storage objects. An MD5 over every row of `issue_status_history` and `audit_logs` matched exactly.
4. All `public` tables still have RLS; all 33 triggers and the 15 policies outside `cron` came back.
5. Checks on the restored copy: a resident could read their issues through `issues_view`; `create_issue` ran its validations; an UPDATE on history was still refused.
6. The only restore errors were 19 about `pg_cron`, which can only live in the main `postgres` database. **Runbook note:** after a restore into a new project, check `select jobname, schedule from cron.job;` and re-create the reminder/auto-close and push wake-up jobs if they're missing.

This drill tests the data and schema side. The real production drill (Supabase PITR restore into a new project) needs your Supabase account; see section 8.

## 7. Changes in this PR

- `supabase/migrations/20261121000100_read_performance.sql`: faster `issues_view` (same rules), new `list_my_issues()`, faster `list_my_work()`.
- `supabase/tests/database/17_read_performance.test.sql`: view vs `can_view_issue` for every persona, plus the new function.
- `packages/services`: My issues uses `list_my_issues`.
- `apps/admin`: CSP + HSTS headers; contrast fix (grey-500 to grey-600 text); charts not focusable; photo alt text.
- `vitest` 3.2 to 4.1.12 in all packages; `@types/node` added as a dev dependency to `core` and `services` (its types used to arrive through vitest 3).
- `supabase/load-test/`: load data and benchmark scripts.
- Docs: this report, API catalog entry for `list_my_issues`.

## 8. Not checked here: needs a real phone or your accounts

| Item | Needs |
|---|---|
| Push notifications received on Android and iOS; invalid tokens revoked (Phase 10 exit) | Expo account + `eas init`, Firebase (Android), Apple developer account (iOS), a phone each |
| Login, report with photos on a low-end Android over a slow, interrupted connection (Phase 3/4 exits) | Real Android phone |
| Screen reader pass (TalkBack, VoiceOver), large text at 200%, Telugu rendering | Real phones |
| Edge Functions `send-push`, `push-receipts`, `invite-staff`, `prepare-mfa` running | Could not run locally here (proxy certificate issue); test on the staging Supabase project |
| Advisors on the real project: `supabase db advisors --linked` | Your Supabase project |
| Production Auth: SMS provider with DLT templates, OTP rate limits, MFA, optional captcha | Your Supabase dashboard + SMS provider |
| PITR enabled and a real restore into a new project; region Mumbai; separate staging and production projects | Your Supabase account (paid plan for PITR) |
| Secrets: `PUSH_SECRET`, `EXPO_ACCESS_TOKEN`, `ADMIN_WEB_ORIGIN`, Vault entries | Your Supabase project |
| CSP and HSTS on the real admin domain over HTTPS | Your hosting |
