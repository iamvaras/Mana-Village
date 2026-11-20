# Mana Village

Village civic issue tracking, resolution and transparency system. Citizens report local
problems; village officials review, verify, assign and resolve them with photo proof;
citizens confirm the result. Every step is permanently recorded with who did it and when.

Design docs: [`docs/`](docs/index.md). Current phase: **Phase 2 (project structure + database)**.

## Repository layout

```
apps/            mobile (Expo) and admin (Next.js), from Phase 3
packages/core    shared TypeScript: enums, workflow rules, permission keys, validation, DB types
supabase/        config, migrations, dev seed, database tests (pgTAP)
docs/            product, architecture, database, permissions, workflow, API, UI/UX, security, testing
```

## Requirements

- Node.js 22+, pnpm 10 (`corepack enable`)
- Docker (for the local Supabase stack)

## Getting started

```bash
pnpm install
pnpm db:start        # starts local Supabase, applies migrations + dev seed
pnpm db:test         # database tests: RLS, permissions, workflow, history immutability
pnpm test            # unit tests (packages)
pnpm typecheck && pnpm lint
```

After changing a migration: `pnpm db:reset && pnpm db:types` and commit the updated
`packages/core/src/types/database.ts`.

### Local test logins

Phone OTP with fixed codes (local only, no SMS sent). Code: `123456`.

| Phone           | Who                          |
| --------------- | ---------------------------- |
| +91 90000 00001 | Super Admin                  |
| +91 90000 00010 | President, Ramapuram (RMP)   |
| +91 90000 00011 | Vice-President, Ramapuram    |
| +91 90000 00012 | EO / Secretary, Ramapuram    |
| +91 90000 00013 | Worker, Ramapuram Electrical |
| +91 90000 00014 | Worker, Ramapuram Sanitation |
| +91 90000 00015 | Citizen, Ramapuram           |
| +91 90000 00016 | Citizen, Ramapuram           |
| +91 90000 00020 | Secretary, Kondapalli (KDP)  |
| +91 90000 00021 | Citizen, Kondapalli          |

## Database rules (summary)

- Migrations are forward-only. Never drop tables/columns holding data; never remove enum values.
- Issue status changes only through workflow functions; each writes a permanent history row.
- `issue_status_history` and `audit_logs` cannot be updated or deleted, even by the database owner.
- Clients cannot read issue tables directly; they use `issues_view`, `issue_timeline_view`,
  `issue_comments_view`, `issue_attachments_view`, which apply visibility rules and hide
  reporter identity from other citizens.
- New tables need RLS + explicit grants; new functions need `search_path = ''` and an explicit
  `GRANT EXECUTE` (see `20261120001300_function_grants_and_jobs.sql`).

## Versions

Pinned at the start of Phase 2: Node 22, pnpm 10.28, TypeScript 5.9, Supabase CLI 3.2.0,
Postgres 17 (local), zod 4, vitest 3. Expo SDK and Next.js versions are pinned in Phase 3.
