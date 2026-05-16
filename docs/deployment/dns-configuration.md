# DNS Configuration

Production DNS setup for the Wedding Digital SaaS platform using Cloudflare as DNS provider and CDN.

## Overview

All production subdomains are configured as CNAME records proxied through Cloudflare, enabling CDN caching, WAF protection, and DDoS mitigation on every request. DNSSEC is enabled to prevent DNS spoofing attacks.

## DNS Records

| Subdomain            | Type  | Target                 | Purpose                                                  |
| -------------------- | ----- | ---------------------- | -------------------------------------------------------- |
| `dashboard.{domain}` | CNAME | `cname.vercel-dns.com` | Dashboard App (Next.js, responsive)                      |
| `scanner.{domain}`   | CNAME | `cname.vercel-dns.com` | Scanner PWA (Next.js)                                    |
| `*.{domain}`         | CNAME | `cname.vercel-dns.com` | Invitation App — dynamic `{event-slug}.{domain}` routing |
| `api.{domain}`       | CNAME | Railway API hostname   | Fastify API server                                       |
| `ws.{domain}`        | CNAME | Railway WS hostname    | WebSocket (Socket.io) server                             |

All records are:

- **Proxied** through Cloudflare (orange cloud) for CDN, WAF, and DDoS protection
- **TTL 300 seconds** initially for go-live flexibility (increase to 3600s after stable)

## Invitation App Dynamic Routing

The Invitation App uses event slugs as subdomains: `{event-slug}.{domain}` (e.g., `andi-sarah.weddingdigital.id`).

This is handled by a **wildcard CNAME record** (`*.{domain}`) pointing to Vercel. Vercel's routing layer then resolves the event slug and serves the correct invitation page.

**Important**: The wildcard record catches all subdomains not explicitly defined. Since `dashboard`, `scanner`, `api`, and `ws` have explicit records, they take priority over the wildcard. Any other subdomain (e.g., `andi-sarah.{domain}`) routes to the Invitation App on Vercel.

### Vercel Configuration

For wildcard subdomains to work on Vercel:

1. Add `*.{domain}` as a custom domain in the Invitation App project settings
2. Vercel will issue a wildcard SSL certificate automatically
3. The Next.js app reads the subdomain from the `Host` header to determine the event slug

## DNSSEC

DNSSEC (Domain Name System Security Extensions) is enabled to prevent DNS spoofing and cache poisoning attacks.

### Setup Steps

1. Enable DNSSEC in Cloudflare (done via Terraform or script)
2. Cloudflare generates a DS (Delegation Signer) record
3. Add the DS record at your domain registrar
4. Wait for propagation (can take up to 24 hours)

### Verification

```bash
# Check DNSSEC status
dig +dnssec {domain} @1.1.1.1

# Verify DS record
dig DS {domain} +short
```

## TTL Strategy

| Phase   | TTL            | Duration       | Rationale                                     |
| ------- | -------------- | -------------- | --------------------------------------------- |
| Go-live | 300s (5 min)   | First 48 hours | Quick DNS changes if issues arise             |
| Stable  | 3600s (1 hour) | Ongoing        | Reduce DNS query load, improve cache hit rate |

To update TTL after stabilization, modify the `dns_ttl` variable in Terraform or run:

```bash
# Update all records to stable TTL
export DNS_TTL=3600
./docs/deployment/cloudflare/scripts/update-dns-ttl.sh
```

## Configuration Methods

### Option 1: Terraform (Recommended for IaC)

```bash
cd docs/deployment/cloudflare/terraform

# Initialize Terraform
terraform init

# Review planned changes
terraform plan -var-file="../terraform.tfvars"

# Apply DNS configuration
terraform apply -var-file="../terraform.tfvars"
```

Required variables in `terraform.tfvars`:

```hcl
cloudflare_api_token = "your-api-token"
cloudflare_zone_id   = "your-zone-id"
domain               = "weddingdigital.id"
vercel_cname_target  = "cname.vercel-dns.com"
railway_api_target   = "your-api-service.up.railway.app"
railway_ws_target    = "your-ws-service.up.railway.app"
dns_ttl              = 300
```

### Option 2: Shell Script (Quick Setup)

```bash
export CLOUDFLARE_API_TOKEN="your-api-token"
export CLOUDFLARE_ZONE_ID="your-zone-id"
export DOMAIN="weddingdigital.id"
export VERCEL_CNAME_TARGET="cname.vercel-dns.com"
export RAILWAY_API_TARGET="your-api-service.up.railway.app"
export RAILWAY_WS_TARGET="your-ws-service.up.railway.app"

./docs/deployment/cloudflare/scripts/configure-dns.sh
```

### Verification

```bash
# Verify via Cloudflare API
./docs/deployment/cloudflare/scripts/verify-dns.sh

# Verify DNS propagation externally
dig dashboard.{domain} +short
dig scanner.{domain} +short
dig api.{domain} +short
dig ws.{domain} +short
```

## Cloudflare API Token Permissions

The API token used for DNS management needs:

- **Zone:DNS:Edit** — Create and modify DNS records
- **Zone:DNSSEC:Edit** — Enable and configure DNSSEC
- **Zone:Zone:Read** — Read zone details

## Architecture Diagram

```
                    Internet
                       │
                       ▼
              ┌─────────────────┐
              │   Cloudflare    │
              │  (DNS + CDN +   │
              │   WAF + DDoS)   │
              │                 │
              │  DNSSEC Active  │
              └────────┬────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
   ┌───────────┐ ┌───────────┐ ┌───────────┐
   │  Vercel   │ │  Railway  │ │  Railway  │
   │           │ │  (API)    │ │  (WS)     │
   │ dashboard │ │           │ │           │
   │ scanner   │ │ api.{d}   │ │ ws.{d}    │
   │ *.{d}     │ │           │ │           │
   └───────────┘ └───────────┘ └───────────┘
```

## Troubleshooting

### DNS not resolving

1. Check Cloudflare Dashboard → DNS → verify records exist
2. Ensure records are proxied (orange cloud icon)
3. Wait 5 minutes for propagation (TTL is 300s)
4. Use `dig` or https://dnschecker.org to check external resolution

### DNSSEC validation failing

1. Verify DS record is correctly added at domain registrar
2. Check DNSSEC status in Cloudflare Dashboard → DNS → DNSSEC
3. Allow up to 24 hours for full propagation

### Wildcard subdomain not working

1. Verify `*.{domain}` record exists in Cloudflare
2. Ensure Vercel project has `*.{domain}` configured as custom domain
3. Check that Vercel issued a wildcard SSL certificate

### Conflict between wildcard and explicit records

Explicit records (dashboard, scanner, api, ws) always take priority over the wildcard. If a new subdomain is needed that should NOT route to the Invitation App, add an explicit record for it.

## Related Documentation

- [SSL/TLS Configuration](./cloudflare/ssl-tls-configuration.md)
- [WAF & DDoS Protection](./cloudflare/WAF-DDOS-CONFIGURATION.md)
- [CDN Cache Configuration](./cloudflare/CDN-CACHE-CONFIGURATION.md)
- [Environment Variables](./environment-variables.md)
