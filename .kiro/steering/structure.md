---
inclusion: always
---

# Project Structure

Monorepo with three frontend apps sharing a single backend API. Currently in early implementation phase — shared types and utilities are defined.

## Layout

```
/
├── apps/
│   ├── dashboard/        # Client & WO Dashboard (Next.js 16, responsive)
│   ├── invitation/       # Guest-facing invitation app (Next.js 16, mobile-first)
│   └── scanner/          # Scanner PWA (Next.js 16)
├── packages/
│   ├── api/              # Backend API server (Fastify 5)
│   ├── db/              # Database schema, migrations, ORM config (Prisma 7)
│   ├── shared/           # Shared types, utilities, constants (Zod 3.25)
│   └── realtime/         # WebSocket/Socket.io 4.8 server
├── .kiro/
│   ├── specs/            # Feature specifications
│   ├── steering/         # AI steering rules (this folder)
│   └── settings/         # Kiro IDE settings
└── .vscode/              # VS Code workspace settings
```

## Current State

Early implementation. `.kiro/specs/wedding-digital-saas/` contains:
- `requirements.md` — Functional and non-functional requirements
- `design.md` — Technical architecture, data models, sequence diagrams
- `tasks.md` — Implementation task list

`packages/shared/src/types/` is implemented with:
- Enums, interfaces, Zod validation schemas, error codes, and API response types

## Key Architectural Patterns

- **Multi-tenant**: Every DB table includes `tenant_id`; row-level isolation at query layer.
- **Service-based backend**: Modular services (Auth, Guest, QR, CMS, Check-in, Real-time, Notification) on Fastify 5.
- **Room-based WebSocket**: Broadcasts scoped per-event room for data isolation (Socket.io 4.8).
- **PWA offline-first**: Scanner uses service worker + local queue for offline operation.
- **CMS-driven rendering**: Invitation sections dynamically rendered based on active config and sort order.
- **TailwindCSS 4**: Uses the new CSS-first configuration (no tailwind.config.ts needed for basic setup).

## Conventions

- Code language: English (variable names, comments)
- UI/content language: Indonesian (Bahasa Indonesia)
- Feature specs: `.kiro/specs/{feature-name}/`
- Spec config: `.config.kiro` JSON files
- Invitation URLs: `/{event-slug}?to={guest-slug}`
- All dependency versions are pinned (no ^ or ~ ranges in app packages)
- Node.js minimum: 20.0.0
