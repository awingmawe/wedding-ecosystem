---
inclusion: always
---

# Product Context

Wedding Digital SaaS — a multi-tenant platform for digital wedding invitation management, targeting the Indonesian market.

## Language & Locale

- User-facing content/labels/copy: **Bahasa Indonesia**
- Code (variables, comments, docs): **English**
- Date format: `DD MMMM YYYY` (e.g., "12 Januari 2026")
- Currency: IDR (Rp), no decimal places
- Time zone: WIB (Asia/Jakarta, UTC+7) unless event specifies otherwise

## Applications

| App | Type | Primary Users | Key Constraint |
|-----|------|---------------|----------------|
| Dashboard (`apps/dashboard`) | Responsive web | Client, WO, Admin | Desktop-first, must work on tablet |
| Invitation (`apps/invitation`) | Mobile-first web | Guests | Must load < 3s on 3G; no auth required |
| Scanner (`apps/scanner`) | PWA | Scanner Operator | Must work offline; QR verify < 2s |

## User Roles

| Role | Scope | Can Do | Cannot Do |
|------|-------|--------|-----------|
| Admin | All tenants | Full CRUD, tenant management, system config | — |
| Client | Own tenant only | Manage own events, guests, CMS, themes | Access other tenants, system config |
| WO (Wedding Organizer) | Assigned events | Manage assigned events, guests, check-in | Create/delete events, billing |
| Scanner Operator | Assigned event | QR scan, manual check-in, Go-Show registration | Guest management, CMS, settings |

## Core Domain Rules

1. **Tenant isolation** — Every query scoped by `tenant_id`. Never expose data across tenants.
2. **Personalized URLs** — Format: `/{event-slug}?to={guest-slug}`. The `guest-slug` determines which name appears on the cover.
3. **QR uniqueness** — One QR code per guest per event. Payload encrypted with `guest_id` + `event_id`.
4. **Duplicate detection** — Prevent duplicate check-ins. Second scan shows warning with first check-in timestamp.
5. **Go-Show flow** — Unregistered guests added on-site by Scanner Operators. Temporary record, no QR code.
6. **CMS sections** — 14 configurable sections per invitation (cover, bride-groom, story, countdown, event-details, gallery, video, RSVP, wishes, gift, music, closing, navigation, footer). Each toggleable and reorderable.
7. **RSVP states** — `pending` | `confirmed` | `declined` | `checked_in`.
8. **Real-time broadcast** — Check-in and RSVP updates broadcast via WebSocket, scoped to event room.
9. **Offline queue** — Scanner stores actions locally when offline, syncs on reconnect. Conflict resolution: server timestamp wins.
10. **Event capacity** — Up to 2,000 guests per event without degradation.

## Business Logic Priorities

1. Data integrity (tenant isolation, no duplicate check-ins)
2. Offline reliability (Scanner must never lose a scan)
3. Performance (meet latency targets in tech.md)
4. User experience (smooth animations, clear feedback)
