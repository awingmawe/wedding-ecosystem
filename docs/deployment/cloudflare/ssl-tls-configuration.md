# SSL/TLS Configuration — Cloudflare

## Overview

This document defines the SSL/TLS and HTTPS enforcement configuration for all production domains of the Wedding Digital SaaS platform. Configuration is applied via Cloudflare's zone-level settings and page rules.

## Domains Covered

| Subdomain               | Application      | Purpose                          |
| ----------------------- | ---------------- | -------------------------------- |
| `dashboard.{domain}`    | Dashboard App    | Client & WO management interface |
| `{event-slug}.{domain}` | Invitation App   | Guest-facing digital invitation  |
| `scanner.{domain}`      | Scanner PWA      | QR code scanning for check-in    |
| `api.{domain}`          | Fastify API      | REST API backend                 |
| `ws.{domain}`           | WebSocket Server | Real-time Socket.io connections  |

## SSL/TLS Mode

**Mode: Full (Strict)**

- Encrypts end-to-end between visitor → Cloudflare → Railway origin
- Validates the origin server's SSL certificate (must be valid CA-issued or Cloudflare Origin CA)
- Prevents MITM attacks on the Cloudflare-to-origin connection

### Origin Certificate

Railway provides automatic SSL certificates for custom domains. Configure Cloudflare Origin CA certificate on Railway for maximum security:

1. Generate Cloudflare Origin CA certificate (RSA 2048-bit, 15-year validity)
2. Install on Railway custom domain configuration
3. Cloudflare validates this certificate on every request to origin

## TLS Version Configuration

| Setting             | Value               | Rationale                                                              |
| ------------------- | ------------------- | ---------------------------------------------------------------------- |
| Minimum TLS Version | TLS 1.2             | Industry standard minimum; blocks TLS 1.0/1.1 (deprecated, vulnerable) |
| TLS 1.3             | Enabled (preferred) | Faster handshake (1-RTT), stronger ciphers, forward secrecy by default |

### Cipher Suite Priority (TLS 1.3)

- TLS_AES_256_GCM_SHA384
- TLS_CHACHA20_POLY1305_SHA256
- TLS_AES_128_GCM_SHA256

### Cipher Suite Priority (TLS 1.2 fallback)

- ECDHE-ECDSA-AES256-GCM-SHA384
- ECDHE-RSA-AES256-GCM-SHA384
- ECDHE-ECDSA-AES128-GCM-SHA256
- ECDHE-RSA-AES128-GCM-SHA256

## HTTPS Redirect

All HTTP requests are permanently redirected to HTTPS:

- **Method**: HTTP 301 (Permanent Redirect)
- **Scope**: All domains and subdomains
- **Cloudflare Setting**: "Always Use HTTPS" = ON

```
HTTP://dashboard.example.com/* → 301 → HTTPS://dashboard.example.com/*
HTTP://api.example.com/*       → 301 → HTTPS://api.example.com/*
HTTP://scanner.example.com/*   → 301 → HTTPS://scanner.example.com/*
HTTP://ws.example.com/*        → 301 → HTTPS://ws.example.com/*
HTTP://*.example.com/*         → 301 → HTTPS://*.example.com/*
```

## HSTS Configuration

HTTP Strict Transport Security header applied to all responses:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

| Parameter           | Value             | Rationale                                                                |
| ------------------- | ----------------- | ------------------------------------------------------------------------ |
| `max-age`           | 31536000 (1 year) | Browsers remember HTTPS-only for 1 year                                  |
| `includeSubDomains` | Yes               | Covers all subdomains including event-slug wildcards                     |
| `preload`           | Not yet           | Enable after confirming stable HTTPS (submit to HSTS preload list later) |

### HSTS Deployment Notes

- HSTS is irreversible for the duration of max-age once deployed
- Ensure ALL subdomains support HTTPS before enabling `includeSubDomains`
- Start with shorter max-age (86400 = 1 day) during initial rollout, then increase to 31536000

## Certificate Management

| Aspect             | Configuration                                      |
| ------------------ | -------------------------------------------------- |
| Edge Certificate   | Cloudflare Universal SSL (free, auto-renewed)      |
| Origin Certificate | Cloudflare Origin CA (15-year validity)            |
| Auto-Renewal       | Cloudflare handles edge cert renewal automatically |
| Certificate Type   | ECDSA (preferred) with RSA fallback                |
| OCSP Stapling      | Enabled (faster TLS handshake)                     |

## Verification Checklist

- [ ] SSL/TLS mode set to "Full (Strict)" in Cloudflare dashboard
- [ ] Minimum TLS version set to 1.2
- [ ] TLS 1.3 enabled
- [ ] "Always Use HTTPS" enabled
- [ ] HSTS enabled with max-age=31536000 and includeSubDomains
- [ ] Origin CA certificate installed on Railway
- [ ] All domains resolve over HTTPS without certificate errors
- [ ] HTTP requests return 301 redirect to HTTPS
- [ ] TLS 1.0 and 1.1 connections are rejected

## Related Requirements

- **Req 2.1**: SSL/TLS on all domains with minimum TLS 1.2, preference TLS 1.3
- **Req 2.2**: HTTPS redirect (HTTP 301 → HTTPS)
- **Req 2.3**: HSTS with max-age=31536000 and includeSubDomains
- **Req 2.4**: End-to-end encryption between load balancer and backend
- **Req 2.7**: SSL certificate from trusted CA with auto-renewal
