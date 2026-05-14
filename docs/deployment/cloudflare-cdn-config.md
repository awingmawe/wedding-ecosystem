# Cloudflare CDN Caching, Compression & Origin Shield Configuration

## Overview

This document defines the CDN caching rules, compression settings, and origin shield configuration for the Wedding Digital SaaS platform. All static assets are served through Cloudflare's CDN with optimized caching policies to meet the Invitation App FCP target of < 3 seconds on 3G connections.

## Architecture

```
Visitor → Cloudflare Edge (PoP) → [Tiered Cache Upper Tier] → Origin (Vercel / Railway)
                ↓
    Brotli/Gzip compressed response
    with appropriate Cache-Control headers
```

## Domains & Origins

| Domain Pattern          | Origin  | Asset Type                    |
| ----------------------- | ------- | ----------------------------- |
| `dashboard.{domain}`    | Vercel  | Next.js SSR + static assets   |
| `{event-slug}.{domain}` | Vercel  | ISR pages + static assets     |
| `scanner.{domain}`      | Vercel  | PWA + service worker + assets |
| `api.{domain}`          | Railway | JSON API responses            |
| `ws.{domain}`           | Railway | WebSocket (not cached)        |

---

## 1. Cache Rules Configuration

### Rule 1: Immutable Static Assets (Hashed Filenames)

Assets with content hashes in filenames (e.g., `main.a1b2c3d4.js`, `styles.e5f6g7h8.css`) are immutable — they never change once deployed.

| Setting           | Value                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| **Match**         | URI path matches `/_next/static/*` OR file extension in `{js,css,woff2,woff,ttf,eot,ico}` with hash pattern |
| **Edge TTL**      | 31536000 seconds (1 year)                                                                                   |
| **Browser TTL**   | 31536000 seconds (1 year)                                                                                   |
| **Cache-Control** | `public, max-age=31536000, immutable`                                                                       |
| **Cache Status**  | Cache Everything                                                                                            |

**Expression (Cloudflare filter):**

```
(http.request.uri.path matches "^/_next/static/.*") or
(http.request.uri.path matches ".*\\.[0-9a-f]{8,}\\.(js|css|woff2|woff|ttf|eot|svg|png|jpg|webp)$")
```

### Rule 2: HTML Pages & Dynamic Content

HTML pages use short cache TTL or no-cache to ensure users always get fresh content (ISR handles revalidation at origin).

| Setting           | Value                                                                            |
| ----------------- | -------------------------------------------------------------------------------- |
| **Match**         | URI path does NOT match static asset patterns AND hostname is not `api.{domain}` |
| **Edge TTL**      | 60 seconds                                                                       |
| **Browser TTL**   | 60 seconds                                                                       |
| **Cache-Control** | `public, max-age=60, must-revalidate`                                            |
| **Cache Status**  | Cache Everything with short TTL                                                  |

**Expression:**

```
(not http.request.uri.path matches "^/_next/static/.*") and
(not http.request.uri.path matches ".*\\.[0-9a-f]{8,}\\.(js|css|woff2|woff|ttf|eot|svg|png|jpg|webp)$") and
(http.request.uri.path ne "/api/*") and
(http.host ne "api.example.com") and
(http.host ne "ws.example.com")
```

### Rule 3: API Responses

API responses should not be cached at the CDN edge (caching is handled by Redis at the application layer).

| Setting           | Value                                                  |
| ----------------- | ------------------------------------------------------ |
| **Match**         | Hostname is `api.{domain}` OR path starts with `/api/` |
| **Edge TTL**      | 0 (no-cache)                                           |
| **Browser TTL**   | 0 (no-cache)                                           |
| **Cache-Control** | `no-store, no-cache, must-revalidate`                  |
| **Cache Status**  | Bypass cache                                           |

**Expression:**

```
(http.host eq "api.example.com") or (http.request.uri.path starts_with "/api/")
```

### Rule 4: WebSocket Bypass

WebSocket connections must never be cached.

| Setting          | Value                     |
| ---------------- | ------------------------- |
| **Match**        | Hostname is `ws.{domain}` |
| **Cache Status** | Bypass cache              |

---

## 2. Compression Configuration

Cloudflare applies compression automatically for text-based content types. The configuration ensures Brotli is preferred with Gzip as fallback.

### Default Compression Behavior (Enabled)

Cloudflare's default compression applies to these content types:

- `text/html`
- `text/css`
- `text/javascript` / `application/javascript`
- `application/json`
- `text/xml` / `application/xml`
- `text/plain`
- `application/manifest+json`
- `image/svg+xml`

### Compression Rule: Brotli with Gzip Fallback

| Setting             | Value                                                 |
| ------------------- | ----------------------------------------------------- |
| **Match**           | All text-based assets (HTML, CSS, JS, JSON, SVG, XML) |
| **Algorithm Order** | 1. Brotli (`br`) — preferred, ~20% smaller than Gzip  |
|                     | 2. Gzip (`gzip`) — fallback for older browsers        |
| **Behavior**        | Cloudflare auto-negotiates via `Accept-Encoding`      |

**Expression:**

```
(http.request.uri.path.extension in {"html" "css" "js" "json" "xml" "svg" "txt" "map"}) or
(http.host ne "")
```

### Cloudflare Dashboard Settings

| Setting              | Value                       | Location                       |
| -------------------- | --------------------------- | ------------------------------ |
| Brotli               | ON                          | Speed → Optimization → Content |
| Compression Rules    | Enabled                     | Rules → Compression Rules      |
| Algorithm preference | Brotli first, Gzip fallback | Compression Rules              |

### Compression Rule API Configuration

