# Wedding Ecosystem

Platform multi-tenant untuk manajemen undangan pernikahan digital, menargetkan pasar Indonesia. Terdiri dari 3 aplikasi frontend yang terintegrasi dengan satu backend API.

## Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend Apps                         │
├───────────────────┬───────────────────┬─────────────────────┤
│   Dashboard       │   Invitation      │   Scanner (PWA)     │
│   (Next.js 16)    │   (Next.js 16)    │   (Next.js 16)      │
│   Port: 3000      │   Port: 3001      │   Port: 3002        │
└────────┬──────────┴────────┬──────────┴──────────┬──────────┘
         │                   │                     │
         └───────────────────┼─────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────┐
│                    Backend API (Fastify 5)                    │
│                        Port: 4000                            │
├──────────────────────────────────────────────────────────────┤
│  Auth │ Guest │ RSVP │ Check-in │ CMS │ Notification │ WS   │
└────────┬──────────────────────┬──────────────────────────────┘
         │                      │
    ┌────┴────┐           ┌─────┴─────┐
    │PostgreSQL│           │   Redis    │
    │  :5432   │           │   :6379    │
    └──────────┘           └───────────┘
```

## Aplikasi

| App | Deskripsi | Users | URL |
|-----|-----------|-------|-----|
| **Dashboard** | Manajemen tamu, CMS undangan, tracking RSVP & check-in | Client, WO | `localhost:3000` |
| **Invitation** | Undangan digital mobile-first dengan personalisasi | Tamu | `localhost:3001/{event-slug}?to={guest-slug}` |
| **Scanner** | QR scanner PWA untuk check-in di venue | Operator | `localhost:3002` |

## Tech Stack

- **Frontend**: Next.js 16.2, React 19.2, TailwindCSS 4.3, shadcn/ui, Motion 12
- **Backend**: Fastify 5.8, Prisma 7.7, Socket.io 4.8, Redis (ioredis)
- **Database**: PostgreSQL 14+
- **Testing**: Vitest 3.2, fast-check 4.8 (property-based testing)
- **Language**: TypeScript 5.9

## Prerequisites

- Node.js 20+
- PostgreSQL 14+ (running on localhost:5432)
- Redis 6+ (running on localhost:6379)

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/wedding-ecosystem.git
cd wedding-ecosystem
npm install
```

### 2. Setup Database

```bash
# Buat database
sudo -u postgres psql -c "CREATE DATABASE wedding_digital_saas;"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"

# Jalankan migrasi
cd packages/db
npx prisma migrate dev --name init
npx prisma generate

# Seed data demo
npx tsx prisma/seed.ts
```

### 3. Start Redis

```bash
# Ubuntu/Debian
sudo apt install redis-server
sudo service redis-server start

# Verify
redis-cli ping  # Should return PONG
```

### 4. Jalankan Aplikasi

```bash
# Terminal 1: Backend API
cd packages/api
npm run dev
# → http://localhost:4000

# Terminal 2: Dashboard
cd apps/dashboard
npm run dev
# → http://localhost:3000

# Terminal 3: Invitation (opsional)
cd apps/invitation
npm run dev
# → http://localhost:3001

# Terminal 4: Scanner (opsional)
cd apps/scanner
npm run dev
# → http://localhost:3002
```

### 5. Login

Buka `http://localhost:3000/login` dengan kredensial demo:
- **Email**: `admin@demo.com`
- **Password**: `password123`

## Menjalankan Tests

```bash
# Semua tests (dari root)
npm run test

# Per package
cd packages/api && npx vitest run      # 556 tests
cd packages/shared && npx vitest run   # 31 tests
cd packages/realtime && npx vitest run # 32 tests
cd apps/dashboard && npx vitest run    # 81 tests
cd apps/invitation && npx vitest run   # 32 tests
cd apps/scanner && npx vitest run      # 43 tests
```

**Total: 775 tests** ✓

## Struktur Project

```
wedding-ecosystem/
├── apps/
│   ├── dashboard/          # Client & WO Dashboard
│   ├── invitation/         # Guest-facing invitation
│   └── scanner/            # Scanner PWA
├── packages/
│   ├── api/                # Backend API (Fastify)
│   ├── db/                 # Database schema (Prisma)
│   ├── shared/             # Shared types & utilities
│   └── realtime/           # WebSocket server
├── .kiro/
│   └── specs/              # Feature specifications
├── package.json            # Monorepo root
└── README.md
```

## Fitur Utama

- **Multi-tenant** — Data terisolasi per client, row-level security
- **QR Check-in** — Scan < 2 detik, duplicate detection via Redis
- **Offline-first Scanner** — PWA dengan service worker, sync otomatis
- **Real-time Dashboard** — WebSocket broadcast untuk check-in & RSVP
- **CMS Undangan** — 14 section yang bisa diaktifkan/dinonaktifkan dan diurutkan
- **Personalized URL** — `/{event-slug}?to={guest-slug}` menampilkan nama tamu di cover
- **Theme System** — 5 preset warna, kustomisasi hex, apply tanpa reload
- **Bulk Operations** — Import CSV (max 2000 tamu), kirim undangan batch (max 500)

## Environment Variables

```env
# packages/db/.env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/wedding_digital_saas?schema=public"

# packages/api (opsional, ada default)
JWT_SECRET=wedding-dev-secret-key
REFRESH_SECRET=wedding-dev-refresh-secret-key
PORT=4000
DASHBOARD_ORIGIN=http://localhost:3000
INVITATION_ORIGIN=http://localhost:3001
SCANNER_ORIGIN=http://localhost:3002

# apps/dashboard (opsional, ada default)
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=http://localhost:4000
```

## License

Private — All rights reserved.
