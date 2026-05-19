# Components

## Component Map

```mermaid
graph TB
    subgraph "Frontend Apps"
        D["Dashboard"]
        I["Invitation"]
        S["Scanner"]
    end

    subgraph "Backend Packages"
        API["API Server"]
        RT["Realtime"]
        DB["Database"]
        SH["Shared"]
    end

    D --> API
    I --> API
    S --> API
    S --> RT
    D --> RT
    API --> DB
    API --> SH
    RT --> DB
    D --> SH
    I --> SH
    S --> SH
```

## Backend Components

### API Server (`packages/api`)

The central backend service handling all REST endpoints and coordinating business logic.

```mermaid
graph TB
    subgraph "packages/api/src"
        Index["index.ts<br/>(Server bootstrap, graceful shutdown)"]
        Config["config/<br/>(DB, Redis, logger, production, encryption, secret-rotation)"]
        MW["middleware/<br/>(CORS, rate-limit, RBAC, tenant-isolation, encryption, input-validation, media-upload)"]
        Plugins["plugins/<br/>(audit-logger, response-cache, security-headers, rate-limiter, CORS, request-validation)"]
        Routes["routes/<br/>(thin HTTP adapters — no Prisma, no business logic)"]
        Services["services/<br/>(Business logic: slug generation, QR, PII, deduplication)"]
        Repos["repositories/<br/>(Prisma adapters — all queries scoped by tenant_id)"]
    end

    Index --> Config
    Index --> MW
    Index --> Plugins
    Index --> Routes
    Routes --> Services
    Services --> Repos
```

#### Services

| Service | File | Responsibility |
|---------|------|----------------|
| `AuthService` | `auth.service.ts` | Login, JWT generation/verification, password hashing, token refresh, account lockout |
| `GuestService` | `guest.service.ts` | CRUD guests, QR code generation, encrypted payloads, slug generation |
| `CheckInService` | `checkin.service.ts` | QR verification, manual check-in, go-show registration, duplicate detection |
| `RsvpService` | `rsvp.service.ts` | RSVP submission and retrieval |
| `CMSService` | `cms.service.ts` | Section CRUD, sort order management, toggle active state |
| `EventService` | `event.service.ts` | Event creation with default sections and theme |
| `NotificationService` | `notification.service.ts` | Bulk invitation sending (WhatsApp/Email), delivery status tracking |
| `ScannerDeviceService` | `scanner-device.service.ts` | Device registration, lane assignment, heartbeat, max 2 per event |
| `MediaUploadService` | `media-upload.service.ts` | File validation, virus scanning, cloud storage upload |
| `StorageService` | `storage.ts` | R2 client, signed URLs, tenant quota management |
| `GuestImportService` | `guest-import.service.ts` | CSV parsing, bulk import (max 2000 rows), cross-batch deduplication by name within event |
| `AdminService` | `admin.service.ts` | Platform admin features: platform KPIs, tenant management, user listing, password resets, system audit logs |


#### Middleware Stack

| Middleware | Purpose |
|-----------|---------|
| CORS | Per-app origin validation (Dashboard, Invitation, Scanner) |
| Rate Limiter | 100 req/min per tenant (Redis-backed, in-memory fallback) |
| Tenant Isolation | Extract `tenant_id` from JWT, scope all queries |
| RBAC | Role-based route access (Admin, Client, WO, Scanner) |
| Input Validation | Zod schema validation on request bodies |
| PII Encryption | Encrypt/decrypt guest contact info at rest |
| Media Upload | File type/size validation, virus scanning |

#### Plugins

| Plugin | Purpose |
|--------|---------|
| Audit Logger | Auto-log sensitive operations (login, export, bulk actions) |
| Response Cache | Redis-backed caching with pattern-based invalidation on writes |
| Security Headers | HSTS, X-Frame-Options, CSP-ready headers |
| Request Validation | Content-type enforcement, file upload route detection |

### Realtime Server (`packages/realtime`)

```mermaid
graph TB
    subgraph "packages/realtime/src"
        Entry["index.ts<br/>(createRealtimeServer, broadcast functions)"]
        AuthMW["middleware/auth.ts<br/>(JWT validation, room authorization)"]
        Stats["stats.ts<br/>(Real-time stats aggregation)"]
        Config["config/production.ts<br/>(Redis adapter, production Socket.io config)"]
        Lifecycle["lifecycle/graceful-shutdown.ts<br/>(SIGTERM/SIGINT handlers)"]
    end
```

**Broadcast Functions**: `broadcastCheckIn`, `broadcastRsvpUpdate`, `broadcastGoShow`, `broadcastStats`

### Database (`packages/db`)

| Component | Purpose |
|-----------|---------|
| `prisma/schema.prisma` | 12 models, 10 enums, multi-tenant schema |
| `prisma/seed.ts` | Demo data seeding (admin + scanner users) |
| `src/client.ts` | Prisma client factory with production pool config |

### Shared (`packages/shared`)

