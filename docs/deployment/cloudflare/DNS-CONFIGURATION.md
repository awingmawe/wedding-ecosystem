# DNS Configuration

## Requirements

| Requirement | Description                                                            | Status        |
| ----------- | ---------------------------------------------------------------------- | ------------- |
| 11.1        | DNS records for dashboard, scanner, api, ws, and wildcard (invitation) | ✅ Configured |
| 11.2        | TTL 300 seconds initially for go-live flexibility                      | ✅ Configured |
| 11.7        | DNSSEC enabled for DNS spoofing prevention                             | ✅ Configured |

## DNS Records

### Frontend Applications (Vercel)

| Record               | Type  | Target                 | TTL  | Proxied | Notes                                       |
| -------------------- | ----- | ---------------------- | ---- | ------- | ------------------------------------------- |
| `dashboard.{domain}` | CNAME | `cname.vercel-dns.com` | 300s | Yes     | Dashboard App                               |
| `scanner.{domain}`   | CNAME | `cname.vercel-dns.com` | 300s | Yes     | Scanner PWA                                 |
| `*.{domain}`         | CNAME | `cname.vercel-dns.com` | 300s | Yes     | Invitation App (dynamic event-slug routing) |

### Backend Services (Railway)

| Record         | Type  | Target               | TTL  | Proxied | Notes                        |
| -------------- | ----- | -------------------- | ---- | ------- | ---------------------------- |
| `api.{domain}` | CNAME | Railway API hostname | 300s | Yes     | Fastify API server           |
| `ws.{domain}`  | CNAME | Railway WS hostname  | 300s | Yes     | WebSocket (Socket.io) server |

## Wildcard Routing Strategy

The Invitation App uses event slugs as subdomains (`{event-slug}.{domain}`). A wildcard CNAME record (`*.{domain}`) routes all unmatched subdomains to Vercel, where the Next.js app resolves the event slug from the `Host` header.

**Priority order** (Cloudflare DNS resolution):

1. Explicit records (`dashboard`, `scanner`, `api`, `ws`) — matched first
2. Wildcard record (`*`) — catches everything else → Invitation App

This means any new subdomain (e.g., `andi-sarah.{domain}`) automatically routes to the Invitation App without additional DNS configuration.

## DNSSEC

DNSSEC prevents DNS spoofing and cache poisoning by cryptographically signing DNS responses.

### Activation Steps

1. **Enable in Cloudflare** — Done via Terraform or `configure-dns.sh` script
2. **Get DS record** — Cloudflare generates the DS (Delegation Signer) record
3. **Add DS at registrar** — Add the DS record at your domain registrar (e.g., Niagahoster, Namecheap)
4. **Wait for propagation** — Can take up to 24 hours

### Verification

```bash
# Check DNSSEC is active
dig +dnssec {domain} @1.1.1.1

# Verify DS record propagation
dig DS {domain} +short

# Online tool
# https://dnsviz.net/d/{domain}/dnssec/
```

## TTL Strategy

| Phase   | TTL   | When             | Rationale                                              |
| ------- | ----- | ---------------- | ------------------------------------------------------ |
| Go-live | 300s  | First 48 hours   | Quick DNS changes if issues arise during launch        |
| Stable  | 3600s | After 48h stable | Reduce DNS query load, improve resolver cache hit rate |

### Transitioning to Stable TTL

After 48 hours of stable operation:

```bash
export DNS_TTL=3600
./scripts/update-dns-ttl.sh
```

Or update Terraform variable:

```hcl
dns_ttl = 3600
```

## Cloudflare Proxy (Orange Cloud)

All records are proxied through Cloudflare, which provides:

- **CDN caching** — Static assets served from edge
- **WAF protection** — OWASP Top 10 attack blocking
- **DDoS mitigation** — Network and application layer protection
- **SSL/TLS** — Automatic certificate management
- **HTTP/2** — Multiplexing and header compression

**Note**: When proxied, the actual TTL is managed by Cloudflare regardless of the configured value. The configured TTL applies if proxy is ever disabled.

## Cloudflare Bindings MCP Limitation

The Cloudflare Bindings MCP does not support DNS record management directly. DNS configuration is provided via:

- **Terraform** (`terraform/cloudflare-dns.tf`) — Recommended for IaC
- **Shell scripts** (`scripts/configure-dns.sh`) — Quick setup via Cloudflare API
- **Settings JSON** (`dns-settings.json`) — Machine-readable configuration reference

## Prerequisites

### API Token Permissions

| Permission       | Scope | Purpose                   |
| ---------------- | ----- | ------------------------- |
| Zone:DNS:Edit    | Zone  | Create/update DNS records |
| Zone:DNSSEC:Edit | Zone  | Enable DNSSEC             |
| Zone:Zone:Read   | Zone  | Read zone details         |

### Platform Configuration

After DNS records are created:

1. **Vercel** — Add custom domains in each project:
   - Dashboard project: `dashboard.{domain}`
   - Scanner project: `scanner.{domain}`
   - Invitation project: `*.{domain}` (wildcard)

2. **Railway** — Add custom domains in each service:
   - API service: `api.{domain}`
   - WebSocket service: `ws.{domain}`

3. **Domain Registrar** — Add DS record for DNSSEC

## Files

| File                          | Purpose                                           |
| ----------------------------- | ------------------------------------------------- |
| `terraform/cloudflare-dns.tf` | Terraform IaC for DNS records and DNSSEC          |
| `scripts/configure-dns.sh`    | Shell script to create/update DNS records via API |
| `scripts/verify-dns.sh`       | Shell script to verify DNS configuration          |
| `scripts/update-dns-ttl.sh`   | Shell script to update TTL (go-live → stable)     |
| `dns-settings.json`           | Machine-readable DNS configuration reference      |
