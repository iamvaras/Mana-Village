# Mana Village: Design Docs

Status: **All Phase 0 questions answered (2026-11-20); docs updated to match. Phases 2–10 done; Phase 11 parts 1–2 (announcements; analytics and audit log) built, part 2 in review.**

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

## Changes made while building Phase 3

1. **Admin security code is enforced in the database.** Roles marked `requires_mfa` (President, Vice-President, Secretary, Super Admin) only grant permissions when the session has passed the authenticator step (`aal2`). Signing in with the SMS code alone gives no admin powers, even through the API. Workers do not need it.
2. **Staff accounts get a hidden placeholder email** (`<user id>@staff.mana-village.invalid`, never used for mail). Supabase needs an account label to create an authenticator code and staff sign in by phone only. The `prepare-mfa` Edge Function sets it, only for staff.
3. **New database functions:** `get_my_roles`, `grant_role`, `revoke_role`, `set_user_status` (suspend / reactivate), `admin_get_user_contact` (reveals a phone number, audited), `admin_list_users`. Each checks permissions in the database and writes an audit row. Nobody can grant a role to themselves, CITIZEN cannot be granted, and only a Super Admin can create another Super Admin.
4. **Invite staff** is the `invite-staff` Edge Function: it finds or creates the account for a phone number, then grants the role *as the inviting person*, so the same database permission check and audit apply.
5. **Suspended users** see an "account suspended" screen in the mobile app and "no access" on the admin website; the database already refuses their actions.
6. **Mobile session tokens** are stored only in the phone's secure keychain (split into small pieces because some phones limit one entry to about 2 KB).
7. **Mobile translations** use a small typed dictionary (`apps/mobile/src/i18n`) instead of an i18n library; a test checks Telugu has every English key. Telugu text still needs a native-speaker review.
8. Shared packages import without `.js` suffixes so both Next.js (Turbopack) and Expo (Metro) can bundle them.

## Changes made while building Phase 4

1. **Report flow order** is Category → Photos → Location → Similar issues → Details → Review, as proposed in ui-ux.md §2.1. The similar-issues step is skipped when there is no GPS (the search needs a position).
2. **Title is optional for residents.** If left empty, the app sends "<category> – <landmark>", which always fits the database limits. Many residents will not want to type a title.
3. **Drafts** are a JSON file plus the compressed photos in the app's private document folder. A draft is saved after every change. It is shown only to the same account and village, and deleted after sending, after joining an existing issue with "I'm affected too", or when discarded.
4. **Sending is resumable.** Photos upload one by one and each finished upload is remembered, so a retry skips them. The issue is created with the draft's `client_request_id`, so a lost reply can never create a second issue.
5. **Photos** are resized to at most 1600 px and re-encoded as JPEG (quality 0.7). Re-encoding also removes EXIF data, including the GPS position stored inside the photo.
6. **New first-party Expo modules** (listed in architecture.md): expo-image-picker, expo-image-manipulator, expo-location, expo-file-system, expo-crypto (for UUIDs).

## Changes made while building Phase 5

1. **Comment notifications come from a trigger** on `issue_comments` (migration `20261120001600`). Public comments notify the reporter, supporters and the assigned worker. Internal notes notify only the assigned worker(s). The author is never notified. Status-change notifications were already created inside the workflow functions.
2. **Assignment acceptance uses the exact clock time** (trigger), so "accepted" sorts correctly in the timeline next to other events.
3. **The timeline is built by `buildTimeline` in `packages/core`**, shared by both apps. Photos sent together with the report are folded into the "reported" entry ("Reported with 2 photos"), because in the database they are saved a moment before the SUBMITTED row.
4. **Photos are shown through private links** (signed URLs, valid 1 hour). Storage checks the viewer may see the issue before signing.
5. Residents can comment on issues they reported or support. On someone else's issue the app offers "I'm affected too" first.
6. The admin dashboard shows the 10 latest reports, linking to the new issue page (details, photos, timeline, public comments and internal notes). The full All Issues table comes in Phase 6.

## Changes made while building Phase 6

