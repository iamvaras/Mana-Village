# Product Requirements (V1)

## 1. Vision

Mana Village is an issue tracking, resolution and transparency system for villages. Residents report local problems; village officials verify, assign and resolve them with proof of work; residents confirm the result. Every step is permanently recorded with who did it and when.

## 2. Goals

1. Reporting a problem takes under 1 minute for a first-time smartphone user.
2. Every issue has a complete, permanent, reconstructable timeline.
3. Officials can see, prioritize and assign all village issues in one place.
4. Work is proven with photos and confirmed by the citizen.
5. Village-level statistics make performance visible.
6. Every important administrative action is auditable.

## 3. Users

Citizen, President, Vice-President, EO / Panchayat Secretary, Worker / Department Staff, Super Admin. Capabilities in [permissions.md](permissions.md).

## 4. Functional requirements

| ID | Requirement |
|---|---|
| FR-1 | Phone OTP registration/login; first-time profile (name, village, language) |
| FR-2 | Report issue: category, photos, GPS + landmark, title, description |
| FR-3 | Show similar open nearby issues before creating; "I'm affected too" support |
| FR-4 | Human-readable number `{VILLAGE_CODE}-{YYYY}-{5-digit seq}` per village per year |
| FR-5 | View own, supported and public issues; issue details; timeline |
| FR-6 | Public comments; internal staff notes never visible to citizens |
| FR-7 | Staff workflow: review, verify, reject, mark duplicate, assign/reassign, priority, visibility |
| FR-8 | Worker workflow: accept/decline, start, progress updates with photos, resolve with completion photo |
| FR-9 | Citizen confirmation: YES SOLVED → CLOSED; NO → reason → REOPENED |
| FR-10 | Auto-reminder and auto-close for unconfirmed resolutions (configurable) |
| FR-11 | Every status transition writes an immutable history record (actor, role, time, reason) |
| FR-12 | In-app notifications + push for status changes, assignments, confirmation requests, announcements |
| FR-13 | Announcements per village |
| FR-14 | Dashboard and analytics per village |
| FR-15 | Management of departments, workers, users/roles, categories, settings, permissions |
| FR-16 | Audit log of important administrative actions, viewable by authorized roles |

## 5. Non-functional requirements

| Area | Requirement |
|---|---|
| Security | Authorization enforced in database (RLS + RPC); see [security.md](security.md) |
| Privacy | No Aadhaar; phone numbers never public; EXIF stripped |
| Durability | History and audit append-only; daily backups + PITR |
| Performance | Lists < 1.5 s on 4G; images ≤ ~300 KB after compression |
| Reliability | Drafts survive app restarts; idempotent submit; retries on network loss |
| Accessibility | Large touch targets, font scaling, screen reader labels, local language |
| Devices | Android 8+ low-end devices first; iOS supported |
| Code quality | TypeScript strict, no `any`, layered architecture, tests per [testing.md](testing.md) |

## 6. Out of scope for V1

See [development-plan.md](development-plan.md).
