# Railway Private Networking & Security Configuration

## Overview

This document defines the network security architecture for the Wedding Digital SaaS backend services deployed on Railway. All backend services operate within Railway's private network, ensuring service-to-service communication is isolated from the public internet.

**Key Principles:**

- Backend services (API, WebSocket, PostgreSQL, Redis) communicate exclusively over Railway's private network
- Only the API and WebSocket services are exposed to the public internet, and only through Railway's built-in load balancer on port 443
- Database and cache services have zero public exposure
- All internal communication uses Railway's internal DNS (`*.railway.internal`)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          PUBLIC INTERNET                                  │
│                                                                          │
│   Users ──► Cloudflare WAF/CDN ──► Railway Load Balancer (port 443)     │
│                                          │                               │
└──────────────────────────────────────────┼───────────────────────────────┘
                                           │
                                           │ HTTPS/WSS (port 443)
                                           │
┌──────────────────────────────────────────┼───────────────────────────────┐
│                    RAILWAY PRIVATE NETWORK                                │
│                                           │                              │
│   ┌───────────────────────────────────────┼──────────────────────────┐   │
│   │                                       ▼                          │   │
│   │   ┌─────────────────┐    ┌─────────────────────┐                │   │
│   │   │   API Server    │    │   WebSocket Server   │                │   │
│   │   │  (Fastify 5)    │    │   (Socket.io 4.8)    │                │   │
│   │   │  port 3000      │    │   port 3001           │                │   │
│   │   └────────┬────────┘    └──────────┬───────────┘                │   │
│   │            │                         │                           │   │
│   │            │ Private Network Only    │                           │   │
│   │            │                         │                           │   │
│   │   ┌───────┴─────────────────────────┴────────────────────┐      │   │
│   │   │                                                       │      │   │
│   │   │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │      │   │
│   │   │  │  PostgreSQL   │  │ Redis Cache  │  │Redis PubSub│ │      │   │
│   │   │  │  port 5432    │  │  port 6379   │  │ port 6379  │ │      │   │
│   │   │  │              │  │              │  │            │ │      │   │
│   │   │  │ NO PUBLIC    │  │ NO PUBLIC    │  │ NO PUBLIC  │ │      │   │
│   │   │  │ EXPOSURE     │  │ EXPOSURE     │  │ EXPOSURE   │ │      │   │
│   │   │  └──────────────┘  └──────────────┘  └────────────┘ │      │   │
│   │   │                  DATA LAYER                           │      │   │
│   │   └──────────────────────────────────────────────────────┘      │   │
│   │                                                                  │   │
│   └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Railway Project Structure

### Services

| Service        | Internal Address                | Internal Port | Public Exposure       | Purpose                             |
| -------------- | ------------------------------- | ------------- | --------------------- | ----------------------------------- |
| `api`          | `api.railway.internal`          | 3000          | Yes (port 443 via LB) | Fastify 5 REST API server           |
| `websocket`    | `websocket.railway.internal`    | 3001          | Yes (port 443 via LB) | Socket.io 4.8 real-time server      |
| `postgresql`   | `postgresql.railway.internal`   | 5432          | **None**              | PostgreSQL database (managed)       |
| `redis-cache`  | `redis-cache.railway.internal`  | 6379          | **None**              | Redis for caching & rate limiting   |
| `redis-pubsub` | `redis-pubsub.railway.internal` | 6379          | **None**              | Redis for Socket.io pub/sub adapter |

---

## Private Networking Configuration

### Enabling Private Networking

Railway private networking is enabled at the project level. All services within the same Railway project automatically receive internal DNS addresses and can communicate without exposing traffic to the public internet.

**Setup Steps:**

1. Create a Railway project named `wedding-digital-production`
2. Enable "Private Networking" in Project Settings → Networking
3. Each service receives an internal hostname: `{service-name}.railway.internal`
4. Internal communication uses IPv6 addresses resolved via Railway's internal DNS

### Internal DNS Resolution

Services reference each other using Railway's internal DNS:

```
# API Server connects to:
postgresql.railway.internal:5432    # Database
redis-cache.railway.internal:6379   # Cache
redis-pubsub.railway.internal:6379  # Pub/Sub (for broadcasting)

# WebSocket Server connects to:
redis-pubsub.railway.internal:6379  # Socket.io Redis adapter
redis-cache.railway.internal:6379   # Session validation
```

---

## Service-to-Service Communication Rules

### Access Matrix

| Source Service | Destination Service | Port | Protocol | Purpose                                  |
| -------------- | ------------------- | ---- | -------- | ---------------------------------------- |
| `api`          | `postgresql`        | 5432 | TCP/TLS  | Database queries via Prisma              |
| `api`          | `redis-cache`       | 6379 | TCP/TLS  | Caching, rate limiting, session storage  |
| `api`          | `redis-pubsub`      | 6379 | TCP/TLS  | Broadcasting events to WebSocket clients |
| `websocket`    | `redis-pubsub`      | 6379 | TCP/TLS  | Socket.io Redis adapter (pub/sub)        |
| `websocket`    | `redis-cache`       | 6379 | TCP/TLS  | JWT session validation                   |
| Load Balancer  | `api`               | 3000 | TCP      | Route HTTPS traffic to API               |
| Load Balancer  | `websocket`         | 3001 | TCP      | Route WSS traffic to WebSocket           |

