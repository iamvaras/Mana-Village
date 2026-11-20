# Testing Plan

## 1. Layers

| Layer | Tool | What | Runs |
|---|---|---|---|
| Database: RLS | pgTAP via `supabase test db` | For every table × every role (citizen, other-village citizen, worker assigned / not assigned, VP with/without permission, secretary, super admin, suspended user, anonymous): which rows are visible, which writes fail | every PR |
| Database: workflow | pgTAP | Table-driven: every (from status, to status, actor) combination. Allowed ones succeed and write exactly 1 history row + audit + notifications; forbidden ones raise `MV_INVALID_TRANSITION`/`MV_FORBIDDEN` and change nothing | every PR |
| Database: invariants | pgTAP | history/audit UPDATE/DELETE always fail; status cannot change without history; issue numbers unique under concurrent inserts; supporter_count matches rows; stale `expected_version` → `MV_CONFLICT` | every PR |
| Storage policies | pgTAP + integration script against local Supabase | upload/read allowed and denied cases, MIME/size limits | every PR |
| Core logic | Vitest | client status machine mirrors DB table (generated fixture shared with pgTAP), zod schemas, formatting (IST times, issue numbers) | every PR |
| Services | Vitest against local Supabase | error mapping, pagination, idempotent `create_issue` retry | every PR |
| Mobile components | Jest (`jest-expo`) + React Native Testing Library | loading/empty/error/offline states for each screen, report flow draft persistence | every PR |
| Admin components | Vitest + Testing Library | action panel shows correct actions per status/permission, forms validation | every PR |
| Admin E2E | Playwright | login → review → verify → assign → (worker resolves via API) → close; permission denied paths | main branch / nightly |
| Mobile E2E | Maestro (optional, later) | report issue with photo, confirm resolution YES/NO | before release |
| Edge Functions | Deno test | push batching, receipt handling, token revocation | every PR |
| Security review | manual checklist + Supabase advisors | Phase 12 and before each release | release |

## 2. Test data

`supabase/seed/` creates 2 villages, every role in each, departments, categories and issues in every status, so cross-village leaks are always tested. Seed never runs against production.

## 3. Acceptance criteria for V1 (summary)

- A citizen can report an issue with photos and GPS on a low-end Android over a slow connection, and retries survive network loss.
- The full sample timeline in [issue-workflow.md](issue-workflow.md) §4 can be produced end-to-end and reconstructed exactly from the database.
- No test role can read or write anything outside the matrix in [permissions.md](permissions.md).
- Every screen has verified loading, empty, error, offline and permission-denied states.
