# Production Domain Setup Checklist

This document provides a comprehensive step-by-step checklist for configuring all domain-dependent services when the production domain goes live. Follow these steps in order after purchasing and registering your domain.

## Prerequisites

Before starting, ensure you have:

- [ ] Production domain registered (e.g., `weddingdigital.id`)
- [ ] Cloudflare account with the domain added as a zone
- [ ] Nameservers pointed to Cloudflare (verify zone status is "active")
- [ ] Cloudflare API token with Zone:Edit, R2:Edit, Workers:Edit permissions
- [ ] Vercel account with all 3 frontend projects created
- [ ] Railway account with backend services deployed

## Environment Variables Reference

Replace `yourdomain.com` with your actual production domain throughout.

| Variable                    | Value                              | Where                 |
| --------------------------- | ---------------------------------- | --------------------- |
| `PRODUCTION_DOMAIN`         | `yourdomain.com`                   | Railway, `.env`       |
| `R2_PUBLIC_URL`             | `https://cdn.yourdomain.com`       | Railway, `.env`       |
| `NEXT_PUBLIC_API_URL`       | `https://api.yourdomain.com`       | Vercel (all projects) |
| `NEXT_PUBLIC_WS_URL`        | `wss://ws.yourdomain.com`          | Vercel (all projects) |
| `NEXT_PUBLIC_CDN_URL`       | `https://cdn.yourdomain.com`       | Vercel (all projects) |
| `NEXT_PUBLIC_DASHBOARD_URL` | `https://dashboard.yourdomain.com` | Vercel (all projects) |
| `CORS_ADDITIONAL_ORIGINS`   | (optional, comma-separated)        | Railway               |

---

## Phase 1: DNS & Domain Configuration

### 1.1 Verify Cloudflare Zone

- [ ] Log in to Cloudflare Dashboard
- [ ] Confirm zone status is **Active** for your domain
- [ ] Note your **Zone ID** and **Account ID** (needed for scripts)

### 1.2 Configure DNS Records

Create the following DNS records in Cloudflare:

| Type  | Name           | Target                        | Proxy                  | TTL  |
| ----- | -------------- | ----------------------------- | ---------------------- | ---- |
| CNAME | `dashboard`    | Vercel project URL            | Proxied (orange cloud) | Auto |
| CNAME | `scanner`      | Vercel project URL            | Proxied (orange cloud) | Auto |
| CNAME | `api`          | Railway public URL            | Proxied (orange cloud) | Auto |
| CNAME | `ws`           | Railway public URL            | Proxied (orange cloud) | Auto |
| CNAME | `cdn`          | R2 bucket public endpoint     | Proxied (orange cloud) | Auto |
| CNAME | `*` (wildcard) | Vercel invitation project URL | Proxied (orange cloud) | Auto |

- [ ] Set initial TTL to **300 seconds** (5 minutes) for go-live flexibility
- [ ] Enable DNSSEC in Cloudflare Dashboard → DNS → DNSSEC

### 1.3 Configure Vercel Custom Domains

- [ ] Dashboard project → Settings → Domains → Add `dashboard.yourdomain.com`
- [ ] Invitation project → Settings → Domains → Add `*.yourdomain.com` (wildcard)
- [ ] Scanner project → Settings → Domains → Add `scanner.yourdomain.com`

### 1.4 Configure Railway Custom Domains

- [ ] API service → Settings → Networking → Add `api.yourdomain.com`
- [ ] WebSocket service → Settings → Networking → Add `ws.yourdomain.com`

---

## Phase 2: SSL/TLS Verification

### 2.1 Cloudflare SSL Settings

- [ ] Dashboard → SSL/TLS → Overview → Set mode to **Full (strict)**
- [ ] Dashboard → SSL/TLS → Edge Certificates → Verify Universal SSL is active
- [ ] Dashboard → SSL/TLS → Edge Certificates → Enable **Always Use HTTPS**
- [ ] Dashboard → SSL/TLS → Edge Certificates → Set Minimum TLS Version to **1.2**

### 2.2 Verify SSL on All Subdomains

After DNS propagation (5-15 minutes), verify SSL is active:

```bash
# Quick check all subdomains
for sub in dashboard scanner api ws cdn; do
  echo -n "${sub}.yourdomain.com: "
  curl -sI "https://${sub}.yourdomain.com" | head -1
done
```

- [ ] `dashboard.yourdomain.com` — SSL active
- [ ] `scanner.yourdomain.com` — SSL active
- [ ] `api.yourdomain.com` — SSL active
- [ ] `ws.yourdomain.com` — SSL active
- [ ] `cdn.yourdomain.com` — SSL active