### Denied Communication (Security Groups Equivalent)

| Source          | Destination    | Port | Status | Reason                                   |
| --------------- | -------------- | ---- | ------ | ---------------------------------------- |
| Public Internet | `postgresql`   | 5432 | DENIED | Database must not be publicly accessible |
| Public Internet | `redis-cache`  | 6379 | DENIED | Cache must not be publicly accessible    |
| Public Internet | `redis-pubsub` | 6379 | DENIED | Pub/Sub must not be publicly accessible  |
| Public Internet | `api`          | 3000 | DENIED | Direct access blocked; use LB port 443   |
| Public Internet | `websocket`    | 3001 | DENIED | Direct access blocked; use LB port 443   |
| `websocket`     | `postgresql`   | 5432 | DENIED | WebSocket has no direct DB access        |

---

## Port Exposure Rules

### Public-Facing (via Railway Load Balancer)

Only port 443 is exposed to the public internet through Railway's built-in load balancer:

| External Port | Protocol | Target Service | Target Port | Domain         |
| ------------- | -------- | -------------- | ----------- | -------------- |
| 443           | HTTPS    | `api`          | 3000        | `api.{domain}` |
| 443           | WSS      | `websocket`    | 3001        | `ws.{domain}`  |

### Internal-Only (Private Network)

These ports are accessible only within Railway's private network:

| Port | Service        | Accessible From    | Protocol |
| ---- | -------------- | ------------------ | -------- |
| 5432 | `postgresql`   | `api` only         | TCP/TLS  |
| 6379 | `redis-cache`  | `api`, `websocket` | TCP/TLS  |
| 6379 | `redis-pubsub` | `api`, `websocket` | TCP/TLS  |

---

## Security Group Equivalent Settings

Railway does not have traditional security groups like AWS VPC. Instead, network isolation is achieved through:

1. **Private Networking** — Services without public domains are completely inaccessible from outside
2. **No Public Domain Assignment** — Database and Redis services have no public domain configured
3. **Internal DNS Only** — Data layer services resolve only via `*.railway.internal`
4. **TLS Encryption** — All connections use TLS (database SSL `verify-full`, Redis TLS)

### Equivalent Security Group Rules

```yaml
# Security Group: api-server
api-server:
  inbound:
    - source: railway-load-balancer
      port: 3000
      protocol: TCP
      description: 'HTTPS traffic from Railway LB'
  outbound:
    - destination: postgresql.railway.internal
      port: 5432
      protocol: TCP/TLS
      description: 'Database queries'
    - destination: redis-cache.railway.internal
      port: 6379
      protocol: TCP/TLS
      description: 'Cache operations'
    - destination: redis-pubsub.railway.internal
      port: 6379
      protocol: TCP/TLS
      description: 'Event broadcasting'

# Security Group: websocket-server
websocket-server:
  inbound:
    - source: railway-load-balancer
      port: 3001
      protocol: TCP
      description: 'WSS traffic from Railway LB'
  outbound:
    - destination: redis-pubsub.railway.internal
      port: 6379
      protocol: TCP/TLS
      description: 'Socket.io Redis adapter'
    - destination: redis-cache.railway.internal
      port: 6379
      protocol: TCP/TLS
      description: 'Session validation'

# Security Group: postgresql
postgresql:
  inbound:
    - source: api.railway.internal
      port: 5432
      protocol: TCP/TLS
      description: 'Database connections from API only'
  outbound: []
  public_access: none

# Security Group: redis-cache
redis-cache:
  inbound:
    - source: api.railway.internal
      port: 6379
      protocol: TCP/TLS
      description: 'Cache operations from API'
    - source: websocket.railway.internal
      port: 6379
      protocol: TCP/TLS
      description: 'Session validation from WebSocket'
  outbound: []
  public_access: none

# Security Group: redis-pubsub
redis-pubsub:
  inbound:
    - source: api.railway.internal
      port: 6379
      protocol: TCP/TLS
      description: 'Event publishing from API'
    - source: websocket.railway.internal
      port: 6379
      protocol: TCP/TLS
      description: 'Socket.io adapter subscription'
  outbound: []
  public_access: none
```

---

## Railway Load Balancer Configuration

Railway's built-in load balancer handles:

