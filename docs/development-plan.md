# V1 Development Plan

Your 13 phases, with deliverables and exit criteria. Each phase ends with a short review from you before the next starts.

| Phase | Deliverables | Exit criteria |
|---|---|---|
| 0 Analysis | [phase0-analysis.md](phase0-analysis.md) | Open questions answered |
| 1 Design | All docs in `docs/` | You approve |
| 2 Structure + DB | Monorepo (pnpm), TS strict configs, lint/format, CI; **all** migrations: enums, tables, constraints, indexes, append-only triggers, status guard, RLS policies, helper functions, storage buckets + policies; reference data (roles, permissions, categories); dev seed; generated types; pgTAP RLS + invariant tests | `supabase db reset` + all DB tests green in CI |
| 3 Auth + authorization | Phone OTP login in mobile and admin, profile setup, session handling, `get_my_permissions`, admin route protection, MFA for staff (if approved), `invite-staff` function, role grant/revoke | Login works on device; role tests pass; suspended user blocked |
| 4 Citizen issue creation | Report flow, photo pipeline, GPS/landmark, draft persistence, `create_issue` (idempotent), `find_similar_issues`, `support_issue` | Issue with photos created on low-end Android with network interruptions |
| 5 Issue details + timeline | My Issues, Issue Details, Timeline (mobile + admin), `issue_timeline` view, comments, signed URLs; **in-app notification rows** created by triggers (push comes in Phase 10) | Timeline reconstructs sample sequence |
| 6 Admin dashboard | Admin shell, navigation by permissions, Dashboard KPIs, All Issues table with filters and realtime | Numbers match seeded data |
| 7 Verification + assignment | review/verify/reject/duplicate/assign/reassign RPCs + UI, priority/visibility, departments + workers screens | Workflow pgTAP matrix green for these transitions |
| 8 Worker workflow | Worker screens (Work tab in mobile app), accept/decline/start/progress/resolve, work photos | Worker sees only assigned issues |
| 9 Resolution + confirmation | Resolution Confirmation screen, `confirm_resolution`, close/reopen, auto-close + reminder cron | Full lifecycle incl. reopen tested end-to-end |
| 10 Notifications | Push token registration, `send-push`, `push-receipts`, deep links, notification settings | Push received on Android + iOS devices; invalid tokens revoked |
| 11 Analytics + announcements | Analytics RPCs + charts, announcements CRUD + mobile screens, audit log viewer, settings screens | Analytics definitions signed off |
| 12 QA + security review | Full test pass, security checklist, Supabase advisors, load test of RLS queries with realistic volume, accessibility pass, restore drill | No open high/critical findings |

## Notes on ordering

- **In-app notifications move earlier (Phase 5)** because Phase 7–9 transitions need to notify people; Phase 10 then only adds push delivery on top of existing rows.
- Audit logs are written from Phase 2 onward (triggers exist from the first migration); the **viewer** comes in Phase 11.
- Categories are seeded in Phase 2; the Categories management screen ships in Phase 11 with the other settings screens.

## Explicitly out of V1 (unless you ask)

AI duplicate detection, SLA escalation automation, SMS/WhatsApp notifications, offline-first sync (beyond drafts and retries), public web portal, multiple-language content translation by machine, Aadhaar/eKYC, payments, iOS-specific features beyond parity.