---

## Phase 3: R2 Storage Configuration

### 3.1 Configure R2 Custom Domain

- [ ] Cloudflare Dashboard → R2 → `wedding-ecosystem` bucket → Settings → Custom Domains
- [ ] Add custom domain: `cdn.yourdomain.com`
- [ ] Wait for SSL certificate to be issued (usually < 5 minutes)

### 3.2 Update R2 CORS Rules

Configure CORS to allow uploads from Dashboard and downloads from all apps:

**Upload rule:**

- Allowed Origins: `https://dashboard.yourdomain.com`
- Allowed Methods: `PUT`, `POST`
- Allowed Headers: `Content-Type`, `Content-Length`, `x-amz-content-sha256`, `x-amz-date`, `Authorization`
- Max Age: 3600

**Download rule:**

- Allowed Origins: `https://cdn.yourdomain.com`, `https://dashboard.yourdomain.com`, `https://scanner.yourdomain.com`, `https://*.yourdomain.com`
- Allowed Methods: `GET`, `HEAD`
- Allowed Headers: `*`
- Expose Headers: `Content-Length`, `Content-Type`, `ETag`
- Max Age: 86400

You can apply these via the automated script:

```bash
export PRODUCTION_DOMAIN="yourdomain.com"
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ZONE_ID="your-zone-id"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
./scripts/setup-production-domain.sh
```

---

## Phase 4: CDN & Performance Configuration

### 4.1 Apply CDN Cache Rules

Run the CDN cache configuration script:

```bash
export PRODUCTION_DOMAIN="yourdomain.com"
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ZONE_ID="your-zone-id"
./scripts/configure-cdn-cache.sh
```

Or configure manually in Cloudflare Dashboard → Rules → Cache Rules:

- [ ] **Rule 1**: Immutable assets (`/_next/static/*` and hashed filenames) → Cache 1 year
- [ ] **Rule 2**: HTML/dynamic content (non-API, non-WS) → Cache 60 seconds
- [ ] **Rule 3**: API responses (`api.yourdomain.com`) → Bypass cache
- [ ] **Rule 4**: WebSocket (`ws.yourdomain.com`) → Bypass cache

### 4.2 Enable Brotli Compression

- [ ] Dashboard → Speed → Optimization → Content Optimization → Enable **Brotli**

### 4.3 Enable Smart Tiered Cache

- [ ] Dashboard → Caching → Tiered Cache → Enable **Smart Tiered Cache Topology**

### 4.4 Configure Cloudflare Worker Routes

Deploy workers first (if not already deployed):

```bash
cd docs/deployment/cloudflare/workers
npx wrangler deploy --config wrangler-cdn-cache.toml
npx wrangler deploy --config wrangler-image-resizer.toml
```

Then configure routes:

- [ ] Dashboard → Workers Routes → Add route: `*.yourdomain.com/*` → `wedding-cdn-cache`
- [ ] Dashboard → Workers Routes → Add route: `cdn.yourdomain.com/media/*` → `image-resizer`

---

## Phase 5: Backend Environment Variables

### 5.1 Update Railway Environment Variables

In Railway Dashboard, update the following for the API service:

- [ ] `PRODUCTION_DOMAIN=yourdomain.com`
- [ ] `R2_PUBLIC_URL=https://cdn.yourdomain.com`
- [ ] `CORS_ADDITIONAL_ORIGINS=` (leave empty unless needed for preview deployments)

### 5.2 Update Local `.env` File

Update your local `.env` file (for reference/local development):

```env
PRODUCTION_DOMAIN=yourdomain.com
R2_PUBLIC_URL=https://cdn.yourdomain.com
```

---

## Phase 6: Frontend Environment Variables

### 6.1 Update Vercel Environment Variables

For **each** frontend project (Dashboard, Invitation, Scanner):

- [ ] Project Settings → Environment Variables → Production
- [ ] Set `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`
- [ ] Set `NEXT_PUBLIC_WS_URL=wss://ws.yourdomain.com`
- [ ] Set `NEXT_PUBLIC_CDN_URL=https://cdn.yourdomain.com`
- [ ] Set `NEXT_PUBLIC_DASHBOARD_URL=https://dashboard.yourdomain.com`

Or use the automated script with Vercel token:

