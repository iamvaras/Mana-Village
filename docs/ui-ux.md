# UI / UX Plan

## 1. Principles (target user may not be technically experienced)

- One primary action per screen, large buttons (min 48 dp touch targets), icons + words, never icons alone.
- Local language first (Telugu + English, Telugu first), simple words, no jargon ("Problem" not "Issue ticket").
- Status shown as a colored step bar with plain-language labels ("Being checked", "Work started", "Solved?").
- Every screen has defined **loading, empty, error, offline and no-permission** states, built from shared components (`<Screen>`, `<EmptyState>`, `<ErrorState>`, `<OfflineBanner>`).
- Works on low-end Android, slow 3G/4G: compressed images, paginated lists, skeletons instead of spinners.
- Accessibility: font scaling respected, contrast AA, screen-reader labels.
- Never show phone numbers of other citizens. Reporter shown to citizens as "A resident"; citizen can mark an issue private.

## 2. Mobile app (Expo Router)

### 2.1 Navigation map

```
(auth) stack
  Splash ─► Login (phone) ─► OTP ─► [first time] Profile setup (name, village, language)
(tabs)
  Home │ My Issues │ [Report +] │ Notifications │ Profile
  [Work]  ← shown only if user holds WORKER role
Modal / stack routes
  report/category ─► report/photos ─► report/location ─► report/similar ─► report/details ─► report/review ─► submitted
  issue/[id]            (details, with Timeline tab)
  issue/[id]/timeline
  issue/[id]/confirm    (deep link from notification)
  announcements, announcements/[id]
  settings
  (worker steps are on issue/[id]: a "Your work" card, see §2.3)
```

Suggested order change for the report flow: **Category → Photos → Location → Similar issues → Details → Review**. Photos first is the most natural action ("take a picture of the problem"), and category + location must be known before we can check for similar issues. Your list had Category → Location → Photos; either works, so tell me if you prefer yours.

### 2.2 Screens

| # | Screen | Content | Key states / rules |
|---|---|---|---|
| 1 | Splash | logo, session restore | expired session → Login |
| 2 | Login | phone number (+91 fixed), language switch | invalid number, rate-limited |
| 3 | OTP | 6-digit input, auto-read on Android (if supported by the SMS provider), resend timer | wrong code, expired, too many tries |
| – | Profile setup | name, village (pre-selected if one), language | only on first login |
| 4 | Home | big **Report a Problem** button; village stats strip (open / solved this month); pinned announcement; nearby/recent public issues | empty village state |
| 5 | Report Issue | entry + progress dots for steps; draft auto-saved locally | resume draft prompt |
| 6 | Select Category | grid of 9 large icon tiles | – |
| 7 | Select Location | "Use my current location" (GPS) + landmark text; "Open in Maps" preview link | GPS denied → landmark required; low accuracy warning; outside village bounds warning |
| 8 | Add Photos | camera / gallery, up to 4 photos, per-photo upload status | permission denied, upload failed + retry |
| – | Similar Issues | "Is it one of these?" cards with photo, distance, "27 affected", **I'm affected too** / **My problem is different** | none found → skip automatically |
| – | Details & Review | title (suggested from category + landmark), optional description, summary, Submit | validation errors inline |
| 9 | My Issues | list of own + supported issues, filter chips (Open / Solved / All), status bar per card | empty: "You haven't reported any problems" |
| 10 | Issue Details | photos, status bar, number, category, location, affected count, public comments, actions (Support, Comment, Confirm if RESOLVED) | not found / no access; offline cached view |
| 11 | Issue Timeline | vertical timeline: time, who (role + name for staff, "You" / "Resident"), what, photos inline | – |
| 12 | Resolution Confirmation | completion photos, worker note, **YES, SOLVED** / **NO, STILL NOT SOLVED**; NO → reason (+ optional photo) | already answered → show result |
| 13 | Notifications | list, unread dot, tap → deep link, mark all read | empty |
| 14 | Announcements | list + detail, pinned first | empty |
| 15 | Profile | name, village, my stats, roles held, logout | – |
| 16 | Settings | language, notification toggle, privacy info, delete account (anonymizes, keeps history), app version | – |

