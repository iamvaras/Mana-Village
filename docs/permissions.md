# Roles and Permissions

## 1. Model

Authorization = **permission** (from `role_permissions`, configurable) **AND** **context rule** (fixed in the database, not configurable).

- Permission: "does this role allow verifying issues in this village?" → `has_permission(village_id, 'issue.verify')`
- Context rule: "is this the citizen who reported it?", "is this worker assigned to it?", "is the issue in a status where this action is allowed?" → enforced inside RLS policies and workflow functions.

All roles except SUPER_ADMIN are **village-scoped**: a Secretary in village A has no rights in village B. A user can hold several roles (e.g. a worker who is also a citizen).

The frontend calls `get_my_permissions()` only to show or hide buttons. Every action is checked again in the database.

## 2. Permission catalog

| Key | Meaning | Context rule |
|---|---|---|
| `issue.create` | Report a new issue | in own home village; rate-limited |
| `issue.view_public` | See PUBLIC issues in the village | – |
| `issue.view_own` | See own issues incl. PRIVATE | creator only |
| `issue.view_all` | See all issues in the village incl. PRIVATE | – |
| `issue.view_internal` | See INTERNAL comments/attachments | – |
| `issue.support` | "I'm affected too" | not own issue; open statuses only |
| `issue.comment_public` | Public comment | on issues they can view; citizens: own or supported issues |
| `issue.comment_internal` | Internal staff note | – |
| `issue.review` | SUBMITTED → UNDER_REVIEW | – |
| `issue.verify` | UNDER_REVIEW → VERIFIED | – |
| `issue.reject` | → REJECTED | reason required |
| `issue.mark_duplicate` | → DUPLICATE | target issue in same village, not itself a duplicate |
| `issue.set_priority` | Change priority | audited |
| `issue.set_visibility` | Make PUBLIC/PRIVATE | audited |
| `issue.assign` | Assign/reassign department/person | assignee must hold WORKER in that department |
| `issue.work` | Accept/decline assignment, start work, add progress, resolve | **only on issues assigned to them** |
| `issue.resolve_any` | Mark RESOLVED without being the assignee | admin override, audited |
| `issue.confirm_resolution` | YES SOLVED / NO STILL NOT SOLVED | **creator only** (decided) |
| `issue.close` | RESOLVED → CLOSED without citizen | admin override, reason required |
| `issue.reopen` | CLOSED/RESOLVED → REOPENED by staff | reason required |
| `attachment.upload_evidence` | Initial photos | creator, while SUBMITTED/UNDER_REVIEW |
| `attachment.upload_work` | Progress/completion photos | assignee, or admin |
| `content.moderate` | Hide comments/attachments | audited |
| `user.view_contact` | Reveal citizen phone | audited every time |
| `user.manage` | Suspend/reactivate users in the village | audited |
| `role.assign_worker` | Grant/revoke WORKER role | in own village |
| `role.assign_admin` | Grant/revoke PRESIDENT/VP/SECRETARY | – |
| `department.manage` | CRUD departments | own village |
| `announcement.manage` | Create/publish/archive | own village |
| `analytics.view` | Dashboard and reports | own village |
| `audit.view` | Read audit logs | own village (SUPER_ADMIN: all) |
| `village.manage` | Create/edit villages | GLOBAL |
| `category.manage` | Manage issue categories | GLOBAL |
| `permission.manage` | Edit role_permissions | GLOBAL |
| `settings.manage` | Village settings (auto-close days, etc.) | own village / GLOBAL |

## 3. Default matrix (seed values, editable by Super Admin)

✅ = granted by default · ⚙️ = granted by default but you flagged it as configurable · ❌ = not granted · ⛔ = not grantable (would break separation of duties)

