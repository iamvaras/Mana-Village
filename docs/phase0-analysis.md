# Phase 0: Risks, Missing Requirements, Open Questions

## 1. Risks and architectural problems

| # | Risk | Impact | Mitigation in this design |
|---|---|---|---|
| R1 | **SMS OTP in India**: needs DLT-registered sender and templates, per-SMS cost, delivery delays in rural areas | Login fails, users give up | Choose provider early (Phase 2), register DLT templates before Phase 3; consider WhatsApp OTP as fallback |
| R2 | **RLS complexity**: many roles × visibility rules; mistakes leak data or block users | Security / usability | Central helper functions, pgTAP matrix tests for every role and table |
| R3 | **RLS performance** on lists and dashboards | Slow admin pages | `(select ...)` wrapping, indexes on policy columns, analytics via aggregated RPCs |
| R4 | **Workers may not have smartphones or literacy** | Proof-of-work photos never uploaded | Admin can upload completion photos on a worker's behalf (`attachment.upload_work`), recorded with the admin as actor |
| R5 | **Low connectivity** | Lost reports, duplicate submissions | Local drafts, idempotent `create_issue`, per-photo retries, compressed images |
| R6 | **Political sensitivity**: public, permanent records about elected officials' performance | Pressure to hide or edit issues | Append-only history, audited moderation (hide, never delete), clear moderation policy needed from you |
| R7 | **Abuse**: fake reports, offensive photos/comments | Workload, reputational harm | Rate limits, moderation, suspension, reporting open only to registered village residents |
| R8 | **"Never delete history" vs. privacy law** (DPDP Act 2023 right to erasure) | Legal exposure | Anonymize personal data, keep history rows (database.md §6); needs legal confirmation |
| R9 | **Citizen never confirms resolution** | Issues stuck in RESOLVED forever | Reminder + auto-close after N days, recorded as SYSTEM |
| R10 | **Electricity / water issues belong to outside agencies** (e.g. state DISCOM, RWS), not panchayat departments | "Assigned" means nothing if the department can't act | Allow departments that represent external agencies; possibly an "Escalated to external agency" state (open question) |
| R11 | **Push notifications unreliable** on some Android OEMs (battery optimizers) | Citizen misses confirmation request | In-app inbox is the source of truth; badge on Home; reminder notifications |
| R12 | **Supabase lock-in** | Harder migration later | Standard Postgres + SQL migrations; business logic in SQL functions is portable; services layer isolates supabase-js |
| R13 | **Free tier pausing / no PITR** | Data loss | Production on Supabase Pro with PITR |
| R14 | **Expo + pnpm monorepo** quirks (Metro resolution) | Setup time | Use Expo's documented monorepo setup; verify in Phase 2 before writing features |

## 2. Requirements I think are missing

1. **Language**: Telugu (and/or other local languages) for UI, categories, notifications and announcements.
2. **Citizen identity and village membership**: how do we know a user belongs to the village? Wards / hamlets within a village?
3. **Issue visibility**: are all issues public to all villagers? Can a citizen report privately?
4. **Reporter identity on public issues**: name vs anonymous.
5. **Who can confirm resolution**: only the reporter, or supporters too? What if the reporter deleted their account?
6. **Auto-close and reopen windows**: how long to wait for confirmation; can citizens reopen a CLOSED issue?
7. **Assignment model**: department only, person only, or department then person? Can workers self-claim?
8. **External agencies** (electricity board, water supply, mandal office) and escalation.
9. **Target dates / SLA**: expected completion date shown to citizens? Overdue tracking?
10. **Moderation policy**: who can hide content, and what citizens see.
11. **Issue edits**: can a citizen edit title/description after submitting? (Design: only while SUBMITTED, with history.)
12. **Admin login method**: phone OTP vs email+password; MFA.
13. **Account deletion and data retention**.
14. **Public statistics** for citizens (e.g. "120 solved this year").
15. **Exports / reports**: PDF/CSV for Gram Sabha meetings.
16. **Hosting** for the admin web app (Vercel, Netlify, other) and domain.
17. **App store accounts**: Google Play / Apple developer accounts and app name/branding.
18. **Multi-village scope for launch**: one pilot village or many.
19. **Voice input / voice notes** for low-literacy users.
20. **Notification preferences** and quiet hours.

