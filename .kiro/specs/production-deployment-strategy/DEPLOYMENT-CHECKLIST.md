# Deployment Checklist & Pengingat

> Dokumen ini adalah pengingat untuk persiapan go-live Wedding Digital SaaS.
> Strategi: **Semua gratis kecuali domain.**

---

## 1. Akun yang Perlu Dibuat (Gratis)

| #   | Platform                                | Kegunaan                                                 | URL                                           |
| --- | --------------------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| 1   | **Vercel**                              | Hosting 3 frontend apps (Dashboard, Invitation, Scanner) | https://vercel.com                            |
| 2   | **Railway** atau **Render**             | Hosting backend Fastify API + WebSocket server           | https://railway.app / https://render.com      |
| 3   | **Supabase**                            | Managed PostgreSQL database + Storage                    | https://supabase.com                          |
| 4   | **Upstash**                             | Managed Redis (cache + pub/sub)                          | https://upstash.com                           |
| 5   | **Cloudflare**                          | CDN, DNS, DDoS protection, SSL                           | https://cloudflare.com                        |
| 6   | **Cloudflare R2**                       | Object storage untuk media (foto, video)                 | https://cloudflare.com                        |
| 7   | **GitHub**                              | Repository + GitHub Actions CI/CD                        | https://github.com                            |
| 8   | **Better Stack** atau **Grafana Cloud** | Monitoring, logging, uptime                              | https://betterstack.com / https://grafana.com |
| 9   | **Doppler** (opsional)                  | Secret management terpusat                               | https://doppler.com                           |

---

## 2. Yang Perlu Dibeli

| Item          | Estimasi Biaya             | Rekomendasi Provider                               |
| ------------- | -------------------------- | -------------------------------------------------- |
| Domain `.com` | Rp 100.000 - 150.000/tahun | Cloudflare Registrar (harga at-cost, paling murah) |

> **Tips**: Beli domain langsung di Cloudflare Registrar agar DNS sudah otomatis terintegrasi.

---

## 3. Free Tier Limitations (Perlu Diperhatikan)

### Vercel (Hobby Plan)

- ✅ Unlimited deployments
- ✅ SSL otomatis
- ✅ Edge network global
- ⚠️ 100GB bandwidth/bulan
- ⚠️ Serverless function timeout 10 detik
- ⚠️ 1 team member saja
- ❌ Tidak ada password protection

### Railway (Free Plan)

- ✅ $5 credit/bulan (cukup untuk 1-2 services kecil)
- ⚠️ Setelah credit habis, service sleep
- ⚠️ 512MB RAM per service
- ⚠️ Shared CPU

### Supabase (Free Plan)

- ✅ 500MB database storage
- ✅ 2GB bandwidth
- ✅ 50MB file storage
- ✅ Auto-backup (daily)
- ✅ Connection pooling (Supavisor) built-in
- ✅ Row-Level Security (RLS) native support
- ⚠️ Pause setelah 1 minggu tidak aktif
- ⚠️ 2 projects saja (gunakan 1 untuk production)

### Upstash Redis (Free Plan)

- ✅ 10.000 commands/hari
- ✅ 256MB storage
- ⚠️ 1 database saja (perlu strategi untuk cache + pub/sub)
- ⚠️ Max 100 concurrent connections

### Cloudflare (Free Plan)

- ✅ Unlimited bandwidth CDN
- ✅ DDoS protection
- ✅ SSL/TLS gratis
- ✅ DNS gratis + DNSSEC
- ✅ R2: 10GB storage, 10 juta reads/bulan
- ⚠️ WAF rules terbatas (5 custom rules)
- ⚠️ Tidak ada origin shield di free plan

### GitHub Actions (Free)

- ✅ 2.000 minutes/bulan (private repo)
- ✅ Unlimited untuk public repo
- ⚠️ Max 20 concurrent jobs

### Better Stack (Free Plan)

- ✅ 5 monitors
- ✅ 3 status pages
- ✅ 1 log source (1GB/bulan)
- ⚠️ 3-minute check interval

---

## 4. Subdomain yang Perlu Dikonfigurasi

