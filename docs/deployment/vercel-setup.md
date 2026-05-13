# Vercel Deployment Setup

## Overview

Tiga frontend apps di-deploy sebagai project terpisah di Vercel. Masing-masing menggunakan Turborepo untuk build dependencies (`@wedding/shared`).

## Step 1: Buat 3 Project di Vercel

Login ke [vercel.com](https://vercel.com) dan buat 3 project baru:

| Project Name         | Root Directory    | Framework |
| -------------------- | ----------------- | --------- |
| `wedding-dashboard`  | `apps/dashboard`  | Next.js   |
| `wedding-invitation` | `apps/invitation` | Next.js   |
| `wedding-scanner`    | `apps/scanner`    | Next.js   |

### Cara Buat Project

1. Klik **Add New → Project**
2. Import repository dari GitHub
3. Set **Root Directory** ke path app yang sesuai (e.g., `apps/dashboard`)
4. Framework Preset: **Next.js** (auto-detected)
5. Build Command: biarkan default (vercel.json akan override)
6. Klik **Deploy**

> **Penting**: Saat import repo, Vercel akan tanya "Which directory is your code in?" — pilih root directory yang sesuai untuk setiap app.

## Step 2: Environment Variables

Set environment variables di setiap project melalui Vercel Dashboard → Project → Settings → Environment Variables:

### Dashboard (`wedding-dashboard`)

| Variable              | Value                          | Environment |
| --------------------- | ------------------------------ | ----------- |
| `NEXT_PUBLIC_API_URL` | `https://your-api.railway.app` | Production  |
| `NEXT_PUBLIC_WS_URL`  | `https://your-ws.railway.app`  | Production  |

### Invitation (`wedding-invitation`)

| Variable              | Value                          | Environment |
| --------------------- | ------------------------------ | ----------- |
| `NEXT_PUBLIC_API_URL` | `https://your-api.railway.app` | Production  |

### Scanner (`wedding-scanner`)

| Variable              | Value                          | Environment |
| --------------------- | ------------------------------ | ----------- |
| `NEXT_PUBLIC_API_URL` | `https://your-api.railway.app` | Production  |
| `NEXT_PUBLIC_WS_URL`  | `https://your-ws.railway.app`  | Production  |

> **Note**: Bisa di-set nanti setelah backend di-deploy ke Railway. Tanpa env vars, apps akan fallback ke localhost (UI tampil tapi tidak connect ke backend).

## Step 3: Vercel Project Settings

Untuk setiap project, pastikan settings berikut:

### General Settings

- **Node.js Version**: 20.x
- **Build Command**: (override by vercel.json — leave default)
- **Output Directory**: (override by vercel.json — leave default)
- **Install Command**: `npm install`

### Git Settings

- **Production Branch**: `main`
- **Ignored Build Step**: Tidak perlu (Vercel auto-detect changes)

## Step 4: Turborepo Remote Caching (Optional)

Untuk mempercepat build di Vercel:

1. Di Vercel Dashboard → Settings → General
2. Enable **Remote Caching**
3. Ini akan cache build output dari `@wedding/shared` antar deploys

## Hasil Setelah Deploy

Setelah deploy berhasil, Anda akan mendapat domain:

| App        | Domain (contoh)                 |
| ---------- | ------------------------------- |
| Dashboard  | `wedding-dashboard.vercel.app`  |
| Invitation | `wedding-invitation.vercel.app` |
| Scanner    | `wedding-scanner.vercel.app`    |

## Step 5: Update Backend CORS (Setelah Backend Live)

Setelah backend di-deploy ke Railway, set environment variable di Railway:

```
CORS_ADDITIONAL_ORIGINS=https://wedding-dashboard.vercel.app,https://wedding-invitation.vercel.app,https://wedding-scanner.vercel.app
```

Ini memungkinkan frontend apps berkomunikasi dengan backend tanpa custom domain.

## Custom Domain (Menyusul)

Ketika custom domain sudah siap:

1. Di Vercel: Project → Settings → Domains → Add domain
2. Set `PRODUCTION_DOMAIN` env var di backend
3. Update DNS records di Cloudflare
4. Hapus `CORS_ADDITIONAL_ORIGINS` (CORS plugin akan menggunakan `PRODUCTION_DOMAIN` patterns)

## Troubleshooting

| Issue                                             | Solution                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Build fails: "Cannot find module @wedding/shared" | Pastikan Root Directory di-set ke `apps/xxx` (bukan root repo)                |
| Build fails: turbo not found                      | `turbo` ada di root devDependencies, `npm install` dari root akan install-nya |
| CORS error di browser                             | Set `CORS_ADDITIONAL_ORIGINS` di backend dengan domain Vercel                 |
| API calls ke localhost                            | Set `NEXT_PUBLIC_API_URL` di Vercel environment variables                     |
| Build timeout                                     | Enable Turborepo Remote Caching di Vercel settings                            |