| Permission | Citizen | President | Vice-Pres. | EO / Secretary | Worker | Super Admin |
|---|---|---|---|---|---|---|
| issue.create | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| issue.view_public | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| issue.view_own | ✅ | ✅ | ✅ | ✅ | ✅ | – |
| issue.view_all | ❌ | ✅ | ⚙️ | ✅ | ❌ (assigned only) | ✅ (read-only) |
| issue.view_internal | ⛔ | ✅ | ⚙️ | ✅ | ✅ on assigned | ✅ |
| issue.support | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| issue.comment_public | ✅ | ✅ | ⚙️ | ✅ | ✅ | ❌ |
| issue.comment_internal | ⛔ | ✅ | ⚙️ | ✅ | ✅ on assigned | ❌ |
| issue.review | ❌ | ✅ | ⚙️ | ✅ | ❌ | ❌ |
| issue.verify | ❌ | ✅ | ⚙️ | ✅ | ❌ | ❌ |
| issue.reject | ❌ | ✅ | ⚙️ | ✅ | ❌ | ❌ |
| issue.mark_duplicate | ❌ | ✅ | ⚙️ | ✅ | ❌ | ❌ |
| issue.set_priority | ❌ | ✅ | ⚙️ | ✅ | ❌ | ❌ |
| issue.set_visibility | ❌ | ✅ | ⚙️ | ✅ | ❌ | ❌ |
| issue.assign | ❌ | ✅ | ⚙️ | ✅ | ❌ | ❌ |
| issue.work | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| issue.resolve_any | ❌ | ✅ | ⚙️ | ✅ | ❌ | ❌ |
| issue.confirm_resolution | ✅ (own) | ✅ (own) | ✅ (own) | ✅ (own) | ✅ (own) | ❌ |
| issue.close | ❌ | ✅ | ⚙️ | ✅ | ❌ | ❌ |
| issue.reopen | ❌ (uses confirm) | ✅ | ⚙️ | ✅ | ❌ | ❌ |
| attachment.upload_evidence | ✅ (own) | ✅ | ✅ | ✅ | ✅ | ❌ |
| attachment.upload_work | ❌ | ✅ | ⚙️ | ✅ | ✅ on assigned | ❌ |
| content.moderate | ❌ | ✅ | ⚙️ | ✅ | ❌ | ✅ |
| user.view_contact | ❌ | ✅ | ⚙️ | ✅ | ❌ (decided; Secretary can grant if needed) | ✅ |
| user.manage | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| role.assign_worker | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| role.assign_admin | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| department.manage | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| announcement.manage | ❌ | ✅ | ⚙️ | ✅ | ❌ | ❌ |
| analytics.view | ❌ (public stats only) | ✅ | ✅ | ✅ | ❌ | ✅ |
| audit.view | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ |
| village.manage | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| category.manage | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| permission.manage | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| settings.manage | ❌ | ❌ | ❌ | ✅ (village) | ❌ | ✅ |

### Design choices worth your review

1. **Super Admin does not run the issue workflow by default** (cannot verify, assign or resolve). It is a platform operator role. This keeps village accountability with village officials. Super Admin can read everything and see audit logs.
2. **Citizen-only permissions (`view_internal`, `comment_internal`) are ⛔ for the Citizen role**: the permission editor will refuse to grant them, so a misconfiguration cannot leak private admin notes.
3. **Only Super Admin can grant President/VP/Secretary.** Secretary can manage workers and departments.
4. **Admins and workers cannot verify or resolve an issue they reported themselves** (conflict-of-interest rule). Approved.
5. **A worker sees only issues assigned to them** (or to their department when no person is assigned), never the whole village list beyond public issues.

## 4. Where each rule is enforced

| Layer | What it enforces |
|---|---|
| RLS SELECT policies | Who can read which rows (issues, comments, attachments, history, notifications, audit) |
| RLS INSERT/UPDATE policies | Simple owner rules: own profile, own notifications `read_at`, own push tokens, supporters |
| Column-level GRANTs | Clients cannot write status, timestamps, assignment fields, counters, `issue_number` |
| Workflow RPCs | Permission + context + status-transition rules + required fields |
| Storage policies | Upload/read of photos, using `can_view_issue()` and attachment permissions |
| Triggers | Append-only history/audit; status-change guard; supporter count |
| Frontend | Nothing security-relevant; only hides buttons it knows will fail |
