# Railway Deployment Setup

## Overview

Backend API (Fastify + Socket.io) di-deploy sebagai **1 service** di Railway. WebSocket server sudah embedded di API server (bukan service terpisah).

## Step 1: Buat Project di Railway

1. Buka [railway.app](https://railway.app)
2. Klik **New Project** → **Deploy from GitHub repo**
3. Pilih repo: `awingmawe/wedding-ecosystem`
4. Railway akan auto-detect `railway.toml` di root

### Service Configuration

| Setting        | Value                                                  |
| -------------- | ------------------------------------------------------ |
| Root Directory | `/` (root repo — monorepo)                             |
| Build Command  | `npm install && npx turbo build --filter=@wedding/api` |
| Start Command  | `node packages/api/dist/index.js`                      |
| Health Check   | `/health`                                              |
| Port           | `4000` (auto-detected from `PORT` env var)             |

> **Penting**: Railway harus build dari root repo karena ini monorepo dengan workspace dependencies.

## Step 2: Set Environment Variables

Di Railway Dashboard → Service → Variables, set:

### Wajib (Backend tidak jalan tanpa ini)

```env
NODE_ENV=production
PORT=4000

# Database (dari Supabase)
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=verify-full

# Redis (dari Upstash)
UPSTASH_REDIS_CACHE_URL=rediss://default:[password]@[endpoint].upstash.io:6379

# Auth
JWT_SECRET=<generate: openssl rand -hex 32>
REFRESH_SECRET=<generate: openssl rand -hex 32>

# Encryption
AES_ENCRYPTION_KEY=<generate: openssl rand -hex 16>
```

### CORS (agar frontend Vercel bisa connect)

```env
CORS_ADDITIONAL_ORIGINS=https://wedding-ecosystem-dashboard.vercel.app,https://wedding-ecosystem-invitation.vercel.app,https://wedding-ecosystem-scanner.vercel.app
```

### Cloudflare R2 (untuk file upload)

```env
R2_ACCOUNT_ID=<dari Cloudflare Dashboard>
R2_ACCESS_KEY_ID=<dari Cloudflare R2 API Token>
R2_SECRET_ACCESS_KEY=<dari Cloudflare R2 API Token>
R2_BUCKET_NAME=wedding-ecosystem
```

## Step 3: Generate Domain

1. Di Railway → Service → Settings → Networking
2. Klik **Generate Domain**
3. Anda akan mendapat domain seperti: `wedding-api-production-xxxx.up.railway.app`

## Step 4: Update Vercel Environment Variables

Setelah Railway domain didapat, set di **ketiga Vercel projects**:

| Variable              | Value                             |
| --------------------- | --------------------------------- |
| `NEXT_PUBLIC_API_URL` | `https://your-api.up.railway.app` |
| `NEXT_PUBLIC_WS_URL`  | `https://your-api.up.railway.app` |

> **Note**: API dan WebSocket menggunakan domain yang sama karena Socket.io di-attach ke HTTP server yang sama.

## Step 5: Verify Deployment

Setelah deploy berhasil, test:

```bash
# Health check
curl https://your-api.up.railway.app/health

# Expected response:
# {"status":"healthy","dependencies":{"postgresql":{"status":"up"},"redis_cache":{"status":"up"},"websocket":{"status":"up"}}}
```

## Architecture Note

```
┌─────────────────────────────────────────┐
│ Railway Service: wedding-api            │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Fastify HTTP Server (port 4000) │    │
│  │                                 │    │
│  │  REST API: /auth, /guests, ...  │    │
│  │  Health:   /health              │    │
│  │                                 │    │
│  │  Socket.io (attached to same    │    │
│  │  HTTP server, /socket.io path)  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  Connects to:                           │
│  • Supabase PostgreSQL (external)       │
│  • Upstash Redis (external)             │
│  • Cloudflare R2 (external)             │
└─────────────────────────────────────────┘
```

## Troubleshooting

| Issue                                 | Solution                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Build fails: workspace deps not found | Pastikan build dari root repo, bukan `packages/api/`                                                |
| `DATABASE_URL` connection refused     | Pastikan SSL mode `verify-full` dan gunakan pooler URL dari Supabase                                |
| Health check timeout                  | Pastikan `PORT=4000` di-set dan health endpoint accessible                                          |
| CORS error dari frontend              | Pastikan `CORS_ADDITIONAL_ORIGINS` include semua Vercel domains                                     |
| WebSocket connection refused          | API dan WS pakai domain yang sama — pastikan `NEXT_PUBLIC_WS_URL` sama dengan `NEXT_PUBLIC_API_URL` |

## Credentials yang Dibutuhkan

| Credential                | Sumber     | Cara Dapat                                                   |
| ------------------------- | ---------- | ------------------------------------------------------------ |
| `DATABASE_URL`            | Supabase   | Dashboard → Settings → Database → Connection string (pooler) |
| `UPSTASH_REDIS_CACHE_URL` | Upstash    | Console → Database → Details → Endpoint (rediss://)          |
| `R2_ACCESS_KEY_ID`        | Cloudflare | Dashboard → R2 → Manage R2 API Tokens → Create               |
| `R2_SECRET_ACCESS_KEY`    | Cloudflare | Same as above                                                |
| `R2_ACCOUNT_ID`           | Cloudflare | Dashboard → Overview → Account ID (sidebar)                  |
| `JWT_SECRET`              | Generate   | `openssl rand -hex 32`                                       |
| `AES_ENCRYPTION_KEY`      | Generate   | `openssl rand -hex 16`                                       |
