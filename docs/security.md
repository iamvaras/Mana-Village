# Security Architecture

## 1. Principles

1. The database is the security boundary. Clients are untrusted, including our own admin web app.
2. Least privilege: users get the narrowest role; the service role key is used in only two Edge Functions.
3. History and audit are append-only and cannot be changed through any API.
4. Personal data is minimized: no Aadhaar, no phone numbers in public tables, EXIF stripped from photos.

## 2. Threat model (main cases)

| Threat | Mitigation |
|---|---|
| Citizen edits/reads another citizen's private data | RLS: `users` row writable only by `id = auth.uid()`; PRIVATE issues readable only by creator + staff; phone never in public tables |
| Citizen forges a status change via API | No UPDATE grant on `issues.status`; status-guard trigger; transitions only via RPCs that check permission + context |
| Worker calls admin RPCs | Each RPC checks `has_permission`; worker role lacks those keys; context check "is assignee" for `issue.work` |
| Admin in village A acts in village B | All permission checks scoped by the issue's `village_id` |
| Revoked/suspended staff keeps acting with an old JWT | Permissions looked up live from `user_roles` + `users.status` on every call, not from JWT claims |
| Citizen reads internal notes / internal photos | RLS on `issue_comments` / `issue_attachments` filters `visibility = INTERNAL` unless `issue.view_internal`; Storage policy uses the same rule |
| Guessing photo URLs | Private bucket; signed URLs only, short TTL; random uuid paths |
| Malicious uploads (huge files, non-images, scripts) | Bucket `file_size_limit` 5 MB and `allowed_mime_types` (jpeg/png/webp); `register_attachment` re-checks; client re-encodes images |
| Location leakage via EXIF | Client re-encode strips EXIF; issue location comes only from the explicit field |
| Spam / abuse reports | Per-user daily issue limit (village setting), OTP rate limits (Supabase Auth), content moderation (hide), user suspension |
| SQL injection | No dynamic SQL in functions; parameterized PostgREST; if `format()` is ever needed, use `%I`/`%L` |
| `SECURITY DEFINER` hijack | `SET search_path = ''`, fully qualified names, functions owned by a non-login role, `REVOKE EXECUTE FROM public` then grant to `authenticated` only where intended |
| Tampering with history/audit | No UPDATE/DELETE grants; triggers raise on UPDATE/DELETE; only DB owner (not exposed) could bypass; PITR backups |
| Leaked service role key | Never in client bundles or `NEXT_PUBLIC_*`; only in Edge Function secrets; CI secret scanning; key rotation runbook |
| Admin account takeover | MFA (TOTP) for staff roles in admin web (recommended), short sessions, audit of logins and role grants |
| XSS in admin (user text rendered) | React escaping, no `dangerouslySetInnerHTML`, strict CSP, plain-text comments only |
| CSRF on Server Actions | Next.js Server Actions origin checks; SameSite cookies |
| Enumerating issues/users | `NOT_FOUND` for both missing and forbidden; uuids not sequential; issue_number is public but lookup goes through RLS |

## 3. RLS policy outline

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| villages | authenticated (active only) | RPC only | RPC only | never |
| users | own row: all granted columns; others: `id, display_name, avatar_path` (column grant) if same village or staff | trigger on auth signup | own row: `full_name, display_name, preferred_language, avatar_path` | never (anonymize via RPC) |
| roles, permissions, role_permissions | authenticated | RPC only | RPC only | RPC only (role_permissions) |
| user_roles | own rows; staff with `user.manage`/`role.*` in village | RPC only | RPC only (revoke) | never |
| departments | same-village users | RPC | RPC | never |
| issue_categories | authenticated | RPC | RPC | never |
| issues | PUBLIC in own village (`issue.view_public`); own; `issue.view_all` in village; assigned worker | RPC only | owner may edit title/description while SUBMITTED (edit recorded in audit); everything else RPC | never |
| issue_assignments | staff in village; the assignee; reporter sees department + public fields via timeline view | RPC | RPC | never |
| issue_status_history | anyone who `can_view_issue` | RPC only | never | never |
| issue_comments | `can_view_issue` AND (PUBLIC OR `issue.view_internal` OR assigned worker) AND not hidden (staff see hidden) | RPC | RPC (hide) | never |
| issue_attachments | same as comments | RPC | RPC (hide) | never |
| issue_supporters | count via issues; own rows | RPC | – | own row via RPC |
| notifications | `recipient_id = auth.uid()` | trigger/RPC only | own row: `read_at` only | never (no retention job in V1) |
| push_tokens | own | own | own | own (revoke) |
| announcements | PUBLISHED + not expired in own village; staff see drafts | RPC | RPC | never (archive) |
| audit_logs | `audit.view` in village; SUPER_ADMIN all | trigger/RPC only | never | never |

Performance: policies call helpers as `(select auth.uid())` and `(select public.has_permission(...))` so Postgres evaluates them once per statement; indexes on every column used in policies.

## 4. Storage

- Bucket `issue-attachments`: **private**, 5 MB limit, image MIME allow-list.
- Path convention `{village_id}/{issue_id}/{attachment_id}.{ext}`; policies parse `storage.foldername(name)`.
- INSERT policy: user may attach to that issue at its current status (creator for evidence; assignee/admin for work photos).
- SELECT policy: `can_view_issue(issue_id)` and the attachment row's visibility rule.
- No UPDATE (overwrite) and no client DELETE.
- Bucket `avatars` (optional): private, 1 MB, own folder only.

## 5. Authentication

- Citizens: phone OTP through Supabase Auth with an SMS provider (chosen before launch; India requires DLT-registered templates). Development uses Supabase test phone numbers.
- Staff: same phone login, plus TOTP MFA required for admin web for President/VP/Secretary/Super Admin (decided).
- Mobile session in `expo-secure-store`; admin session in httpOnly cookies via `@supabase/ssr`; middleware refreshes sessions.
- OTP and login rate limits configured in Supabase Auth; captcha (hCaptcha/Turnstile) on admin login if abuse appears.

## 6. Input validation

Three layers: zod in the client (fast feedback), argument checks in RPCs, and table `CHECK` constraints / FKs / enums (final word). Text is stored as plain text; length limits on every text column; coordinates range-checked and optionally checked against village center radius.

## 7. Audit logging

Logged: every workflow action, priority/visibility changes, role grant/revoke, user suspend/reactivate, contact reveal, moderation (hide), department/category/announcement/settings/permission changes, account anonymization. Each entry: actor, role at the time, village, action, entity, before/after, timestamp.

## 8. Privacy

- No Aadhaar or government ID in V1.
- Phone numbers: only in `auth.users`; staff reveal is audited.
- Reporter identity on public issues: shown to citizens as "A resident"; staff see the name.
- Photo guidance in the app: "Don't include people's faces or vehicle number plates."
- Data residency: Supabase region Mumbai recommended. Privacy notice and consent at signup (DPDP Act 2023).

## 9. Operational security

- Separate Supabase projects for staging and production; production keys only in CI and hosting secrets.
- Dependency audit in CI; Dependabot/Renovate.
- Supabase security advisor checks run before each release.
- Backups + PITR, quarterly restore drill.
- Incident runbook: rotate keys, revoke sessions, review audit logs.
