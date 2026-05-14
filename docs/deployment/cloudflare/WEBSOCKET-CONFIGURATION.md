# WebSocket Subdomain Configuration

## Overview

This document describes the configuration for the WebSocket subdomain (`ws.{domain}`) with sticky session support. The WebSocket server runs Socket.io 4.8 on Railway and requires session affinity for the HTTP long-polling transport fallback.

**Requirement**: 11.4 — WebSocket endpoint on separate subdomain with sticky session support on load balancer.

---

## Architecture

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   Client     │────▶│  Cloudflare Edge     │────▶│  Railway Load        │────▶│  WebSocket      │
│  (Browser)   │     │  (ws.{domain})       │     │  Balancer            │     │  Server         │
│              │◀────│                      │◀────│                      │◀────│  (Socket.io)    │
│              │     │  - DNS resolution    │     │  - Sticky sessions   │     │  port 3001      │
│              │     │  - TLS termination   │     │    (io cookie)       │     │                 │
│              │     │  - WebSocket proxy   │     │  - Health check      │     │  - Redis adapter│
│              │     │  - Session affinity  │     │    /health @ 10s     │     │  - 25s ping     │
│              │     │    (__cflb cookie)   │     │                      │     │  - 60s timeout  │
└──────────────┘     └─────────────────────┘     └──────────────────────┘     └─────────────────┘
```

---

## Why Sticky Sessions?

Socket.io uses a two-phase connection process:

1. **Phase 1 — HTTP Long-Polling**: The client sends an HTTP request to establish a session. The server responds with a session ID (`sid`).
2. **Phase 2 — WebSocket Upgrade**: The client sends a WebSocket upgrade request with the `sid`. The server upgrades the connection.

If Phase 1 and Phase 2 hit different backend instances, the upgrade fails because the second instance doesn't know about the session created in Phase 1.

**Sticky sessions ensure both phases reach the same instance.**

### Current Scale

At current scale (1 event / ≤500 guests), there is only **one** WebSocket instance. Sticky sessions have no practical effect but are configured for:

- Future horizontal scaling without client-side changes
- Correct behavior if Railway temporarily runs multiple instances during deployment

---

## Configuration Layers

### Layer 1: Cloudflare DNS

| Setting     | Value                                       |
| ----------- | ------------------------------------------- |
| Record Type | CNAME                                       |
| Name        | `ws`                                        |
| Content     | `{railway-websocket-origin}.up.railway.app` |
| Proxy       | Enabled (orange cloud)                      |
| TTL         | Automatic (1)                               |

The record is proxied through Cloudflare to enable:

- WebSocket protocol support (Cloudflare proxies WebSocket natively)
- DDoS protection on the WebSocket endpoint
- SSL/TLS termination at edge
- Session affinity via Cloudflare Load Balancer (Pro+ plan)

### Layer 2: Cloudflare Zone Settings

| Setting      | Value         | Notes                                    |
| ------------ | ------------- | ---------------------------------------- |
| WebSocket    | Enabled       | Default on all plans; cannot be disabled |
| SSL/TLS Mode | Full (Strict) | End-to-end encryption                    |
| Minimum TLS  | 1.2           | Blocks legacy clients                    |

### Layer 3: Session Affinity (Sticky Sessions)

Session affinity is implemented at **two levels** for redundancy:

#### Option A: Cloudflare Load Balancer (Pro+ plan)

| Setting          | Value                         |
| ---------------- | ----------------------------- |
| Session Affinity | Cookie                        |
| Cookie Name      | `__cflb` (Cloudflare-managed) |
| SameSite         | Strict                        |
| Secure           | Always                        |
| Steering Policy  | Random                        |

Cloudflare's Load Balancer sets a `__cflb` cookie on the first response. All subsequent requests with this cookie are routed to the same origin pool member.

#### Option B: Railway Load Balancer (All plans)

| Setting         | Value                           |
| --------------- | ------------------------------- |
| Sticky Sessions | Enabled (via Railway dashboard) |
| Affinity Cookie | `io` (set by Socket.io server)  |
| Mechanism       | Cookie-based routing            |

Railway's built-in load balancer reads the `io` cookie set by Socket.io and routes requests to the same instance. This works on all Railway plans without Cloudflare Load Balancer.

**Recommendation**: Use Option B (Railway) for the Free/Pro Cloudflare plan. Add Option A when scaling to multiple origins.

### Layer 4: Socket.io Server Configuration

The Socket.io server is configured to support sticky sessions:

```typescript
// From packages/realtime/src/config/production.ts
const serverOptions = {
  // Sticky session support — sets the `io` cookie for LB affinity
  cookie: {
    name: 'io',
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
  },

  // Transport: WebSocket preferred, polling as fallback
  transports: ['websocket', 'polling'],
  allowUpgrades: true,

  // Keepalive: 25s ping interval, 60s idle timeout
  pingInterval: 25_000,
  pingTimeout: 60_000,
};
```

---

## Connection Timeouts

| Parameter                    | Value       | Purpose                                     |
| ---------------------------- | ----------- | ------------------------------------------- |
| Ping Interval                | 25 seconds  | Keepalive to detect dead connections        |
| Ping Timeout                 | 60 seconds  | Idle timeout; close if no pong received     |
| Cloudflare WebSocket Timeout | 100 seconds | Cloudflare closes idle WebSocket after 100s |
| Railway Idle Timeout         | 300 seconds | Railway closes idle connections after 5 min |

The 25s ping interval ensures connections stay alive well within Cloudflare's 100s idle timeout.

---

## Health Check Configuration

| Setting             | Value                  |
| ------------------- | ---------------------- |
| Endpoint            | `GET /health`          |
| Interval            | 10 seconds             |
| Timeout             | 5 seconds              |
| Unhealthy Threshold | 3 consecutive failures |
| Expected Response   | HTTP 200               |

The health check verifies:

- WebSocket server process is running
- Redis adapter connection is healthy
- Server can accept new connections

---

## Setup Instructions

### Option 1: Cloudflare API Script

```bash
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ZONE_ID="your-zone-id"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export DOMAIN="weddingdigital.id"
export WEBSOCKET_ORIGIN="websocket-production.up.railway.app"