1. **Live updates use a private "issue changed" signal, not raw row streaming** (migration `20261120001700`). docs/api.md §6 planned `postgres_changes` on `issues`. That would need a direct read policy on the base table and would send every column (including fields residents must never see) to the browser. Instead a trigger sends `{id, version, op}` on the private Realtime channel `village:<id>:issues`, and only people holding `issue.view_all` in that village (with the security code for MFA roles) may listen. The admin page then reloads through `issues_view`, so the normal privacy rules apply again.
2. **Sample issues in the dev seed** (`supabase/seed/02_sample_issues.sql`, Ramapuram only plus one in Kondapalli). They are created and moved through the workflow with the real database functions, so their history, audit rows and notifications are real. Two extra sample residents were added: Sita (+91 90000 00017) and Gopal (+91 90000 00018). The expected dashboard numbers are listed at the top of the file and checked by `08_dashboard.test.sql`.
3. **Dashboard date range uses relative presets** (all time, last 7, 30 or 90 days), and the All Issues "Reported" filter uses the same presets. This avoids time-zone mistakes with calendar dates. A calendar date picker can come with the Analytics screen (Phase 11).
4. **All Issues filters live in the address bar**, so a filtered view can be bookmarked or shared with another staff member. Saved views: Open, Needs review, Critical, Reopened, Waiting for resident.
5. **"Affected" in the table counts the reporter plus supporters.**
6. Not in this phase: the "overdue" count from docs/ui-ux.md (needs assignment due dates, which arrive with assignment in Phase 7) and `resolution_trend` (Analytics, Phase 11).

## Changes made while building Phase 7

1. **New database functions for the Departments and Workers screens** (migration `20261120001800`): `upsert_department`, `set_department_active` (both named in docs/api.md), plus `admin_list_departments` (worker and open-issue counts) and `admin_list_workers` (open and completed work per worker). No new tables. Worker lists never include phone numbers.
2. **A department with open work cannot be deactivated.** Its issues must be reassigned first, so nothing is left without an owner.
3. **The issue page action panel shows only the next steps the database would allow** (from the shared workflow table in `packages/core`): Start review, Verify (with priority), Reject (reason shown to the resident), Mark as duplicate (find the earlier report by its number), Assign / Reassign (department, optional worker with current workload, optional due date, reason for reassigning), Review again. Priority and public/private can be changed at any time. Closing and reopening come with Phase 9.
4. **Every action sends the version the person was looking at.** If someone else changed the issue meanwhile, the database refuses and the page refreshes with a clear message.
5. **Database messages are shown as plain sentences** ("A department with this name already exists.") instead of the internal code prefix.
6. Adding a worker uses the existing `invite-staff` Edge Function, which cannot run in the local setup here; it was checked up to the phone-number validation. Removing a worker revokes the WORKER role with a reason (audited) and warns when they still have open issues.

## Changes made while building Phase 8

1. **One new database function, `list_my_work`** (migration `20261120001900`). It returns only the issues whose current assignment belongs to the signed-in worker: given to them by name, or to their department with nobody named yet. It uses the same rule as the work actions themselves, so the list and the allowed buttons always agree. No phone numbers or reporter details. No new tables. The accept / decline / start / progress / resolve functions already existed from Phase 5 and were not changed.
2. **The Work tab appears only for people holding an active WORKER role.** Hiding it is for convenience; the database returns nothing to anyone else.
3. **Work list groups:** Reopened, New, In progress, and Waiting for the resident (work sent as done but not yet confirmed). Urgent, high-priority and overdue work is tagged, and work given to the whole department shows "Not yet taken" until a worker accepts it.
4. **The work steps live on the normal issue screen** instead of a separate `work/[id]` screen: a "Your work" card appears there for the assigned worker, with the secretary's instruction, Open in Maps, and only the buttons the database would allow (Accept / Decline with a reason / Start work / Add an update / Mark as done). One screen means the worker also sees the timeline, photos and comments in one place.
5. **Updates are public notes so the resident sees progress.** Marking as done needs at least one completion photo; photos are resized and stripped of location data on the phone, as in the report flow. Staff notes (internal comments) are shown to the assigned worker with a "Staff note" label and are never shown to residents.
6. Declining sends the issue back to Verified and tells the secretary, who reassigns it.

## Changes made while building Phase 9

1. **No database changes were needed.** `confirm_resolution`, `close_issue`, `reopen_issue`, the 3-day reminder and the 7-day auto-close (both run by pg_cron) were already built in Phase 2. This phase added the screens and the end-to-end test (`11_resolution_lifecycle.test.sql`: one issue goes through solved, not solved, solved again, reminder, auto-close, reopened by staff, assigned again, and confirmed solved).
2. **Mobile "Was it fixed?" screen** (`issue/[id]/confirm`): shows the completion photos from the latest round of work and the worker's note, with **YES, SOLVED** and **NO, STILL NOT SOLVED**. "No" asks for a reason (at least 10 letters) and an optional photo. Only the reporter sees the buttons; anyone else, or a second visit after answering, sees where the issue stands. The alert "Was this problem actually solved?" and its reminder open this screen directly, and the issue screen shows a "Was it fixed?" card to the reporter while the issue waits.
3. **Admin issue page:** **Close without the resident** (only for a solved issue, reason required and shown to the resident) and **Reopen** (solved or closed issue, reason required).
4. **Reopening a closed issue does not hand it back to the worker by itself.** Closing finishes the earlier assignment, so the secretary assigns it again (the page says so). When the resident says "not solved", the same worker keeps the work and can restart straight away.
5. Photo picking for workers and residents now shares one component.