## Decisions made (answers from Vara Prasad)

| Q | Decision | Date |
|---|---|---|
| 1 | Multiple villages at launch; the user selects their village at signup | 2026-11-19 |
| 1a | Citizen can change their home village later from Profile; change is audited; existing issues stay in their original village | 2026-11-19 |
| 2 | Telugu + English, user-selectable, Telugu first (adds i18next + react-i18next) | 2026-11-20 |
| 3 | Open signup: anyone with phone OTP picks their village; abuse handled by rate limits, moderation and suspension | 2026-11-20 |
| 4 (Q5) | Workers use the same mobile app with a Work tab shown only to users holding the WORKER role | 2026-11-20 |
| 5 (Q6) | Assignment: department required, person optional; if no person, any worker in that department can accept | 2026-11-20 |
| 6 (Q9, Q10) | Photo required to report (except "Other" category) and a completion photo required to mark RESOLVED | 2026-11-20 |
| 7 (Q11) | Only the reporter confirms resolution (YES / NO) | 2026-11-20 |
| 8 (Q12) | No answer: reminder on day 3, auto-close on day 7 as SYSTEM (configurable per village) | 2026-11-20 |
| 9 (Q18, Q19) | Issues public within the village by default; reporter shown to citizens as "A resident", staff see the name; citizen may mark an issue private | 2026-11-20 |
| 10 (Q21) | Account deletion anonymizes the person (name → "Deleted user", phone removed) and keeps all history | 2026-11-20 |
| 11 (Q25) | Location = phone GPS + landmark text; "Open in Maps" link for staff; no map library in V1 | 2026-11-20 |
| 12 (Q28) | Admin web login = phone OTP + TOTP authenticator code (MFA) for staff roles | 2026-11-20 |
| 13 (Q29) | SMS provider decided later; develop with Supabase test phone numbers; Claude brings a cost/DLT comparison before launch | 2026-11-20 |
| 14 (Q26) | Add @tanstack/react-query and zod | 2026-11-20 |
| Q4 | No wards/hamlets in V1; GPS + landmark only | 2026-11-20 (default) |
| Q7 | Admin may upload completion photos on a worker's behalf, recorded with the admin as actor | 2026-11-20 (default) |
| Q8 | External agencies (electricity board, water supply) modeled as departments; no escalation status in V1 | 2026-11-20 (default) |
| Q13 | Citizens cannot reopen CLOSED issues; only admins, with reason | 2026-11-20 (default) |
| Q14 | Admin can reconsider REJECTED/DUPLICATE (back to UNDER_REVIEW) with reason | 2026-11-20 (default) |
| Q15 | "Start review" is a manual action | 2026-11-20 (default) |
| Q16 | Staff cannot verify or resolve an issue they reported themselves | 2026-11-20 (default) |
| Q17 | Optional due date on assignment, visible to staff only | 2026-11-20 (default) |
| Q20 | Workers do not see reporter phone by default; audited "Reveal" only if granted | 2026-11-20 (default) |
| Q22 | Permission sets are global per role in V1 | 2026-11-20 (default) |
| Q23 | Super Admin is read-only on the issue workflow, plus audit logs | 2026-11-20 (default) |
| Q24 | President can view audit logs for their village | 2026-11-20 (default) |
| Q27 | Admin UI: own small component set + Tailwind | 2026-11-20 (default) |
| Q30 | Admin web on Vercel; Supabase region Mumbai | 2026-11-20 (default) |
| Q31 | Android first; iOS after pilot | 2026-11-20 (default) |
| Q32 | Analytics definitions in api.md §2 approved | 2026-11-20 (default) |
| – | Also defaulted: citizens comment on own/supported issues; reporter may edit title/description while SUBMITTED; supporters may withdraw; voice notes, exports and OTP auto-read deferred | 2026-11-20 (default) |

