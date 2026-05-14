# Cloudflare Deployment Configuration

Infrastructure configuration for Cloudflare services used by the Wedding Digital SaaS platform.

## Directory Structure

```
cloudflare/
├── README.md                          # This file
├── CDN-CACHE-CONFIGURATION.md         # CDN caching, compression & origin shield documentation
├── DNS-CONFIGURATION.md               # DNS records, DNSSEC, and TTL strategy documentation
├── R2-STORAGE-CONFIGURATION.md        # R2 bucket setup, CORS, versioning, access control
├── R2-LIFECYCLE-CONFIGURATION.md      # R2 lifecycle policy (Infrequent Access transition)
├── WAF-DDOS-CONFIGURATION.md          # WAF and DDoS protection documentation
├── WEBSOCKET-CONFIGURATION.md         # WebSocket subdomain & sticky session documentation
├── ssl-tls-configuration.md           # SSL/TLS documentation and settings reference
├── ssl-tls-settings.json              # Machine-readable SSL/TLS configuration
├── cdn-cache-settings.json            # Machine-readable CDN cache/compression config
├── dns-settings.json                  # Machine-readable DNS records configuration
├── r2-storage-settings.json           # Machine-readable R2 storage configuration
├── websocket-settings.json            # Machine-readable WebSocket configuration
├── railway-origin-ssl.md              # Origin-side SSL setup on Railway
├── terraform/
│   ├── cloudflare-ssl-tls.tf          # Terraform IaC for SSL/TLS settings
│   ├── cloudflare-cdn-cache.tf        # Terraform IaC for CDN cache, compression, origin shield
│   ├── cloudflare-image-optimization.tf # Terraform IaC for image optimization
│   ├── cloudflare-r2-storage.tf       # Terraform IaC for R2 bucket, CORS, versioning, CDN
│   ├── cloudflare-r2-lifecycle.tf     # Terraform IaC for R2 lifecycle rules
│   ├── cloudflare-dns.tf             # Terraform IaC for DNS records and DNSSEC
│   └── cloudflare-websocket.tf        # Terraform IaC for WebSocket subdomain & sticky sessions
├── scripts/
│   ├── configure-ssl-tls.sh           # Apply SSL/TLS settings via Cloudflare API
│   ├── verify-ssl-tls.sh             # Verify SSL/TLS configuration is correct
│   ├── configure-cdn-cache.sh         # Apply CDN cache/compression/tiered cache via API
│   ├── verify-cdn-cache.sh           # Verify CDN configuration is correct
│   ├── configure-r2-storage.sh        # Create R2 bucket with CORS, versioning, CDN domain
│   ├── verify-r2-storage.sh          # Verify R2 storage configuration is correct
│   ├── configure-r2-lifecycle.sh      # Apply R2 lifecycle rules via S3-compatible API
│   ├── configure-dns.sh              # Create/update DNS records for all subdomains
│   ├── verify-dns.sh                 # Verify DNS records and DNSSEC configuration
│   ├── update-dns-ttl.sh             # Update TTL (go-live 300s → stable 3600s)
│   └── configure-websocket.sh         # Configure WebSocket DNS + sticky sessions via API
└── workers/
    ├── cdn-cache-worker.ts            # Cloudflare Worker for edge cache control headers
    ├── image-resizer.ts               # Cloudflare Worker for image optimization
    ├── security-headers-worker.ts     # Cloudflare Worker for security headers
    ├── wrangler.toml                  # Worker deployment configuration (security headers)
    ├── wrangler-cdn-cache.toml        # Worker deployment configuration (CDN cache)
    └── wrangler-image-resizer.toml    # Worker deployment configuration (image resizer)
```

## Quick Start

### Apply CDN Cache, Compression & Origin Shield

```bash
# Option 1: Via Cloudflare API script
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ZONE_ID="your-zone-id"
export DOMAIN="example.com"
./scripts/configure-cdn-cache.sh

# Option 2: Via Terraform
cd terraform/
terraform init
terraform plan -var="cloudflare_api_token=..." -var="cloudflare_zone_id=..." -var="domain=example.com"
terraform apply
```

### Verify CDN Configuration

```bash
export DOMAIN="example.com"
./scripts/verify-cdn-cache.sh
```

### Create R2 Storage Bucket

```bash
# Option 1: Via Cloudflare API script
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export DOMAIN="example.com"
./scripts/configure-r2-storage.sh

# Option 2: Via Terraform
cd terraform/
terraform init
terraform plan \
  -var="cloudflare_api_token=..." \
  -var="cloudflare_account_id=..." \
  -var="cloudflare_zone_id=..." \
  -var="domain=example.com"
terraform apply
```

### Verify R2 Storage Configuration

```bash
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export DOMAIN="example.com"
./scripts/verify-r2-storage.sh
```

### Apply R2 Lifecycle Policy