## Changes made while building Phase 10

1. **Push delivery runs through database functions** (migration `20261120002000`): `push_claim_batch`, `push_record_send`, `push_tickets_to_check`, `push_record_receipts`, callable by the service role only. The two Edge Functions (`send-push`, `push-receipts`) only talk to Expo and report back. No new tables; small columns were added to `notifications` (tickets, claim and send times) and one to `users` (`push_enabled`, the Settings switch, which the docs listed but had no column for).
2. **Waking `send-push`:** instead of a dashboard Database Webhook (which lives outside migrations), a statement trigger on `notifications` calls the function through `pg_net`, and pg_cron re-wakes it every minute while alerts are pending. The function URL and a shared secret are read from Supabase Vault; without them nothing is called, so local and test databases stay offline. Setup steps are in docs/api.md.
3. **Retries happen when sending** (network error, rate limit, Expo server error; at most 3 attempts). Receipts are used to find and revoke phones that no longer exist. Resending after a bad receipt was left out, because it could send the same alert twice to phones that did get it.
4. **Alerts that cannot or should not be delivered are marked SKIPPED:** phone notifications turned off, no active phone, suspended account, or older than a day. The Alerts tab still shows them.
5. **Privacy:** for a PRIVATE issue the lock-screen text is only the issue number. Push text never has phone numbers.
6. **Mobile:** the app asks for notification permission once after sign-in, registers the phone, unlinks it on sign-out, and has a "Phone notifications" switch in Profile. Tapping a notification opens the issue (or "Was it fixed?"); only known routes with a real id are accepted. Work alerts now open the issue screen (the old `/work/<id>` route is mapped there).
7. **New dependencies:** `expo-notifications` and `expo-device` (both first-party Expo, listed in docs/architecture.md).
8. **Not checked here:** real delivery to Android and iOS phones (the Phase 10 exit criterion). It needs an Expo account and project id, Firebase for Android and an Apple Developer account for iOS, and the functions deployed. Edge Functions also cannot run in this local setup, so the sending logic was tested on its own and the database side with pgTAP.

## Changes made while building Phase 11 (part 1: announcements)

1. **Phase 11 is split into three pull requests:** announcements; analytics and the audit log; users, categories and village settings.
2. **Announcement functions** (migration `20261120002100`): `upsert_announcement` (create or edit; archived ones cannot be edited), `publish_announcement` (draft to published) and `archive_announcement` (taken down, kept for the record, unpinned). All need `announcement.manage` for that village and are audited by the existing trigger. No new tables or columns.
3. **Publishing can alert residents:** one in-app alert (and so a push) to every active resident whose home village it is, in their own language, unless the author unticks "Alert residents". The author is not alerted.
4. **English text is required; Telugu is optional.** Readers whose language is Telugu see the Telugu text when it exists, otherwise the English.
5. **"Show until" date (optional):** after it, residents no longer see the announcement; the admin list shows it as "Ended".
6. **Mobile:** the Home tab shows the top announcement (pinned first, then newest) with "See all", plus a list and a detail screen. Announcement alerts open the detail screen.
7. **Admin menu:** items whose screens come in a later Phase 11 pull request (Users, Categories, Analytics, Audit Logs, Settings) stay marked "coming soon".

## Changes made while building Phase 11 (part 2: analytics and audit log)

1. **Analytics definitions signed off** by the user on 2026-11-20 (the Phase 11 exit criterion); the full list is in docs/api.md. One correction: average time to fix runs to the *final* "solved", not the first, which is what the Dashboard already computed.
2. **New read-only functions:** `analytics_report` (migration `20261120002300`: trend, time-to-fix groups, reopened rate) and `list_audit_logs` (migration `20261120002200`). Both check the permission and the second sign-in step in the database. No new tables.
3. **Analytics page:** 30 days / 90 days / 1 year / all time; reported, closed and reopened rate; a reported-and-closed line chart with a table view; a time-to-fix bar chart; category and department tables. Charts use `recharts` (already listed in docs/architecture.md).
4. **Audit Logs page:** newest first, 50 at a time with "Older entries"; filter by kind of action and dates; click a person to see only their actions, or "history" to see one item; each row opens a before/after list of the fields that changed. Audit rows never contain phone numbers.
5. **Not in this part:** CSV export (the docs mark it "later").