## 3. Open questions (all answered 2026-11-20; kept for reference)

Each has my recommended default in **bold**. If you're happy with a default, just say "default for N".

**Scope and users**
1. Is V1 for **one pilot village** or several at launch? (Design is multi-village either way.) **Default: one pilot village, multi-village ready.**
2. Which languages? **Default: Telugu + English, user-selectable, Telugu first.**
3. How is a citizen tied to a village? (a) **anyone with a phone picks their village (default)**, (b) admin approves new users, (c) pre-loaded voter/household list.
4. Do villages need wards/hamlets for location and analytics? **Default: no in V1, location text + GPS only.**

**Workers and assignment**
5. Do workers use **the same mobile app with a "Work" tab (default)**, the admin web, or both?
6. Assignment: **department required, person optional (default)**, and can any worker in that department accept? **Default: yes.**
7. Can an admin upload completion photos on behalf of a worker without a phone? **Default: yes, recorded with the admin as actor.**
8. How should issues for external agencies (electricity board, water supply) be handled? **Default: model them as departments in V1, no separate escalation status.**

**Workflow**
9. Is at least one photo **required** when reporting? **Default: required, except "Other" category.**
10. Is a completion photo required to mark RESOLVED? **Default: yes.**
11. Who can confirm resolution? **Default: reporter only.** Should supporters also be asked?
12. Auto-close after how many days with no citizen response? **Default: reminder at day 3, auto-close at day 7.**
13. Can a citizen reopen a CLOSED issue, and within how long? **Default: no; only admins reopen CLOSED issues.**
14. Can REJECTED/DUPLICATE issues be reconsidered by an admin (back to UNDER_REVIEW)? **Default: yes, with reason.**
15. Is "Start review" a manual click, or automatic when an admin opens the issue? **Default: manual click, so the history shows who reviewed.**
16. Should a staff member be blocked from verifying/resolving an issue they reported themselves? **Default: yes.**
17. Do you want target/due dates (SLA) in V1? **Default: optional due date on assignment, shown only to staff.**

**Privacy and visibility**
18. Are all issues public within the village by default? **Default: yes, with an option for the citizen to mark "private".**
19. On public issues, show the reporter's name or "A resident"? **Default: "A resident"; staff see the name.**
20. Can workers see the reporter's phone number to find the location? **Default: no; they see it only via an audited "Reveal" if granted `user.view_contact`.**
21. Account deletion: OK to **anonymize the person and keep the history (default)**?

**Permissions**
22. Do different villages need different permission sets for the same role (e.g. VP in village A can assign, in village B cannot)? **Default: no, global per role in V1.**
23. Should Super Admin be able to run the issue workflow (verify/assign/close)? **Default: no, read-only plus audit logs.**
24. Can the President view audit logs? **Default: yes, for their village.**

**Technology and operations**
25. Map in the location step: (a) `react-native-maps` with Google Maps key (costs, setup), or (b) **GPS + landmark text + "Open in Maps" link, no map library (default)**?
26. OK to add `@tanstack/react-query` (caching/retries) and `zod` (validation)? **Default: yes.**
27. Admin UI primitives: **own small component set + Tailwind (default)** or shadcn/ui?
28. Admin login: **phone OTP + TOTP MFA (default)**, or email+password?
29. SMS provider for OTP (Twilio, MSG91, Vonage…), and do you already have a DLT registration?
30. Hosting for admin web: **Vercel (default)** or other? Supabase region **Mumbai (default)**?
31. Do you have Google Play and Apple developer accounts? Android-only for the pilot? **Default: Android first, iOS after pilot.**
32. Analytics definitions in [api.md](api.md) §2 (Open, Resolution rate, Avg resolution time): OK?