- **TLS Termination**: SSL certificates managed by Railway (auto-provisioned via Let's Encrypt)
- **Port Mapping**: External port 443 → Internal service ports (3000, 3001)
- **Health Checks**: Configured via `healthcheckPath` in `railway.toml`
- **Sticky Sessions**: Enabled for WebSocket service (required for Socket.io handshake)

### Load Balancer Settings

```yaml
load_balancer:
  # API Service
  api:
    external_port: 443
    internal_port: 3000
    protocol: HTTPS
    health_check:
      path: /health
      interval: 10s
      timeout: 5s
      unhealthy_threshold: 3
    sticky_session: false

  # WebSocket Service
  websocket:
    external_port: 443
    internal_port: 3001
    protocol: WSS
    health_check:
      path: /health
      interval: 10s
      timeout: 5s
      unhealthy_threshold: 3
    sticky_session: true # Required for Socket.io upgrade handshake
```

---

## Environment Variables (Connection Strings)

All connection strings use Railway's internal DNS addresses. Actual credentials are stored in Railway's environment variable management (encrypted at rest).

```bash
# Database (API server only)
DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@postgresql.railway.internal:5432/${PGDATABASE}?sslmode=verify-full"

# Redis Cache (API + WebSocket)
REDIS_CACHE_URL="rediss://:${REDIS_CACHE_PASSWORD}@redis-cache.railway.internal:6379"

# Redis Pub/Sub (API + WebSocket)
REDIS_PUBSUB_URL="rediss://:${REDIS_PUBSUB_PASSWORD}@redis-pubsub.railway.internal:6379"

# Service ports (internal)
PORT=3000          # API server
WS_PORT=3001       # WebSocket server

# Public domains (configured in Railway dashboard)
API_DOMAIN="api.yourdomain.com"
WS_DOMAIN="ws.yourdomain.com"
```

---

## Setup Procedure

### 1. Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and create project
railway login
railway init --name wedding-digital-production
```

### 2. Enable Private Networking

In Railway Dashboard:

1. Navigate to Project Settings → Networking
2. Enable "Private Networking"
3. All services will receive `*.railway.internal` DNS entries

### 3. Deploy Services

```bash
# Deploy API service
railway service create api
railway variables set PORT=3000 NODE_ENV=production
railway domain add api.yourdomain.com  # Public domain via LB

# Deploy WebSocket service
railway service create websocket
railway variables set WS_PORT=3001 NODE_ENV=production
railway domain add ws.yourdomain.com  # Public domain via LB

# Deploy PostgreSQL (no public domain)
railway service create postgresql --plugin postgresql
# No `railway domain add` — keeps it private-only

# Deploy Redis Cache (no public domain)
railway service create redis-cache --plugin redis
# No `railway domain add` — keeps it private-only

# Deploy Redis Pub/Sub (no public domain)
railway service create redis-pubsub --plugin redis
# No `railway domain add` — keeps it private-only
```

### 4. Configure Connection Variables

```bash
# Set database connection for API service
railway variables set DATABASE_URL="postgresql://\${PGUSER}:\${PGPASSWORD}@postgresql.railway.internal:5432/\${PGDATABASE}?sslmode=verify-full" --service api

# Set Redis connections for API service
railway variables set REDIS_CACHE_URL="rediss://:\${REDIS_CACHE_PASSWORD}@redis-cache.railway.internal:6379" --service api
railway variables set REDIS_PUBSUB_URL="rediss://:\${REDIS_PUBSUB_PASSWORD}@redis-pubsub.railway.internal:6379" --service api

# Set Redis connections for WebSocket service
railway variables set REDIS_CACHE_URL="rediss://:\${REDIS_CACHE_PASSWORD}@redis-cache.railway.internal:6379" --service websocket
railway variables set REDIS_PUBSUB_URL="rediss://:\${REDIS_PUBSUB_PASSWORD}@redis-pubsub.railway.internal:6379" --service websocket
```

### 5. Verify Private Networking

```bash
# From API service shell, verify internal DNS resolves
railway shell --service api
nslookup postgresql.railway.internal
nslookup redis-cache.railway.internal
nslookup redis-pubsub.railway.internal

# Verify database is NOT accessible from public internet
# This should FAIL (timeout):
curl https://postgresql.railway.internal:5432  # No route from outside
```

---

## Compliance with Requirements

| Requirement | Implementation                                                               |
| ----------- | ---------------------------------------------------------------------------- |
| 1.1         | All backend services in private network (Railway private networking enabled) |
| 1.2         | Only load balancer has public access; routes to private backend services     |
| 1.3         | Port 443 (LB), 5432 (PG from API only), 6379 (Redis from API/WS only)        |

---

## Troubleshooting

### Service Cannot Connect to Database

1. Verify private networking is enabled in project settings
2. Check that `DATABASE_URL` uses `postgresql.railway.internal` (not public hostname)
3. Verify the PostgreSQL plugin is in the same Railway project
4. Check Railway logs for DNS resolution errors

### WebSocket Connections Dropping

1. Verify sticky sessions are enabled for the WebSocket service domain
2. Check that the WebSocket service health check is passing
3. Verify Redis pub/sub is accessible from the WebSocket service

### Redis Connection Refused

1. Verify Redis plugin is in the same Railway project
2. Check that connection URL uses `redis-cache.railway.internal` or `redis-pubsub.railway.internal`
3. Verify TLS is used (`rediss://` protocol prefix)
4. Check Redis password is correctly set in environment variables