Setelah beli domain (contoh: `weddingku.com`), setup subdomain berikut di Cloudflare DNS:

```
dashboard.weddingku.com    → Vercel (Dashboard app)
weddingku.com              → Vercel (Invitation app - wildcard atau per event)
scanner.weddingku.com      → Vercel (Scanner PWA)
api.weddingku.com          → Railway/Render (Fastify API)
ws.weddingku.com           → Railway/Render (WebSocket server)
```

---

## 5. Environment Variables yang Perlu Disiapkan

### Backend API (Railway/Render)

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname?sslmode=require

# Redis
REDIS_URL=rediss://default:pass@host:6379
REDIS_PUBSUB_URL=rediss://default:pass@host:6379

# Auth
JWT_SECRET=<generate-random-64-char>
JWT_REFRESH_SECRET=<generate-random-64-char>
BCRYPT_ROUNDS=12

# Encryption
QR_ENCRYPTION_KEY=<generate-aes-256-key>
PII_ENCRYPTION_KEY=<generate-aes-256-key>

# Storage
STORAGE_BUCKET=wedding-media-prod
STORAGE_ENDPOINT=https://xxx.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY=<cloudflare-r2-access-key>
STORAGE_SECRET_KEY=<cloudflare-r2-secret-key>

# App
NODE_ENV=production
PORT=3000
CORS_ORIGINS=https://dashboard.weddingku.com,https://weddingku.com,https://scanner.weddingku.com
API_BASE_URL=https://api.weddingku.com
WS_URL=wss://ws.weddingku.com
```

### Frontend Apps (Vercel)

```env
NEXT_PUBLIC_API_URL=https://api.weddingku.com
NEXT_PUBLIC_WS_URL=wss://ws.weddingku.com
NEXT_PUBLIC_CDN_URL=https://cdn.weddingku.com
```

---

## 6. Langkah-Langkah Deployment (Urutan)

### Phase 1: Setup Infrastructure

1. [ ] Buat akun di semua platform (lihat tabel #1)
2. [ ] Beli domain di Cloudflare Registrar
3. [ ] Setup Cloudflare DNS untuk domain
4. [ ] Buat 1 project PostgreSQL di Supabase (production)
5. [ ] Buat Redis database di Upstash
6. [ ] Buat R2 bucket di Cloudflare untuk media storage

### Phase 2: Setup CI/CD

7. [ ] Setup GitHub repository (jika belum)
8. [ ] Buat GitHub Actions workflow untuk:
   - Lint + type check
   - Unit test + integration test
   - Build check
   - Auto-deploy ke Vercel (frontend)
   - Auto-deploy ke Railway/Render (backend)
9. [ ] Setup secret scanning (GitHub Advanced Security atau gitleaks)
10. [ ] Setup branch protection rules (require PR review)

### Phase 3: Deploy Backend

11. [ ] Deploy Fastify API ke Railway/Render
12. [ ] Set semua environment variables
13. [ ] Jalankan database migration (`npx prisma migrate deploy`)
14. [ ] Verifikasi health check endpoint (`/health`)
15. [ ] Deploy WebSocket server (bisa same service atau terpisah)

### Phase 4: Deploy Frontend

16. [ ] Connect Vercel ke GitHub repo
17. [ ] Setup 3 Vercel projects (dashboard, invitation, scanner)
18. [ ] Konfigurasi custom domain di Vercel
19. [ ] Set environment variables di Vercel
20. [ ] Verifikasi semua app accessible

### Phase 5: Security & DNS

21. [ ] Konfigurasi SSL/TLS di Cloudflare (Full Strict mode)
22. [ ] Setup HSTS header
23. [ ] Konfigurasi WAF rules di Cloudflare (5 free rules)
24. [ ] Setup rate limiting di Cloudflare (1 free rule)
25. [ ] Konfigurasi CORS di API server
26. [ ] Verifikasi DNSSEC aktif

### Phase 6: Monitoring & Backup

27. [ ] Setup uptime monitoring (Better Stack)
28. [ ] Setup log collection
29. [ ] Konfigurasi alert notifications (email + Telegram)
30. [ ] Verifikasi database backup berjalan (Supabase daily auto-backup)
31. [ ] Test restore dari backup

### Phase 7: Go-Live Verification

32. [ ] Smoke test: semua endpoint accessible
33. [ ] Test QR scan flow end-to-end
34. [ ] Test RSVP flow end-to-end
35. [ ] Test WebSocket real-time updates
36. [ ] Test offline mode Scanner
37. [ ] Performance test: Invitation load < 3s (3G)
38. [ ] Security scan (OWASP ZAP atau equivalent)
39. [ ] ✅ GO LIVE!

---

## 7. Perintah-Perintah Penting

```bash
# Generate random secrets
openssl rand -hex 32          # Untuk JWT_SECRET
openssl rand -hex 16          # Untuk AES-256 key (32 bytes hex)