```bash
export VERCEL_TOKEN="your-vercel-token"
export VERCEL_PROJECT_DASHBOARD="prj_xxx"
export VERCEL_PROJECT_INVITATION="prj_xxx"
export VERCEL_PROJECT_SCANNER="prj_xxx"
export PRODUCTION_DOMAIN="yourdomain.com"
./scripts/setup-production-domain.sh
```

---

## Phase 7: CORS Plugin Verification

The CORS plugin (`packages/api/src/plugins/cors.ts`) automatically derives allowed origins from the `PRODUCTION_DOMAIN` environment variable. No code changes are needed — just ensure the env var is set correctly on Railway.

The plugin allows:

- `https://dashboard.{PRODUCTION_DOMAIN}` — Dashboard app
- `https://scanner.{PRODUCTION_DOMAIN}` — Scanner PWA
- `https://cdn.{PRODUCTION_DOMAIN}` — CDN media
- `https://*.{PRODUCTION_DOMAIN}` — Invitation app (event-slug subdomains)

- [ ] Verify `PRODUCTION_DOMAIN` is set in Railway environment
- [ ] Redeploy backend to pick up the new environment variable

---

## Phase 8: Redeploy & Smoke Test

### 8.1 Redeploy Services

- [ ] Trigger Railway redeploy for API service (picks up new env vars)
- [ ] Trigger Railway redeploy for WebSocket service
- [ ] Trigger Vercel redeploy for Dashboard (picks up new env vars)
- [ ] Trigger Vercel redeploy for Invitation
- [ ] Trigger Vercel redeploy for Scanner

### 8.2 Run Smoke Tests

```bash
# Verify API health
curl -s https://api.yourdomain.com/health | jq .

# Verify CDN serves assets
curl -sI https://cdn.yourdomain.com/ | grep -i "cf-cache-status"

# Verify Dashboard loads
curl -sI https://dashboard.yourdomain.com | head -5

# Verify WebSocket endpoint
curl -sI https://ws.yourdomain.com/socket.io/ | head -5
```

- [ ] API health check returns `200 OK` with all dependencies healthy
- [ ] CDN returns proper cache headers
- [ ] Dashboard loads without errors
- [ ] Scanner loads without errors
- [ ] WebSocket endpoint responds

### 8.3 Run GitHub Actions Smoke Test

- [ ] Trigger `.github/workflows/smoke-test.yml` workflow manually
- [ ] Verify all checks pass

---

## Phase 9: Post-Go-Live

### 9.1 Increase DNS TTL

After confirming everything works (24-48 hours):

- [ ] Increase DNS TTL from 300s to 3600s for all records

### 9.2 Monitor

- [ ] Check Cloudflare Analytics for traffic patterns
- [ ] Verify cache hit ratio is healthy (> 80% for static assets)
- [ ] Monitor API error rates in observability dashboard
- [ ] Verify alerts are firing correctly (send test alert)

---

## Automated Setup Script

For a mostly-automated setup, use the production domain setup script:

```bash
export PRODUCTION_DOMAIN="yourdomain.com"
export CLOUDFLARE_API_TOKEN="your-api-token"
export CLOUDFLARE_ZONE_ID="your-zone-id"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export R2_BUCKET_NAME="wedding-ecosystem"

# Optional: for Vercel env var automation
export VERCEL_TOKEN="your-vercel-token"
export VERCEL_PROJECT_DASHBOARD="prj_xxx"
export VERCEL_PROJECT_INVITATION="prj_xxx"
export VERCEL_PROJECT_SCANNER="prj_xxx"

./scripts/setup-production-domain.sh
```

This script handles steps 3.1, 3.2, 4.1-4.4, 6.1, and SSL verification automatically.

---

## Troubleshooting

### SSL Not Active

- Cloudflare Universal SSL typically activates within 15 minutes
- Ensure the domain's nameservers are pointed to Cloudflare
- Check Dashboard → SSL/TLS → Edge Certificates for certificate status

### CORS Errors

- Verify `PRODUCTION_DOMAIN` env var is set correctly on Railway
- Check browser console for the exact origin being blocked
- Add preview/staging URLs to `CORS_ADDITIONAL_ORIGINS` if needed

### CDN Not Caching

- Check `cf-cache-status` header in responses (should be `HIT` after first request)
- Verify cache rules are applied: Dashboard → Rules → Cache Rules
- Ensure assets have proper `Cache-Control` headers from origin

### R2 Custom Domain Not Working

- Verify DNS CNAME record for `cdn.yourdomain.com` exists
- Check R2 bucket → Settings → Custom Domains for status
- SSL certificate for custom domain may take up to 15 minutes