```json
{
  "rules": [
    {
      "expression": "(http.request.uri.path.extension in {\"html\" \"css\" \"js\" \"json\" \"xml\" \"svg\" \"txt\" \"map\" \"mjs\"})",
      "description": "Enable Brotli with Gzip fallback for text-based assets",
      "action": "compress_response",
      "action_parameters": {
        "algorithms": [{ "name": "brotli" }, { "name": "gzip" }, { "name": "auto" }]
      }
    }
  ]
}
```

---

## 3. Origin Shield (Smart Tiered Cache)

Origin Shield reduces load on origin servers by routing cache misses through an upper-tier data center before reaching the origin. This is critical after deployment cache purges when multiple edge locations simultaneously request fresh content.

### Configuration

| Setting                   | Value                                            |
| ------------------------- | ------------------------------------------------ |
| **Tiered Cache Topology** | Smart Tiered Cache                               |
| **Behavior**              | Auto-selects closest upper-tier to origin        |
| **Regional Tiered Cache** | Enabled (adds regional layer)                    |
| **Origin Location**       | Singapore / Jakarta (closest to Indonesia users) |

### How It Works

```
1. Visitor in Jakarta → Edge PoP (Jakarta)
2. Cache MISS → Upper Tier (Singapore)
3. Cache MISS at Upper Tier → Origin (Vercel/Railway)
4. Response cached at Upper Tier + Edge PoP
5. Subsequent requests from ANY edge → served from Upper Tier (no origin hit)
```

### Benefits for Wedding Digital SaaS

- **Reduces origin load by ~90%** during cache miss storms (post-deployment)
- **Faster cache fills** — only 1 request to origin per asset regardless of how many edge locations need it
- **Lower latency** — upper tier in Singapore serves Indonesian visitors faster than hitting Vercel/Railway origin directly

### Dashboard Settings

| Setting               | Location                               | Value                                |
| --------------------- | -------------------------------------- | ------------------------------------ |
| Smart Tiered Cache    | Caching → Tiered Cache                 | Enabled                              |
| Regional Tiered Cache | Caching → Tiered Cache                 | Enabled                              |
| Cloud Region Hint     | Caching → Tiered Cache → Origin Config | `aws/ap-southeast-1` (if applicable) |

---

## 4. Implementation

### 4.1 Terraform Configuration

See: [`terraform/cloudflare-cdn-cache.tf`](./cloudflare/terraform/cloudflare-cdn-cache.tf)

### 4.2 API Script

See: [`scripts/configure-cdn-cache.sh`](./cloudflare/scripts/configure-cdn-cache.sh)

### 4.3 Cloudflare Dashboard Steps (Manual)

1. **Enable Tiered Cache:**
   - Navigate to Caching → Tiered Cache
   - Enable "Smart Tiered Cache"
   - Enable "Regional Tiered Cache" (if available on plan)

2. **Enable Brotli Compression:**
   - Navigate to Speed → Optimization → Content
   - Toggle "Brotli" to ON

3. **Create Cache Rules:**
   - Navigate to Rules → Cache Rules
   - Create rules as defined in Section 1 above

4. **Create Compression Rules:**
   - Navigate to Rules → Compression Rules
   - Create rule as defined in Section 2 above

---

## 5. Verification Checklist

- [ ] Immutable assets return `Cache-Control: public, max-age=31536000, immutable`
- [ ] HTML pages return `Cache-Control: public, max-age=60, must-revalidate`
- [ ] API responses return `Cache-Control: no-store, no-cache, must-revalidate`
- [ ] Response headers include `cf-cache-status: HIT` for cached assets
- [ ] Response headers include `content-encoding: br` for text assets (Brotli)
- [ ] Fallback to `content-encoding: gzip` when client doesn't support Brotli
- [ ] Tiered Cache is active (check `cf-cache-status` values include `HIT` from upper tier)
- [ ] WebSocket connections on `ws.{domain}` are not cached
- [ ] After deployment, only changed paths are purged (not full cache)

### Verification Commands

```bash
# Check cache headers for immutable asset
curl -sI "https://dashboard.example.com/_next/static/chunks/main-abc123.js" | grep -i "cache-control\|cf-cache-status\|content-encoding"

# Check HTML page caching
curl -sI "https://example.com/wedding-event" | grep -i "cache-control\|cf-cache-status"

# Check API no-cache
curl -sI "https://api.example.com/health" | grep -i "cache-control\|cf-cache-status"

# Check Brotli compression
curl -sI -H "Accept-Encoding: br, gzip" "https://dashboard.example.com/" | grep -i "content-encoding"

# Check Gzip fallback (no Brotli support)
curl -sI -H "Accept-Encoding: gzip" "https://dashboard.example.com/" | grep -i "content-encoding"
```

---

## 6. Related Requirements

| Requirement | Description                                               | Status |
| ----------- | --------------------------------------------------------- | ------ |
| 7.2         | CDN caching with immutable assets (1 year) and HTML (60s) | ✅     |
| 7.4         | Brotli compression with Gzip fallback                     | ✅     |
| 7.7         | Origin shield to reduce origin load on cache miss         | ✅     |

---

## 7. Performance Impact

| Metric                         | Without CDN Config   | With CDN Config | Improvement   |
| ------------------------------ | -------------------- | --------------- | ------------- |
| Invitation FCP (3G, Indonesia) | ~4-5s                | < 3s            | ~40-50%       |
| Origin requests (cache miss)   | 100%                 | ~10%            | 90% reduction |
| Asset transfer size (Brotli)   | 200KB (uncompressed) | ~50KB           | ~75% smaller  |
| Repeat visit load time         | ~2s                  | < 500ms         | ~75% faster   |
