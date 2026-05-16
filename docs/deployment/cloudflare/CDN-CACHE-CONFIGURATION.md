# Cloudflare CDN Caching, Compression & Origin Shield Configuration

## Overview

This document describes the CDN caching strategy for the Wedding Digital SaaS platform using Cloudflare. The configuration ensures optimal performance by caching immutable assets aggressively, applying short TTLs to dynamic content, and bypassing cache for API/WebSocket traffic.

**Requirements covered:**

- **7.2**: CDN caching — immutable assets (1 year), HTML/API (60s or no-cache)
- **7.4**: Brotli compression (primary) with Gzip fallback for text-based assets
- **7.7**: Origin Shield (Smart Tiered Cache) to reduce origin load on cache miss

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Browser                               │
│  Accept-Encoding: br, gzip                                          │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge (PoP)                              │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Cache Rules (http_request_cache_settings phase)              │    │
│  │  • Immutable assets → edge_ttl: 1 year, browser_ttl: 1 year│    │
│  │  • HTML/dynamic     → edge_ttl: 60s, browser_ttl: 60s      │    │
│  │  • API/WebSocket    → bypass cache                          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Compression Rules (http_response_compression phase)          │    │
│  │  • Brotli (preferred) → Gzip (fallback) → Auto             │    │
│  │  • Applies to: html, css, js, json, xml, svg, txt, map,    │    │
│  │    mjs, webmanifest                                         │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Cache Response Rules (http_response_cache_settings phase)    │    │
│  │  • Hashed assets → Cache-Control: immutable, max-age=1yr   │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ (cache MISS)
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Smart Tiered Cache (Origin Shield)                       │
│                                                                      │
│  Upper-tier data center selected automatically by Cloudflare.        │
│  Reduces origin load by serving cache misses from upper-tier         │
│  instead of hitting origin directly from every edge PoP.             │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ (upper-tier cache MISS)
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Origin Servers                                     │
│  • Vercel (Dashboard, Invitation, Scanner)                           │
│  • Railway (API, WebSocket)                                          │
└─────────────────────────────────────────────────────────────────────┘
```

## Caching Strategy

### 1. Immutable Assets (Hashed Filenames) — 1 Year Cache

**Pattern matching:**

- `/_next/static/*` — Next.js build output (chunks, CSS, media)
- `*.[8+ hex chars].(js|css|woff2|woff|ttf|eot|svg|png|jpg|webp)` — Content-hashed files

**Cache-Control header:**

```
Cache-Control: public, max-age=31536000, immutable
```

**Rationale:** Files with content hashes in their filenames are guaranteed to have unique URLs when content changes. They can be cached indefinitely without risk of serving stale content.

### 2. HTML/Dynamic Content — 60 Second Cache

**Applies to:** All non-hashed, non-API content (HTML pages, ISR pages)

**Cache-Control header:**

```
Cache-Control: public, max-age=60, stale-while-revalidate=300
```

**Rationale:** The Invitation App uses ISR with 60-second revalidation. Edge caching with 60s TTL ensures most requests are served from cache while keeping content fresh. The `stale-while-revalidate` allows serving slightly stale content while fetching fresh version in background.

### 3. API Responses — No Cache (Bypass)

**Pattern matching:**

- `api.{domain}/*` — API subdomain
- `*/api/*` — API path prefix

**Cache-Control header:**

```
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
```

**Rationale:** API responses contain dynamic, user-specific data. Application-level caching is handled by Redis. CDN should never cache API responses to prevent data leakage between users.

### 4. WebSocket — No Cache (Bypass)

**Pattern matching:**

- `ws.{domain}/*` — WebSocket subdomain

**Rationale:** WebSocket connections are persistent and stateful. CDN caching is not applicable.

## Compression Configuration

### Brotli (Primary) + Gzip (Fallback)

| Setting                        | Value                                                     |
| ------------------------------ | --------------------------------------------------------- |
| Zone-level Brotli              | Enabled (`on`)                                            |
| Compression algorithm priority | 1. Brotli, 2. Gzip, 3. Auto                               |
| Eligible file extensions       | html, css, js, json, xml, svg, txt, map, mjs, webmanifest |

**How it works:**

1. If client sends `Accept-Encoding: br` → Cloudflare responds with Brotli
2. If client sends `Accept-Encoding: gzip` (no br) → Cloudflare responds with Gzip
3. If client sends no encoding preference → Auto (Cloudflare decides)

**Expected compression ratios:**

- Brotli: ~15-25% smaller than Gzip for text assets
- Target: Invitation App JS+CSS ≤ 200KB gzipped (per design spec)

## Origin Shield (Smart Tiered Cache)

**Configuration:** Smart Tiered Cache enabled at zone level.

**How it works:**

1. Client request hits nearest Cloudflare edge PoP
2. On cache miss, request goes to upper-tier data center (not directly to origin)
3. Upper-tier checks its cache — if hit, serves without touching origin
4. Only on upper-tier miss does the request reach origin

**Benefits:**

- Reduces origin load during cache miss storms (e.g., after deployment cache purge)
- Improves cache hit ratio by consolidating requests through fewer upper-tier nodes
- Particularly useful for Indonesia-focused deployment (Singapore/Jakarta PoPs)

## MCP Integration Note

The Cloudflare Bindings MCP does **not** support direct configuration of:

- Cache Rules (zone rulesets)
- Compression Rules
- Tiered Cache / Origin Shield settings
- Zone-level settings (Brotli toggle)

These settings must be configured via:

1. **Terraform** (recommended for IaC): `terraform/cloudflare-cdn-cache.tf`
2. **Cloudflare API script**: `scripts/configure-cdn-cache.sh`
3. **Cloudflare Dashboard**: Manual configuration via UI

The Cloudflare Bindings MCP **was used** to:

- Verify account access and connectivity
- Search Cloudflare documentation for correct API patterns

## Configuration Files

| File                                | Purpose                                                 |
| ----------------------------------- | ------------------------------------------------------- |
| `cdn-cache-settings.json`           | Machine-readable CDN configuration (source of truth)    |
| `terraform/cloudflare-cdn-cache.tf` | Terraform IaC for all CDN cache settings                |
| `scripts/configure-cdn-cache.sh`    | Shell script to apply settings via Cloudflare API       |
| `scripts/verify-cdn-cache.sh`       | Shell script to verify configuration is correct         |
| `workers/cdn-cache-worker.ts`       | Optional Worker for edge-level cache header enforcement |
| `workers/wrangler-cdn-cache.toml`   | Wrangler config for the CDN cache worker                |

## Deployment Options

### Option 1: Terraform (Recommended)

```bash
cd docs/deployment/cloudflare/terraform/
terraform init
terraform plan \
  -var="cloudflare_api_token=$CLOUDFLARE_API_TOKEN" \
  -var="cloudflare_zone_id=$CLOUDFLARE_ZONE_ID" \
  -var="domain=example.com"
terraform apply
```

### Option 2: Cloudflare API Script

```bash
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ZONE_ID="your-zone-id"
export DOMAIN="example.com"
./scripts/configure-cdn-cache.sh
```

### Option 3: CDN Cache Worker (Supplementary)

```bash
cd docs/deployment/cloudflare/workers/
npx wrangler deploy --config wrangler-cdn-cache.toml
```

> **Note:** The Worker is optional and provides defense-in-depth. Zone-level cache rules (Terraform/API) are the primary mechanism.

## Verification

```bash
export DOMAIN="example.com"
export CLOUDFLARE_API_TOKEN="your-token"  # Optional, for API checks
export CLOUDFLARE_ZONE_ID="your-zone-id"  # Optional, for API checks
./scripts/verify-cdn-cache.sh
```

### Manual Verification

```bash
# Check Brotli compression
curl -sI -H "Accept-Encoding: br, gzip" https://dashboard.example.com/ | grep -i content-encoding
# Expected: content-encoding: br

# Check Gzip fallback
curl -sI -H "Accept-Encoding: gzip" https://dashboard.example.com/ | grep -i content-encoding
# Expected: content-encoding: gzip

# Check immutable asset headers
curl -sI https://dashboard.example.com/_next/static/chunks/main.js | grep -i cache-control
# Expected: cache-control: public, max-age=31536000, immutable

# Check API bypass
curl -sI https://api.example.com/health | grep -i cf-cache-status
# Expected: cf-cache-status: DYNAMIC or BYPASS
```

## Cache Invalidation Strategy

- **On deployment:** Path-specific purge for changed assets (not full purge)
- **Immutable assets:** Never need invalidation (new hash = new URL)
- **HTML pages:** Auto-expire after 60s TTL
- **Emergency:** Full zone purge available via Cloudflare API/Dashboard

```bash
# Path-specific purge example
curl -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"files":["https://dashboard.example.com/","https://example.com/event-slug"]}'
```
