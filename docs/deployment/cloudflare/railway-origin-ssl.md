# Railway Origin SSL Configuration

## Overview

This document covers the origin-side SSL configuration on Railway to enable end-to-end encryption between Cloudflare and Railway backend services.

**Requirement 2.4**: End-to-end encryption between Cloudflare edge and Railway origin.

## Architecture

```
Client → Cloudflare Edge (TLS 1.2/1.3) → Railway Origin (TLS, validated cert)
```

With Cloudflare SSL mode set to **Full (Strict)**, Cloudflare validates the origin server's certificate on every request. This prevents MITM attacks on the internal connection.

## Railway SSL Configuration

Railway automatically provisions SSL certificates for custom domains. The setup requires:

### 1. Custom Domain Configuration

Add custom domains to Railway services:

| Service     | Custom Domain  | Railway Service    |
| ----------- | -------------- | ------------------ |
| Fastify API | `api.{domain}` | `api-server`       |
| WebSocket   | `ws.{domain}`  | `websocket-server` |

> Note: Frontend apps (dashboard, invitation, scanner) are hosted on Vercel, not Railway.

### 2. Cloudflare Origin CA Certificate (Recommended)

For maximum security with Full (Strict) mode:

1. **Generate Origin CA Certificate** in Cloudflare Dashboard:
   - Go to SSL/TLS → Origin Server
   - Click "Create Certificate"
   - Select RSA (2048) key type
   - Add hostnames: `*.{domain}`, `{domain}`
   - Set validity: 15 years
   - Download certificate (.pem) and private key (.key)

2. **Install on Railway**:
   - Railway automatically handles SSL for custom domains
   - If using Cloudflare Origin CA, configure via Railway's custom domain settings
   - Railway validates the certificate chain automatically

3. **Verify**:
   ```bash
   # Check origin certificate from Cloudflare's perspective
   curl -v https://api.{domain} 2>&1 | grep "SSL certificate verify"
   ```

### 3. Railway Environment Variables

Ensure Railway services are configured to accept HTTPS connections:

```env
# Railway automatically sets PORT
# Services listen on HTTP internally; Railway's proxy handles TLS termination
PORT=3000

# For services that need to know their public URL
API_BASE_URL=https://api.{domain}
WS_BASE_URL=wss://ws.{domain}
```

### 4. Railway Proxy Behavior

Railway's infrastructure handles TLS termination at their proxy layer:

- External traffic arrives over HTTPS (port 443)
- Railway proxy terminates TLS
- Internal traffic forwarded to service on configured PORT (HTTP)
- Cloudflare → Railway connection is encrypted (Railway's proxy has valid cert)

This means:

- Application code listens on HTTP (Railway handles TLS)
- Cloudflare Full (Strict) validates Railway's proxy certificate
- End-to-end encryption is maintained: Client → Cloudflare (TLS) → Railway Proxy (TLS) → App (internal)

## Verification

### Test End-to-End Encryption

```bash
# Verify Cloudflare connects to origin with valid cert
curl -v https://api.{domain}/health 2>&1 | grep -E "(SSL|TLS|certificate)"

# Verify TLS version negotiated
curl -w "TLS Version: %{ssl_version}\n" -o /dev/null -s https://api.{domain}/health

# Verify no certificate errors
openssl s_client -connect api.{domain}:443 -servername api.{domain} < /dev/null 2>/dev/null | grep "Verify return code"
```

### Expected Results

- TLS version: TLSv1.3 (preferred) or TLSv1.2
- Certificate issuer: Cloudflare Inc (if using Origin CA) or Let's Encrypt (Railway default)
- Verify return code: 0 (ok)
- No mixed content warnings

## Troubleshooting

| Issue                       | Cause                                | Solution                                        |
| --------------------------- | ------------------------------------ | ----------------------------------------------- |
| 525 SSL Handshake Failed    | Origin cert not installed or expired | Verify Railway custom domain SSL status         |
| 526 Invalid SSL Certificate | Cert doesn't match hostname          | Ensure cert covers `*.{domain}`                 |
| 521 Web Server Is Down      | Railway service not running          | Check Railway deployment status                 |
| Mixed content warnings      | HTTP resources on HTTPS page         | Enable "Automatic HTTPS Rewrites" in Cloudflare |