### 2.3 Worker screens (if workers use the mobile app)

| Screen | Content |
|---|---|
| Work list | issues assigned to me / my department, grouped: Reopened, New, In progress, Waiting for the resident |
| Work detail (the issue screen with a "Your work" card) | issue info, location with "Open in Maps", internal notes, **Accept / Decline**, **Start work**, **Add progress** (note + photos), **Mark completed** (completion photo required + note) |

## 3. Admin web app (Next.js)

### 3.1 Layout

Left sidebar (items shown according to `get_my_permissions`), top bar with village switcher (for users with roles in several villages), user menu. Responsive down to tablet. Tables with server-side filtering, sorting and pagination.

### 3.2 Screens

| # | Screen | Content | Permission |
|---|---|---|---|
| 1 | Login | phone OTP + authenticator code (MFA) for staff | – |
| 2 | Dashboard | KPI tiles: Total, Open, Under Review, In Progress, Resolved, Closed, Critical; Recent issues; Pending (awaiting review / awaiting citizen confirmation / overdue); Issues by category; by department; Resolution rate; Avg resolution time; date range filter | `analytics.view` |
| 3 | All Issues | table: number, title, category, status, priority, department, assignee, affected, age; filters (status, category, priority, department, date, has-supporters); saved views "Needs review", "Critical", "Reopened"; live updates | `issue.view_all` |
| 4 | Issue Details | left: photos, map, description, reporter (name; phone behind "Reveal" button, audited), supporters; right: action panel showing only valid next actions (Start review, Verify, Reject, Mark duplicate, Assign, Close, Reopen), priority/visibility controls, public comments + internal notes tabs | per action |
| 5 | Issue Timeline | full timeline including internal events (priority changes, internal notes, reassignments), filter public/internal, export (later) | `issue.view_all` |
| 6 | Assignment | dialog/page: choose department → optional worker (with current workload count), note, due date | `issue.assign` |
| 7 | Departments | list, create/edit/deactivate, staff count, open-issue count | `department.manage` |
| 8 | Workers | list by department, invite by phone, deactivate, workload and resolution stats | `role.assign_worker` |
| 9 | Users | search citizens/staff, roles, status, suspend/reactivate, role grant/revoke with reason | `user.manage`, `role.assign_*` |
| 10 | Categories | list, add/edit, local names, icon, default priority, activate/deactivate | `category.manage` |
| 11 | Announcements | list, draft editor (both languages), publish, pin, expire, archive | `announcement.manage` |
| 12 | Analytics | trends over time, category/department breakdowns, resolution time distribution, reopened rate, CSV export (later) | `analytics.view` |
| 13 | Audit Logs | filterable table (actor, action, entity, date), before/after diff viewer, read-only | `audit.view` |
| 14 | Settings | village settings (auto-close days, reopen window, default visibility, rate limits); Super Admin: villages, role permission editor | `settings.manage`, `permission.manage`, `village.manage` |

## 4. Shared components (built once per app, no duplicates)

Mobile: `Screen`, `AppButton`, `StatusBadge`, `StatusStepper`, `IssueCard`, `PhotoGrid`, `PhotoUploader`, `TimelineList`, `EmptyState`, `ErrorState`, `OfflineBanner`, `ConfirmDialog`.
Admin: `DataTable`, `FilterBar`, `StatusBadge`, `PriorityBadge`, `ActionPanel`, `TimelineList`, `PhotoGallery`, `KpiTile`, `ConfirmWithReasonDialog`, `PermissionGate` (UI-only hide/show; never a security boundary).

Status labels, colors and the step order come from `packages/core` so both apps stay consistent.
