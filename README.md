# Wedding Ecosystem

Platform multi-tenant untuk manajemen undangan pernikahan digital, menargetkan pasar Indonesia. Terdiri dari 3 aplikasi frontend yang terintegrasi dengan satu backend API.

---

## Daftar Isi

- [Arsitektur](#arsitektur)
- [Spesifikasi Aplikasi](#spesifikasi-aplikasi)
- [Peran & Hak Akses](#peran--hak-akses)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Setup Local Development](#setup-local-development)
- [Deploy Production](#deploy-production)
- [Cara Penggunaan](#cara-penggunaan)
- [Testing](#testing)
- [Struktur Project](#struktur-project)
- [Environment Variables](#environment-variables)

---

## Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Apps (Vercel)                    │
├───────────────────┬───────────────────┬─────────────────────┤
│   Dashboard       │   Invitation      │   Scanner (PWA)     │
│   (Next.js 16)    │   (Next.js 16)    │   (Next.js 16)      │
│   Port: 3000      │   Port: 3001      │   Port: 3002        │
└────────┬──────────┴────────┬──────────┴──────────┬──────────┘
         │                   │                     │
         └───────────────────┼─────────────────────┘
                             │ REST + WebSocket
┌────────────────────────────┴────────────────────────────────┐
│              Backend API + WebSocket (Railway)                │
│                   Fastify 5 + Socket.io 4.8                  │
│                        Port: 4000                            │
├──────────────────────────────────────────────────────────────┤
│  Auth │ Guest │ RSVP │ Check-in │ CMS │ Scanner │ Realtime  │
└────────┬──────────────────────┬──────────────────────────────┘
         │                      │
    ┌────┴────┐           ┌─────┴─────┐
    │PostgreSQL│          │   Redis   │
    │(Supabase)│          │ (Upstash) │
    └──────────┘          └───────────┘
```

---

## Spesifikasi Aplikasi

### 1. Dashboard (`apps/dashboard`)

Aplikasi web responsif untuk mengelola seluruh aspek undangan pernikahan.

| Fitur            | Deskripsi                                                   |
| ---------------- | ----------------------------------------------------------- |
| Manajemen Tamu   | CRUD tamu, import CSV (max 2000), filter per grup           |
| QR Code          | Generate otomatis per tamu, payload terenkripsi             |
| RSVP Tracking    | Monitor konfirmasi kehadiran real-time                      |
| Check-in Monitor | Dashboard real-time via WebSocket                           |
| CMS Undangan     | 14 section yang bisa diaktifkan/dinonaktifkan dan diurutkan |
| Theme System     | 5 preset warna, kustomisasi hex                             |
| Notifikasi       | Kirim undangan batch (max 500)                              |
| Multi-tenant     | Data terisolasi per client                                  |

**User Roles**: Admin, Client, WO (Wedding Organizer)

### 2. Invitation (`apps/invitation`)

Aplikasi web mobile-first untuk menampilkan undangan digital kepada tamu.

| Fitur            | Deskripsi                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Personalized URL | `/{event-slug}?to={guest-slug}` menampilkan nama tamu di cover                                                              |
| 14 Section CMS   | Cover, Bride & Groom, Story, Verse, Countdown, Akad & Resepsi, RSVP, Attire, Gallery, Video, Gift, Messages, Closing, Music |
| RSVP Form        | Konfirmasi kehadiran (Akad/Resepsi/Keduanya/Tidak Hadir)                                                                    |
| Wishes/Messages  | Kirim ucapan untuk pengantin                                                                                                |
| Animasi          | Motion (Framer Motion) untuk transisi section                                                                               |
| Performance      | Target FCP < 3s di mobile 3G                                                                                                |
| No Auth Required | Akses publik via personalized URL                                                                                           |

### 3. Scanner (`apps/scanner`)

Progressive Web App (PWA) untuk verifikasi kehadiran tamu di venue.

| Fitur               | Deskripsi                                             |
| ------------------- | ----------------------------------------------------- |
| QR Scan             | Verifikasi < 2 detik, kamera real-time                |
| Manual Check-in     | Cari nama tamu, check-in tanpa QR                     |
| Go-Show             | Daftarkan tamu walk-in di hari-H                      |
| Offline-first       | Service worker + IndexedDB, sync otomatis saat online |
| Duplicate Detection | Scan kedua menampilkan warning (YELLOW)               |
| Real-time Sync      | WebSocket untuk koordinasi antar scanner device       |
| Max 2 Device        | Maksimal 2 scanner per event (Lane 1 & Lane 2)        |
| Auth Flow           | Login → Pilih Event → Register Device → Scan          |

**Verification Status**:

- 🟢 GREEN — Check-in berhasil
- 🔴 RED — QR tidak valid
- 🟡 YELLOW — Tamu sudah check-in sebelumnya

### 4. Backend API (`packages/api`)

Single Fastify server yang menangani REST API dan WebSocket.

| Fitur             | Deskripsi                                                     |
| ----------------- | ------------------------------------------------------------- |
| Authentication    | JWT (15 min access + 7 hari refresh), bcrypt, account lockout |
| Tenant Isolation  | Setiap query di-filter berdasarkan `tenant_id`                |
| Rate Limiting     | 100 req/menit per tenant (Redis-backed)                       |
| CORS              | Per-app origin validation                                     |
| WebSocket Auth    | JWT validation on handshake, room-based authorization         |
| Health Check      | PostgreSQL, Redis, WebSocket status monitoring                |
| Graceful Shutdown | SIGTERM/SIGINT handlers, drain connections                    |
| Audit Logger      | Auto-log sensitive operations (login, export, bulk)           |
| Response Cache    | Redis-backed, auto-invalidation on write                      |
| Security Headers  | HSTS, X-Frame-Options, CSP-ready                              |

### 5. Shared Package (`packages/shared`)

| Fitur            | Deskripsi                                      |
| ---------------- | ---------------------------------------------- |
| Zod Schemas      | Validasi input yang dipakai frontend & backend |
| TypeScript Types | Interfaces, enums, error codes                 |
| Sanitization     | HTML sanitize untuk user-generated content     |
| Constants        | Rate limits, error codes, API response types   |

### 6. Database (`packages/db`)

| Fitur           | Deskripsi                       |
| --------------- | ------------------------------- |
| Prisma ORM      | Schema-first, type-safe queries |
| Connection Pool | CPU cores × 2 + 1, minimum 10   |
| SSL             | verify-full di production       |
| Query Timeout   | 30 detik                        |
| Multi-tenant    | `tenant_id` di setiap tabel     |

### 7. Realtime (`packages/realtime`)

| Fitur              | Deskripsi                                                    |
| ------------------ | ------------------------------------------------------------ |
| Socket.io          | Room-based per event                                         |
| Events             | guest_checked_in, rsvp_updated, go_show_added, stats_updated |
| Auth Middleware    | JWT validation on WebSocket handshake                        |
| Room Authorization | Tenant-scoped room access                                    |
| Redis Adapter      | Ready untuk horizontal scaling                               |
| Graceful Shutdown  | Notify clients, drain connections                            |

## Peran & Hak Akses (Roles & Permissions)

Sistem ini menggunakan **Role-Based Access Control (RBAC)** untuk membatasi akses fitur dan data berdasarkan peran masing-masing pengguna. Dilengkapi dengan isolasi *multi-tenant* di tingkat basis data, setiap pengguna (selain Admin Global) hanya dapat mengakses data yang berhak mereka lihat.

Berikut adalah spesifikasi lengkap hak akses untuk masing-masing peran (*role*):

### 1. Admin (Global Administrator)
* **Deskripsi**: Administrator platform yang memiliki kendali penuh secara global terhadap seluruh ekosistem aplikasi.
* **Lingkup Kerja (Scope)**: Global (Lintas seluruh tenant dan seluruh data sistem).
* **Dapat Melakukan (Allowed)**:
  * Melakukan pendaftaran, edit, dan penghapusan tenant baru (*Multi-Tenant Management*).
  * Melakukan CRUD penuh terhadap seluruh resource database (User, Tenant, Event, Tamu, dsb.).
  * Mengakses dashboard global dan memantau status kesehatan sistem secara menyeluruh.
  * Mengonfigurasi pengaturan sistem global dan mengelola lisensi client.
* **Tidak Dapat Melakukan (Restricted)**:
  * — (Tidak ada batasan hak akses / Super User).

### 2. Client (Wedding Owner / Penyelenggara)
* **Deskripsi**: Akun pemilik/penyelenggara pernikahan yang menyewa tenant pada platform.
* **Lingkup Kerja (Scope)**: Tenant Milik Sendiri (Hanya dapat mengakses data dalam tenant mereka sendiri).
* **Dapat Melakukan (Allowed)**:
  * Membuat, memperbarui, dan menghapus event pernikahan di dalam tenant milik sendiri.
  * Mengelola daftar tamu secara penuh (CRUD tamu, generate otomatis QR Code, ekspor data, dan import bulk via CSV).
  * Mengonfigurasi CMS Undangan (mengaktifkan/menonaktifkan dan menyusun ulang urutan 14 section undangan).
  * Memilih preset warna tema undangan dan melakukan kustomisasi warna hex.
  * Mengirimkan broadcast notifikasi undangan secara massal (batch max 500 tamu).
  * Memantau real-time RSVP (kehadiran & pax) dan melihat statistik check-in tamu di hari-H secara real-time via WebSocket.
* **Tidak Dapat Melakukan (Restricted)**:
  * Mengakses, melihat, atau memodifikasi data dari tenant/client lain (*strict multi-tenant isolation*).
  * Membuat tenant baru atau mengelola akun Admin lainnya.
  * Mendaftarkan scanner device melebihi batas kuota (maksimal 2 device aktif per event).

### 3. WO (Wedding Organizer)
* **Deskripsi**: Peran operasional pihak ketiga yang ditugaskan oleh Client untuk membantu jalannya acara pernikahan.
* **Lingkup Kerja (Scope)**: Event yang Ditugaskan (*Assigned Events*).
* **Dapat Melakukan (Allowed)**:
  * Mengelola daftar tamu untuk event yang ditugaskan kepadanya (tambah tamu, update info RSVP, dsb.).
  * Memantau jalannya check-in tamu secara real-time di hari-H melalui dashboard WO.
  * Melihat statistik kehadiran, ringkasan RSVP, dan laporan Check-in tamu.
* **Tidak Dapat Melakukan (Restricted)**:
  * Membuat event pernikahan baru atau menghapus event yang sudah ada.
  * Mengonfigurasi CMS Undangan atau merubah pengaturan tema/desain undangan.
  * Mengirimkan broadcast notifikasi undangan massal.
  * Mengakses data event atau data tamu dari client/tenant lain yang tidak ditugaskan kepadanya.

### 4. Scanner Operator (Petugas Venue)
* **Deskripsi**: Operator di lokasi acara (hari-H) yang bertugas melakukan verifikasi kehadiran fisik tamu di pintu masuk.
* **Lingkup Kerja (Scope)**: Satu Event Spesifik pada Hari-H (*Assigned Active Event*).
* **Dapat Melakukan (Allowed)**:
  * Melakukan verifikasi QR Code tamu menggunakan kamera device (respon cepat < 2 detik).
  * Melakukan check-in manual dengan mencari nama tamu (minimal 3 karakter) jika tamu tidak membawa QR Code.
  * Mendaftarkan tamu dadakan (*Go-Show*) langsung di lokasi acara (hari-H) tanpa generate QR Code, dan langsung tercatat sebagai checked-in.
  * Menyimpan data scan secara lokal di IndexedDB saat offline, dan melakukan sinkronisasi otomatis (*automatic sync*) ke server ketika koneksi pulih (dengan aturan *Server Wins* jika terjadi konflik).
  * Mendaftarkan device scanner (maksimal 2 device aktif per event untuk menghindari antrean ganda di gerbang yang sama).
* **Tidak Dapat Melakukan (Restricted)**:
  * Mengubah informasi tamu yang sudah terdaftar sebelumnya (selain mencatat status check-in).
  * Menghapus tamu dari daftar.
  * Mengedit konfigurasi CMS Undangan, detail acara, maupun tema undangan.
  * Melakukan broadcast pengiriman undangan.

### 5. Tamu (Guest)
* **Deskripsi**: Penerima undangan digital pernikahan.
* **Lingkup Kerja (Scope)**: Halaman Undangan Publik yang Dipersonalisasi via URL (`/{event-slug}?to={guest-slug}`).
* **Dapat Melakukan (Allowed)**:
  * Mengakses halaman undangan digital yang menampilkan sapaan nama mereka secara personal di bagian cover.
  * Mengisi formulir RSVP (konfirmasi kehadiran pada Akad, Resepsi, Keduanya, atau Tidak Hadir beserta jumlah pax).
  * Mengirimkan ucapan selamat, doa restu, atau pesan (*wishes/messages*) kepada kedua mempelai.
  * Melihat 14 section informasi pernikahan (kisah cinta, galeri foto, video prewedding, info dress code, koordinat peta venue, hitung mundur acara, dan info amplop digital/kado).
* **Tidak Dapat Melakukan (Restricted)**:
  * Mengakses halaman dashboard admin ataupun dashboard WO (memerlukan autentikasi JWT).
  * Mengakses aplikasi scanner check-in tamu.
  * Melihat data tamu lain atau pesan yang bersifat privat.

---

## Tech Stack

| Layer              | Technology                    | Version   |
| ------------------ | ----------------------------- | --------- |
| Frontend Framework | Next.js                       | 16.2      |
| UI Library         | React                         | 19.2      |
| Styling            | TailwindCSS                   | 4.3       |
| Components         | shadcn/ui                     | latest    |
| Animation          | Motion (Framer Motion)        | 12.17+    |
| QR Scanning        | html5-qrcode                  | 2.3       |
| Forms              | React Hook Form               | 7.75      |
| Data Fetching      | @tanstack/react-query         | 5.89+     |
| Backend            | Fastify                       | 5.8       |
| ORM                | Prisma                        | 7.7       |
| WebSocket          | Socket.io                     | 4.8       |
| Cache/PubSub       | Redis (ioredis)               | 5.10      |
| Auth               | JWT + bcrypt                  | 9.0 / 6.0 |
| Validation         | Zod                           | 3.25      |
| Image Processing   | Sharp                         | 0.34      |
| Storage            | Cloudflare R2 (S3-compatible) | —         |
| Testing            | Vitest + fast-check           | 3.2 / 4.8 |
| Language           | TypeScript                    | 5.9       |
| Monorepo           | npm workspaces + Turborepo    | 2.4       |

---

## Prerequisites

- **Node.js** 20+ (disarankan 22 LTS)
- **PostgreSQL** 14+ (local atau Supabase)
- **Redis** 6+ (local atau Upstash)
- **npm** 10+

---

## Setup Local Development

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/wedding-ecosystem.git
cd wedding-ecosystem
npm install
```

### 2. Setup Environment Variables

```bash
cp .env.example .env
```

Edit `.env` dan isi minimal:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/wedding_digital_saas?schema=public"
```

Buat juga `packages/db/.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/wedding_digital_saas?schema=public"
```

### 3. Setup Database

```bash
# Buat database
sudo -u postgres psql -c "CREATE DATABASE wedding_digital_saas;"

# Jalankan migrasi
npx prisma migrate dev --schema=packages/db/prisma/schema.prisma

# Generate Prisma client
npx prisma generate --schema=packages/db/prisma/schema.prisma
```

### 4. Start Redis (opsional untuk development)

Redis tidak wajib untuk development — sistem akan graceful degrade tanpa Redis (cache bypass, rate limit in-memory).

```bash
# Ubuntu/Debian
sudo apt install redis-server
sudo service redis-server start

# Verify
redis-cli ping  # Should return PONG
```

Jika menggunakan Redis, tambahkan ke `.env`:

```env
UPSTASH_REDIS_CACHE_URL=redis://localhost:6379
```

### 5. Jalankan Semua Aplikasi

```bash
# Dari root — jalankan semua sekaligus via Turborepo
npm run dev
```

Atau jalankan terpisah:

```bash
# Terminal 1: Backend API (http://localhost:4000)
npx turbo dev --filter=@wedding/api

# Terminal 2: Dashboard (http://localhost:3000)
npx turbo dev --filter=@wedding/dashboard

# Terminal 3: Invitation (http://localhost:3001)
npx turbo dev --filter=@wedding/invitation

# Terminal 4: Scanner (http://localhost:3002)
npx turbo dev --filter=@wedding/scanner
```

### 6. Seed Data (Opsional)

Untuk membuat user demo:

```bash
cd packages/db
npx tsx prisma/seed.ts
```

Kredensial demo:

- **Admin**: `admin@demo.com` / `password123`
- **Scanner**: `scanner@demo.com` / `password123`

---

## Deploy Production

### Infrastruktur

| Service                 | Platform      | Keterangan                            |
| ----------------------- | ------------- | ------------------------------------- |
| Frontend (3 apps)       | Vercel        | Auto-deploy dari branch `main`        |
| Backend API + WebSocket | Railway       | Single service, blue-green deployment |
| Database                | Supabase      | Managed PostgreSQL + PgBouncer        |
| Cache/PubSub            | Upstash       | Serverless Redis                      |
| CDN/Storage             | Cloudflare R2 | Media files + CDN                     |

### Alur Deploy

```
Push ke main
    │
    ├── CI (GitHub Actions)
    │   ├── Install dependencies
    │   ├── Run tests (vitest)
    │   ├── Security audit (npm audit)
    │   ├── Static analysis (ESLint + TypeScript)
    │   └── Secret scanning
    │
    ├── Frontend Deploy (jika apps/ berubah)
    │   ├── Detect changed apps (git diff)
    │   ├── Build via Vercel CLI
    │   ├── Deploy to production
    │   └── Smoke test (HTTP status + asset accessibility)
    │
    └── Backend Deploy (jika packages/ berubah)
        ├── Run database migrations (prisma migrate deploy)
        ├── Deploy ke inactive environment (blue/green)
        ├── Health check (3 menit, 3 consecutive successes)
        ├── Swap traffic ke new environment
        └── Auto-rollback jika health check gagal
```

### Setup Railway

1. Buat project di Railway
2. Tambahkan service dari repo (root directory)
3. Set environment variables:

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://...?sslmode=verify-full
DATABASE_POOLED_URL=postgresql://...:6543/...?sslmode=verify-full
UPSTASH_REDIS_CACHE_URL=rediss://default:...@....upstash.io:6379
JWT_SECRET=<random-64-char-string>
REFRESH_SECRET=<random-64-char-string>
DASHBOARD_ORIGIN=https://your-dashboard.vercel.app
INVITATION_ORIGIN=https://your-invitation.vercel.app
SCANNER_ORIGIN=https://your-scanner.vercel.app
```

Railway akan menggunakan `packages/api/railway.toml` untuk build & start command.

### Setup Vercel

1. Import repo ke Vercel (3 projects, satu per app)
2. Set root directory per project: `apps/dashboard`, `apps/invitation`, `apps/scanner`
3. Set environment variables per project:

```env
NEXT_PUBLIC_API_URL=https://your-api.railway.app
NEXT_PUBLIC_WS_URL=https://your-api.railway.app
NEXT_PUBLIC_CDN_URL=https://cdn.yourdomain.com
```

Setiap app sudah punya `vercel.json` dengan build command dan security headers.

### Setup GitHub Secrets

```
RAILWAY_TOKEN
RAILWAY_PROJECT_ID
VERCEL_ORG_ID
VERCEL_TOKEN
VERCEL_PROJECT_ID_DASHBOARD
VERCEL_PROJECT_ID_INVITATION
VERCEL_PROJECT_ID_SCANNER
DATABASE_URL_TEST
CLOUDFLARE_ZONE_ID (opsional)
CLOUDFLARE_API_TOKEN (opsional)
SLACK_WEBHOOK_URL (opsional)
```

### Database Migration (Production)

```bash
# Dari CI/CD (otomatis via deploy-backend.yml)
cd packages/db
npx prisma migrate deploy
```

---

## Cara Penggunaan

### Dashboard — Untuk Client & WO

1. **Login** di `https://dashboard-url/login`
2. **Kelola Tamu**:
   - Tambah tamu satu-satu atau import CSV
   - QR code otomatis di-generate
   - Filter berdasarkan grup (Keluarga, Teman, Rekan Kerja, VIP)
3. **Atur Undangan (CMS)**:
   - Aktifkan/nonaktifkan section
   - Drag & drop untuk mengubah urutan
   - Edit konten per section (teks, gambar, video)
4. **Pilih Theme**:
   - 5 preset warna tersedia
   - Kustomisasi warna hex
5. **Kirim Undangan**:
   - Kirim via WhatsApp/SMS (link personalized)
   - Track status pengiriman (Belum Dikirim / Terkirim / Gagal)
6. **Monitor RSVP**:
   - Lihat siapa yang sudah konfirmasi
   - Filter: Akad, Resepsi, Keduanya, Tidak Hadir
7. **Monitor Check-in (Hari-H)**:
   - Real-time dashboard via WebSocket
   - Lihat total tamu hadir, Go-Show, statistik per grup

### Invitation — Untuk Tamu

1. Tamu menerima link: `https://invitation-url/{event-slug}?to={nama-tamu}`
2. Cover menampilkan nama tamu yang dipersonalisasi
3. Scroll melalui section undangan (animasi smooth)
4. **RSVP**: Pilih kehadiran (Akad/Resepsi/Keduanya/Tidak Hadir) + jumlah tamu
5. **Ucapan**: Kirim pesan/wishes untuk pengantin
6. **Informasi**: Lihat peta venue, countdown, dress code, gift info

### Scanner — Untuk Operator di Venue

1. **Login**: Masuk dengan akun scanner operator
2. **Pilih Event**: Pilih event yang sedang berlangsung
3. **Register Device**: Otomatis terdaftar sebagai scanner device (max 2 per event)
4. **Scan QR**:
   - Arahkan kamera ke QR code tamu
   - Hasil muncul dalam < 2 detik:
     - 🟢 GREEN: Check-in berhasil (nama + grup tamu)
     - 🔴 RED: QR tidak valid
     - 🟡 YELLOW: Sudah check-in sebelumnya (tampilkan waktu check-in pertama)
5. **Manual Check-in**:
   - Cari nama tamu (min 3 karakter)
   - Tap "Check-in" pada hasil pencarian
6. **Go-Show**:
   - Jika tamu tidak ditemukan, tap "Tambah sebagai Go-Show"
   - Isi nama → langsung tercatat sebagai checked-in
7. **Mode Offline**:
   - Scanner tetap berfungsi tanpa internet
   - Data disimpan di IndexedDB
   - Sync otomatis saat koneksi kembali (dalam 30 detik)
   - Conflict resolution: server timestamp wins
8. **Ganti Event / Logout**:
   - Tombol di header untuk switch event atau keluar

---

## Testing

```bash
# Semua tests dari root
npm run test

# Per package
npx turbo test --filter=@wedding/api        # ~843 tests
npx turbo test --filter=@wedding/shared      # ~63 tests
npx turbo test --filter=@wedding/realtime    # ~87 tests
npx turbo test --filter=@wedding/dashboard   # ~81 tests
npx turbo test --filter=@wedding/invitation  # ~32 tests
npx turbo test --filter=@wedding/scanner     # ~43 tests
```

**Total: ~1149 tests** (unit + integration + property-based)

Property-based tests (fast-check) mencakup:

- QR validation edge cases
- RSVP processing invariants
- Duplicate detection guarantees
- Tenant isolation properties
- Offline sync completeness
- Room isolation (WebSocket)

---

## Struktur Project

```
wedding-ecosystem/
├── apps/
│   ├── dashboard/          # Client & WO Dashboard (Next.js 16)
│   │   ├── src/
│   │   │   ├── app/        # App Router pages
│   │   │   ├── components/ # UI components (shadcn/ui)
│   │   │   ├── hooks/      # Custom hooks (useSocket, etc.)
│   │   │   └── lib/        # API client, utilities
│   │   ├── vercel.json     # Vercel deploy config
│   │   └── next.config.js
│   ├── invitation/         # Guest-facing invitation (Next.js 16)
│   │   ├── src/
│   │   │   ├── app/        # Dynamic route: /[slug]
│   │   │   ├── components/ # Section components (14 sections)
│   │   │   └── lib/        # API client, theme utils
│   │   └── vercel.json
│   └── scanner/            # Scanner PWA (Next.js 16)
│       ├── src/
│       │   ├── app/        # Scanner pages
│       │   ├── components/ # QR scanner, auth, providers
│       │   └── lib/        # Auth, offline queue, WebSocket
│       ├── public/sw.js    # Service worker
│       └── vercel.json
├── packages/
│   ├── api/                # Backend API (Fastify 5)
│   │   ├── src/
│   │   │   ├── config/     # Production, database, Redis, logger
│   │   │   ├── middleware/ # CORS, rate limit, tenant isolation, RBAC
│   │   │   ├── plugins/    # Audit logger, response cache, security headers
│   │   │   ├── routes/     # Auth, guests, events, checkin, RSVP, CMS, scanner
│   │   │   └── services/   # Business logic layer
│   │   └── railway.toml    # Railway deploy config
│   ├── db/                 # Database (Prisma 7)
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── src/            # Client factory, pool config
│   ├── shared/             # Shared types & utilities
│   │   └── src/
│   │       ├── types/      # Enums, interfaces, Zod schemas
│   │       └── utils/      # Sanitization, constants
│   └── realtime/           # WebSocket server (Socket.io 4.8)
│       └── src/
│           ├── config/     # Production Socket.io config
│           ├── middleware/ # JWT auth, room authorization
│           ├── lifecycle/  # Graceful shutdown
│           └── stats.ts    # Real-time stats aggregation
├── .github/workflows/      # CI/CD pipelines
│   ├── ci.yml              # Tests + security gate
│   ├── deploy-backend.yml  # Blue-green Railway deploy
│   ├── deploy-frontend.yml # Vercel deploy per app
│   ├── smoke-test.yml      # Post-deploy verification
│   └── secret-scanning.yml # Secret detection
├── scripts/                # Utility scripts
│   ├── setup-production-domain.sh
│   ├── configure-cdn-cache.sh
│   └── detect-secrets.sh
├── .env.example            # Template environment variables
├── package.json            # Monorepo root (npm workspaces)
└── turbo.json              # Turborepo config
```

---

## Environment Variables

### Backend (Railway)

| Variable                  | Required | Default                          | Deskripsi                                 |
| ------------------------- | -------- | -------------------------------- | ----------------------------------------- |
| `NODE_ENV`                | Ya       | `development`                    | Environment mode                          |
| `PORT`                    | Tidak    | `4000`                           | Server port                               |
| `DATABASE_URL`            | Ya       | —                                | PostgreSQL connection (direct, port 5432) |
| `DATABASE_POOLED_URL`     | Tidak    | fallback ke DATABASE_URL         | PgBouncer connection (port 6543)          |
| `UPSTASH_REDIS_CACHE_URL` | Tidak    | —                                | Redis URL (graceful degrade jika kosong)  |
| `JWT_SECRET`              | Ya       | `wedding-dev-secret-key`         | JWT signing secret                        |
| `REFRESH_SECRET`          | Ya       | `wedding-dev-refresh-secret-key` | Refresh token secret                      |
| `DASHBOARD_ORIGIN`        | Ya       | `http://localhost:3000`          | Dashboard URL untuk CORS                  |
| `INVITATION_ORIGIN`       | Ya       | `http://localhost:3001`          | Invitation URL untuk CORS                 |
| `SCANNER_ORIGIN`          | Ya       | `http://localhost:3002`          | Scanner URL untuk CORS                    |
| `R2_ACCOUNT_ID`           | Tidak    | —                                | Cloudflare R2 account                     |
| `R2_ACCESS_KEY_ID`        | Tidak    | —                                | R2 access key                             |
| `R2_SECRET_ACCESS_KEY`    | Tidak    | —                                | R2 secret key                             |
| `R2_BUCKET_NAME`          | Tidak    | —                                | R2 bucket name                            |
| `R2_PUBLIC_URL`           | Tidak    | —                                | CDN URL untuk media                       |

### Frontend (Vercel)

| Variable              | Required | Default                 | Deskripsi                       |
| --------------------- | -------- | ----------------------- | ------------------------------- |
| `NEXT_PUBLIC_API_URL` | Ya       | `http://localhost:4000` | Backend API URL                 |
| `NEXT_PUBLIC_WS_URL`  | Ya       | `http://localhost:4000` | WebSocket URL (sama dengan API) |
| `NEXT_PUBLIC_CDN_URL` | Tidak    | —                       | CDN URL untuk media assets      |

---

## Performance Targets

| Metric                      | Target    |
| --------------------------- | --------- |
| QR scan verification        | < 2 detik |
| Invitation FCP (mobile 3G)  | < 3 detik |
| WebSocket broadcast latency | < 500ms   |
| Duplicate detection         | < 200ms   |
| DB lookup (QR/slug)         | < 100ms   |
| Guest capacity per event    | max 500   |

---

## Scale & Constraints

Deployment saat ini ditargetkan untuk **1 event aktif, max 500 tamu**:

- Single API server instance (no clustering)
- Single Redis instance (cache + pub/sub shared)
- Single WebSocket instance (~50 peak concurrent)
- Database pool: 10 connections

**Kapan perlu scale**: Multiple concurrent events, 1000+ tamu, atau p95 latency melebihi target.

---

## License

Private — All rights reserved.