```bash
# Option 1: Via S3-compatible API script
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export R2_ACCESS_KEY_ID="your-r2-access-key"
export R2_SECRET_ACCESS_KEY="your-r2-secret-key"
./scripts/configure-r2-lifecycle.sh

# Option 2: Via Terraform
cd terraform/
terraform init
terraform plan -var="cloudflare_account_id=..." -var="r2_access_key_id=..." -var="r2_secret_access_key=..."
terraform apply

# Option 3: Via Wrangler CLI
npx wrangler r2 bucket lifecycle add wedding-digital-media-production \
  "transition-to-infrequent-access-90d" --ia-transition-days 90
```

### Apply SSL/TLS Configuration

```bash
# Option 1: Via Cloudflare API script
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ZONE_ID="your-zone-id"
./scripts/configure-ssl-tls.sh

# Option 2: Via Terraform
cd terraform/
terraform init
terraform plan -var="cloudflare_api_token=..." -var="cloudflare_zone_id=..." -var="domain=example.com"
terraform apply
```

### Configure DNS Records & DNSSEC

```bash
# Option 1: Via Cloudflare API script
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ZONE_ID="your-zone-id"
export DOMAIN="example.com"
export VERCEL_CNAME_TARGET="cname.vercel-dns.com"
export RAILWAY_API_TARGET="your-api-service.up.railway.app"
export RAILWAY_WS_TARGET="your-ws-service.up.railway.app"
./scripts/configure-dns.sh

# Option 2: Via Terraform
cd terraform/
terraform init
terraform plan -var-file="../terraform.tfvars"
terraform apply -var-file="../terraform.tfvars"
```

### Verify DNS Configuration

```bash
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ZONE_ID="your-zone-id"
export DOMAIN="example.com"
./scripts/verify-dns.sh
```

### Configure WebSocket Subdomain with Sticky Sessions

```bash
# Option 1: Via Cloudflare API script
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ZONE_ID="your-zone-id"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export DOMAIN="example.com"
export WEBSOCKET_ORIGIN="websocket-production.up.railway.app"
./scripts/configure-websocket.sh

# Option 2: Via Terraform
cd terraform/
terraform init
terraform plan \
  -var="cloudflare_api_token=..." \
  -var="cloudflare_zone_id=..." \
  -var="domain=example.com" \
  -var="websocket_origin=websocket-production.up.railway.app"
terraform apply
```

### Verify Configuration

```bash
export DOMAIN="example.com"
./scripts/verify-ssl-tls.sh
```

## Configuration Summary

| Setting                | Value                             | Requirement |
| ---------------------- | --------------------------------- | ----------- |
| SSL/TLS Mode           | Full (Strict)                     | 2.4         |
| Minimum TLS Version    | 1.2                               | 2.1         |
| TLS 1.3                | Enabled (preferred)               | 2.1         |
| HTTPS Redirect         | HTTP 301 → HTTPS                  | 2.2         |
| HSTS max-age           | 31536000 (1 year)                 | 2.3         |
| HSTS includeSubDomains | Yes                               | 2.3         |
| Origin Certificate     | Cloudflare Origin CA              | 2.4, 2.7    |
| Auto-Renewal           | Cloudflare managed                | 2.7         |
| Immutable Asset Cache  | max-age=31536000, immutable       | 7.2         |
| HTML/Dynamic Cache     | max-age=60                        | 7.2         |
| API Cache              | no-cache (bypass)                 | 7.2         |
| Compression            | Brotli + Gzip fallback            | 7.4         |
| Origin Shield          | Smart Tiered Cache                | 7.7         |
| R2 Bucket              | wedding-digital-media-production  | 8.1         |
| R2 Encryption          | SSE (Cloudflare-managed)          | 8.2         |
| R2 Public Access       | Blocked (CDN-only)                | 8.3         |
| R2 Versioning          | Enabled                           | 8.7         |
| R2 CORS Upload         | dashboard.{domain}                | 8.5         |
| R2 CORS Download       | cdn.{domain}, \*.{domain}         | 8.5         |
| R2 Lifecycle (IA)      | Transition after 90 days          | 8.4         |
| R2 Multipart Cleanup   | Abort after 7 days                | 8.4         |
| WebSocket Subdomain    | ws.{domain} (CNAME, proxied)      | 11.4        |
| WebSocket Support      | Enabled on zone                   | 11.4        |
| Session Affinity       | Cookie-based (sticky sessions)    | 11.4, 13.2  |
| WS Ping Interval       | 25 seconds                        | 13.3        |
| WS Idle Timeout        | 60 seconds                        | 13.3        |
| WS Health Check        | GET /health, 10s interval         | 11.5        |
| DNS Records            | dashboard, scanner, \*, api, ws   | 11.1        |
| DNS TTL (go-live)      | 300 seconds                       | 11.2        |
| DNS TTL (stable)       | 3600 seconds                      | 11.2        |
| DNSSEC                 | Enabled                           | 11.7        |
| Wildcard Routing       | \*.{domain} → Vercel (Invitation) | 11.1        |

## Domains Covered

- `dashboard.{domain}` — Dashboard App
- `{event-slug}.{domain}` — Invitation App (wildcard)
- `scanner.{domain}` — Scanner PWA
- `api.{domain}` — Fastify API
- `ws.{domain}` — WebSocket Server
- `cdn.{domain}` — R2 Media Storage (CDN access)