./scripts/configure-websocket.sh
```

### Option 2: Terraform

```bash
cd terraform/
terraform init
terraform plan \
  -var="cloudflare_api_token=..." \
  -var="cloudflare_zone_id=..." \
  -var="domain=weddingdigital.id" \
  -var="websocket_origin=websocket-production.up.railway.app"
terraform apply
```

### Option 3: Cloudflare Dashboard (Manual)

1. **DNS → Records → Add Record**
   - Type: CNAME
   - Name: `ws`
   - Target: `websocket-production.up.railway.app`
   - Proxy: Enabled (orange cloud)

2. **Network → WebSockets**
   - Verify "WebSockets" is ON (default)

3. **Traffic → Load Balancing** (Pro+ plan only)
   - Create Pool: `websocket-railway-pool`
     - Origin: `websocket-production.up.railway.app`
     - Health Check: GET /health, interval 10s
   - Create Load Balancer: `ws.{domain}`
     - Pool: `websocket-railway-pool`
     - Session Affinity: Cookie
     - Steering: Random

4. **Railway Dashboard → WebSocket Service → Settings**
   - Enable "Sticky Sessions" for the service domain

---

## Verification

### Test DNS Resolution

```bash
dig ws.weddingdigital.id CNAME
# Expected: ws.weddingdigital.id → {railway-origin}.up.railway.app
```

### Test WebSocket Connectivity

```bash
# Using wscat (npm install -g wscat)
wscat -c "wss://ws.weddingdigital.id/socket.io/?EIO=4&transport=websocket"

# Using curl (check upgrade headers)
curl -v -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "https://ws.weddingdigital.id/socket.io/?EIO=4&transport=websocket"
```

### Test Sticky Sessions

```bash
# First request — should receive __cflb cookie (Cloudflare LB) or io cookie (Socket.io)
curl -v "https://ws.weddingdigital.id/socket.io/?EIO=4&transport=polling"

# Look for Set-Cookie header in response:
# Set-Cookie: io=<session-id>; Path=/; HttpOnly; SameSite=Strict
# Set-Cookie: __cflb=<hash>; SameSite=Strict; Secure (if Cloudflare LB active)
```

### Test Health Check

```bash
curl -s "https://ws.weddingdigital.id/health" | jq .
# Expected: {"status": "healthy", "redis": "connected", ...}
```

---

## Troubleshooting

### WebSocket Connection Fails (HTTP 101 not received)

1. Verify Cloudflare proxy is enabled (orange cloud) on the DNS record
2. Check that WebSocket support is ON in Cloudflare Dashboard → Network
3. Verify the origin server is listening on the correct port (3001)
4. Check Railway service logs for connection errors

### Sticky Session Not Working (Session ID mismatch)

1. Verify the `io` cookie is being set in the response
2. Check that the client sends the cookie on subsequent requests
3. If using Cloudflare LB, verify session affinity is set to "cookie"
4. Check Railway dashboard: ensure sticky sessions are enabled for the service

### Connection Drops After ~100 Seconds

Cloudflare has a 100-second idle timeout for WebSocket connections. The Socket.io ping interval (25s) should prevent this. If connections still drop:

1. Verify `pingInterval: 25000` is set in production config
2. Check client-side Socket.io is not overriding ping settings
3. Look for network-level issues (corporate proxies, firewalls)

### 524 Timeout Error

Cloudflare returns 524 when the origin doesn't respond within 100 seconds:

1. Check Railway service is running and healthy
2. Verify the WebSocket server is not overloaded
3. Check Redis adapter connection (if Redis is down, server may hang)

---

## Related Files

| File                                                           | Purpose                                  |
| -------------------------------------------------------------- | ---------------------------------------- |
| `packages/realtime/src/config/production.ts`                   | Socket.io production configuration       |
| `docs/deployment/railway-networking.md`                        | Railway private networking and LB config |
| `docs/deployment/cloudflare/terraform/cloudflare-websocket.tf` | Terraform IaC                            |
| `docs/deployment/cloudflare/scripts/configure-websocket.sh`    | Cloudflare API script                    |
| `docs/deployment/cloudflare/ssl-tls-configuration.md`          | SSL/TLS settings                         |
