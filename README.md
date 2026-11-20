# Mana Village

Village civic issue tracking, resolution and transparency system. Citizens report local
problems; village officials review, verify, assign and resolve them with photo proof;
citizens confirm the result. Every step is permanently recorded with who did it and when.

Design docs: [`docs/`](docs/index.md). Current phase: **Phase 9 (resolution and confirmation)**.

## Repository layout

```
apps/mobile      citizen + worker app (Expo / React Native, expo-router)
apps/admin       Panchayat staff website (Next.js)
packages/core    shared TypeScript: enums, workflow rules, permission keys, validation, DB types
packages/services  data access used by both apps (Supabase calls, error mapping); UI never calls Supabase directly
supabase/        config, migrations, dev seed, database tests (pgTAP), Edge Functions
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

Run the apps against the local stack (copy each `.env.example` to `.env.local` and paste the
anon key from `pnpm exec supabase status`):

```bash
pnpm --filter @mana/admin dev      # http://localhost:3000
pnpm --filter @mana/mobile start   # Expo; on a phone use your computer's LAN IP in the URL
```

Admin sign-in is phone OTP, then a 6-digit code from an authenticator app (set up on first
sign-in). The database only honours admin permissions after that second step. Setting up the
authenticator calls the `prepare-mfa` Edge Function, so run `pnpm exec supabase functions serve`
too when testing it locally.

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

Node 22, pnpm 10.28, TypeScript 5.9, Supabase CLI 3.2.0, Postgres 17 (local), zod 4, vitest 3,
Next.js 16.4 + React 19.3 + Tailwind 4 (admin), Expo SDK 58 + React Native 0.88 + expo-router (mobile),
TanStack Query 5 (mobile).