| Component | Purpose |
|-----------|---------|
| `types/validation.ts` | Zod schemas for all input validation |
| `types/interfaces.ts` | TypeScript interfaces for domain entities |
| `types/enums.ts` | 11 enums (UserRole, GuestGroup, SectionType, etc.) |
| `types/responses.ts` | API response type definitions |
| `types/errors.ts` | ErrorCode enum for standardized error handling |
| `utils/sanitize.ts` | HTML sanitization for user-generated content |

## Frontend Components

### Dashboard (`apps/dashboard`)

```mermaid
graph TB
    subgraph "App Router Pages"
        Login["login/page.tsx"]
        Home["(dashboard)/page.tsx"]
        Guests["guests/page.tsx"]
        CMS["cms/page.tsx"]
        CMSEdit["cms/edit/[sectionId]/page.tsx"]
        CMSPreview["cms/preview/page.tsx"]
        Theme["theme/page.tsx"]
        RSVP["rsvp/page.tsx"]
        Notifications["notifications/page.tsx"]
        AdminLayout["admin/layout.tsx"]
        AdminOverview["admin/overview/page.tsx"]
        AdminTenants["admin/tenants/page.tsx"]
        AdminUsers["admin/users/page.tsx"]
        AdminAudit["admin/audit-logs/page.tsx"]
    end

    subgraph "Key Components"
        Layout["layout/DashboardLayout + Sidebar + Header"]
        GuestTable["guests/GuestTable + Filters + AddModal + CSVImport + QRModal"]
        CMSComp["cms/SectionList + SectionEditorForm + MediaUpload"]
        Forms["cms/forms/ (14 section-specific forms)"]
        UI["ui/ (shadcn: Button, Dialog, Table, Card, Select, etc.)"]
    end

    subgraph "Hooks & Lib"
        UseSocket["hooks/use-socket.ts"]
        UseStats["hooks/use-realtime-stats.ts"]
        AuthLib["lib/auth.ts"]
        APILib["lib/api.ts"]
        CMSLib["lib/cms.ts"]
        ThemeLib["lib/theme.ts"]
        SocketLib["lib/socket.ts"]
    end
```

### Invitation (`apps/invitation`)

```mermaid
graph TB
    subgraph "App Router"
        SlugPage["[eventSlug]/page.tsx<br/>(generateMetadata, SSR)"]
        InvView["invitation-view.tsx<br/>(SectionRenderer)"]
        Preview["preview/page.tsx"]
    end

    subgraph "14 Section Components"
        Cover["InvitationCover"]
        BrideGroom["BrideGroomSection"]
        Story["StorySection"]
        Verse["VerseSection"]
        Countdown["CountdownSection"]
        AkadResepsi["AkadResepsiSection"]
        RSVP["RsvpSection + RsvpForm"]
        Attire["AttireSection"]
        Gallery["GallerySection"]
        Video["VideoSection"]
        Gift["GiftSection"]
        Messages["MessagesSection"]
        Closing["ClosingSection"]
        Music["MusicPlayer"]
    end

    subgraph "Lib"
        APIClient["lib/api.ts (fetchInvitationData, submitRsvp, submitMessage)"]
        Personalization["lib/personalization.ts (URL → guest name)"]
        SectionRendering["lib/section-rendering.ts"]
        ThemeProvider["components/theme-provider.tsx"]
    end
```

### Scanner (`apps/scanner`)

```mermaid
graph TB
    subgraph "App Router"
        ScanPage["page.tsx (main scanner)"]
        ManualPage["manual/page.tsx"]
    end

    subgraph "Components"
        QRScanner["QRScanner (html5-qrcode)"]
        VerResult["VerificationResultDisplay"]
        ManualCI["ManualCheckIn (search + check-in)"]
        GoShow["GoShowForm"]
        AuthProv["AuthProvider"]
        WSProv["WebSocketProvider"]
        PWAProv["PWAProvider"]
        EventSel["EventSelector"]
        Connectivity["ConnectivityIndicator"]
    end

    subgraph "Lib (Offline-First)"
        IndexedDB["indexed-db.ts (guest cache, queue)"]
        OfflineQueue["offline-queue.ts"]
        SyncManager["sync-manager.ts"]
        CheckinSvc["checkin-service.ts (online/offline verify)"]
        AuthClient["auth.ts (token management, device registration)"]
        WS["websocket.ts (useWebSocket hook)"]
        SWReg["service-worker-registration.ts"]
    end

    subgraph "Public"
        SW["sw.js (Service Worker)"]
    end
```

## Cross-Cutting Concerns

| Concern | Implementation |
|---------|---------------|
| Authentication | JWT tokens validated in API middleware and WebSocket handshake |
| Tenant Isolation | Middleware injects `tenant_id` into all service calls |
| Real-time Updates | Socket.io rooms scoped per event, broadcast on state changes |
| Offline Support | Scanner: IndexedDB queue + service worker + background sync |
| Input Validation | Zod schemas in `packages/shared`, enforced in API middleware |
| Error Handling | Standardized `ErrorCode` enum, typed error responses |
| Caching | Redis response cache with pattern-based invalidation |
| Audit Logging | Auto-logged for sensitive operations |