# Database migration (production)
npx prisma migrate deploy

# Build semua apps
npm run build

# Test semua
npm run test

# Check bundle size (Invitation app)
cd apps/invitation && npx next build && npx @next/bundle-analyzer
```

---

## 8. Estimasi Biaya Bulanan

| Item                    | Biaya                 |
| ----------------------- | --------------------- |
| Vercel (Hobby)          | Rp 0                  |
| Railway/Render (Free)   | Rp 0                  |
| Supabase (Free)         | Rp 0                  |
| Upstash Redis (Free)    | Rp 0                  |
| Cloudflare (Free)       | Rp 0                  |
| Better Stack (Free)     | Rp 0                  |
| GitHub (Free)           | Rp 0                  |
| **Domain (.com/tahun)** | **~Rp 130.000/tahun** |
| **TOTAL**               | **~Rp 11.000/bulan**  |

> ⚠️ **Catatan**: Free tier cukup untuk early production (< 100 concurrent users).
> Ketika traffic naik, pertimbangkan upgrade Railway ($5/mo) dan Supabase Pro ($25/mo).

---

## 9. Kapan Perlu Upgrade (Paid Plan)

| Kondisi                   | Upgrade Yang Diperlukan   | Estimasi Biaya         |
| ------------------------- | ------------------------- | ---------------------- |
| > 100 concurrent users    | Railway Pro ($5/mo)       | Rp 80.000/bulan        |
| > 500MB database          | Supabase Pro ($25/mo)     | Rp 400.000/bulan       |
| > 10K Redis commands/hari | Upstash Pay-as-you-go     | Rp 15.000-50.000/bulan |
| > 10GB media storage      | Cloudflare R2 ($0.015/GB) | Rp 5.000-20.000/bulan  |
| Butuh team collaboration  | Vercel Pro ($20/mo)       | Rp 320.000/bulan       |
| Butuh advanced WAF        | Cloudflare Pro ($20/mo)   | Rp 320.000/bulan       |

---

## 10. Alternatif Gratis Lainnya (Backup Options)

| Kebutuhan       | Alternatif 1             | Alternatif 2                    |
| --------------- | ------------------------ | ------------------------------- |
| Backend hosting | Fly.io (free tier)       | Deno Deploy (free)              |
| Database        | Neon (free, branching)   | CockroachDB Serverless (free)   |
| Redis           | Redis Cloud (30MB free)  | Memcached di Railway            |
| Storage         | Backblaze B2 (10GB free) | Firebase Storage (5GB free)     |
| Monitoring      | UptimeRobot (free)       | Checkly (free tier)             |
| CI/CD           | GitLab CI (400 min/mo)   | Bitbucket Pipelines (50 min/mo) |

---

## Catatan Penting

1. **Supabase auto-pause**: Project akan pause setelah 1 minggu tidak aktif. Untuk production, pastikan ada traffic reguler (bisa pakai cron ping via GitHub Actions) atau upgrade ke Pro.
2. **Railway credit**: $5/bulan habis cepat jika service selalu running. Pertimbangkan auto-sleep.
3. **Upstash limit**: 10K commands/hari bisa habis cepat dengan real-time features. Monitor usage.
4. **Vercel cold start**: Serverless functions bisa lambat saat cold start. Gunakan Edge Runtime jika memungkinkan.
5. **Backup manual**: Di free tier, beberapa platform tidak menyediakan automated backup. Buat script backup manual via cron job di GitHub Actions.
