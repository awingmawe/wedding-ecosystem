# Architecture

## System Overview

```mermaid
graph TB
    subgraph "Frontend (Vercel)"
        Dashboard["Dashboard<br/>Next.js 16 — :3000"]
        Invitation["Invitation<br/>Next.js 16 — :3001"]
        Scanner["Scanner PWA<br/>Next.js 16 — :3002"]
    end

    subgraph "Backend (Railway)"
        API["Fastify 5 API<br/>REST — :4000"]
        WS["Socket.io 4.8<br/>WebSocket — :4000"]
    end

    subgraph "Data Layer"
        PG["PostgreSQL<br/>(Supabase)"]
        Redis["Redis<br/>(Upstash)"]
        R2["Cloudflare R2<br/>(Media Storage)"]
    end

    Dashboard -->|REST + WS| API
    Dashboard -->|WS| WS
    Invitation -->|REST| API
    Scanner -->|REST + WS| API
    Scanner -->|WS| WS

    API --> PG
    API --> Redis
    API --> R2
    WS --> Redis
```

## Architectural Patterns

### Multi-Tenant Isolation

Every database table includes `tenant_id`. All queries are scoped at the service layer via middleware.

```mermaid
sequenceDiagram
    participant Client
    participant Middleware as Tenant Middleware
    participant Service
    participant DB

    Client->>Middleware: Request + JWT
    Middleware->>Middleware: Extract tenant_id from token
    Middleware->>Service: Request + tenant context
    Service->>DB: Query WHERE tenant_id = ?
    DB-->>Service: Scoped results
    Service-->>Client: Response
```

### Layered Backend Architecture

```mermaid
graph TB
    Routes["Routes Layer<br/>(Thin HTTP adapters, request parsing, auth hook)"]
    Middleware["Middleware Layer<br/>(Auth, CORS, Rate Limit, RBAC, Tenant Isolation)"]
    Services["Service Layer<br/>(Business logic, slug/QR generation, PII encryption, deduplication)"]
    Repositories["Repository Layer<br/>(Prisma adapters — all queries tenant-scoped via tenant_id)"]
    Plugins["Plugin Layer<br/>(Audit logger, response cache, security headers)"]
    Data["Data Layer<br/>(Prisma ORM, Redis client)"]

    Routes --> Middleware
    Middleware --> Services
    Services --> Repositories
    Repositories --> Data
    Plugins -.->|cross-cutting| Routes
    Plugins -.->|cross-cutting| Services
```

**Domain coverage**: Guest and CheckIn domains use the full Route → Service → Repository stack. Other domains (CMS, RSVP, Events) still call Prisma from the service layer directly — migration is ongoing.

### Frontend Architecture (per app)

```mermaid
graph TB
    AppRouter["App Router<br/>(Next.js 16 pages)"]
    Components["Components<br/>(shadcn/ui + custom)"]
    Hooks["Custom Hooks<br/>(useSocket, useAuth, etc.)"]
    Lib["Lib Layer<br/>(API client, utilities)"]
    External["External<br/>(Backend API + WebSocket)"]

    AppRouter --> Components
    Components --> Hooks
    Hooks --> Lib
    Lib --> External
```

### Real-Time Architecture

```mermaid
graph LR
    subgraph "Scanner App"
        S1["Scanner Device 1"]
        S2["Scanner Device 2"]
    end

    subgraph "Socket.io Server"
        Room["Event Room<br/>(tenant-scoped)"]
        Auth["JWT Auth Middleware"]
    end

    subgraph "Dashboard"
        Monitor["Check-in Monitor"]
    end

    S1 -->|check_in event| Auth
    S2 -->|check_in event| Auth
    Auth --> Room
    Room -->|broadcast| Monitor
    Room -->|broadcast| S1
    Room -->|broadcast| S2
```

**WebSocket Events**: `guest_checked_in`, `rsvp_updated`, `go_show_added`, `stats_updated`

### Offline-First (Scanner PWA)

```mermaid
graph TB
    QRScan["QR Scan Action"]
    Online{Online?}
    APICall["API Verify"]
    IndexedDB["IndexedDB Queue"]
    SW["Service Worker"]
    Sync["Background Sync"]

    QRScan --> Online
    Online -->|Yes| APICall
    Online -->|No| IndexedDB
    IndexedDB --> SW
    SW -->|Reconnect| Sync
    Sync --> APICall
```

- Offline scans stored in IndexedDB
- Auto-sync within 30 seconds of reconnection
- Conflict resolution: server timestamp wins

### CMS-Driven Rendering (Invitation)

14 configurable sections rendered dynamically based on `InvitationSection` records:

```mermaid
graph LR
    Config["EventConfig<br/>(active_sections, theme)"]
    Sections["InvitationSection[]<br/>(sorted by sort_order)"]
    Renderer["SectionRenderer<br/>(dynamic component map)"]
    Output["Rendered Invitation"]

    Config --> Renderer
    Sections --> Renderer
    Renderer --> Output
```

## Security Architecture

```mermaid
graph TB
    subgraph "Authentication"
        JWT["JWT (15min access + 7d refresh)"]
        Bcrypt["bcrypt password hashing"]
        Lockout["Account lockout (failed attempts)"]
    end

    subgraph "Authorization"
        RBAC["Role-Based Access Control<br/>(Admin, Client, WO, Scanner)"]
        Tenant["Tenant Isolation Middleware"]
        Room["WebSocket Room Authorization"]
    end

    subgraph "Protection"
        RateLimit["Rate Limiting<br/>(100 req/min per tenant, Redis-backed)"]
        CORS["Per-app origin validation"]
        Headers["Security Headers<br/>(HSTS, X-Frame-Options, CSP)"]
        Secrets["Pre-commit secret scanning"]
        PII["PII Encryption at rest"]
    end
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "CI/CD (GitHub Actions)"
        CI["ci.yml<br/>Tests + Security"]
        DF["deploy-frontend.yml<br/>Vercel per app"]
        DB["deploy-backend.yml<br/>Railway blue-green"]
        ST["smoke-test.yml<br/>Post-deploy verify"]
        SS["secret-scanning.yml"]
    end

    subgraph "Production"
        Vercel["Vercel<br/>(3 frontend apps)"]
        Railway["Railway<br/>(API + WebSocket)"]
        Supabase["Supabase<br/>(PostgreSQL)"]
        Upstash["Upstash<br/>(Redis)"]
        CF["Cloudflare R2<br/>(Media CDN)"]
    end

    CI -->|pass| DF
    CI -->|pass| DB
    DF --> Vercel
    DB --> Railway
    DB -->|migrate| Supabase
    ST --> Vercel
    ST --> Railway
```

**Blue-Green Deployment**: Backend deploys to inactive environment, health-checked for 3 minutes (3 consecutive successes), then traffic swaps. Auto-rollback on failure.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single Redis instance (cache + pub/sub) | ≤500 guests, pub/sub traffic negligible |
| Single API instance (no clustering) | 500 guests won't saturate single Fastify process |
| No staging environment | Validation via Vercel previews + CI pipeline |
| Room-based WebSocket | Data isolation per event without Redis adapter overhead |
| Prisma over raw SQL | Type-safe queries, schema-first migrations |
| Next.js App Router | RSC for invitation performance, shared layout patterns |
| PWA for Scanner | Offline-first requirement for venue reliability |
