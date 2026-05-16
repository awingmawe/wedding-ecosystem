# Workflows

## Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant DB

    User->>Frontend: Enter email + password
    Frontend->>API: POST /auth/login
    API->>DB: Find user by email
    DB-->>API: User record
    API->>API: bcrypt.compare(password, hash)
    alt Invalid credentials
        API-->>Frontend: 401 AUTH_2001
    else Account locked
        API-->>Frontend: 423 AUTH_2003
    else Success
        API->>API: Generate JWT (15min) + Refresh (7d)
        API-->>Frontend: {user, tokens}
        Frontend->>Frontend: Store tokens in memory/localStorage
    end

    Note over Frontend,API: Token Refresh (before expiry)
    Frontend->>API: POST /auth/refresh {refresh_token}
    API->>API: Verify refresh token
    API-->>Frontend: New {access_token, refresh_token}
```

## Guest Management Flow

```mermaid
sequenceDiagram
    participant Client as Dashboard User
    participant API
    participant DB
    participant QR as QR Generator

    Client->>API: POST /events/:id/guests {name, group, phone}
    API->>API: Validate input (Zod)
    API->>API: Generate unique slug from name
    API->>DB: Insert guest record
    API->>QR: Generate encrypted QR payload
    QR-->>API: {qr_payload, qr_image_url}
    API->>DB: Insert QR code record
    API-->>Client: Guest + QR code

    Note over Client,API: CSV Bulk Import
    Client->>API: POST /events/:id/guests/import (CSV file)
    API->>API: Parse CSV, validate rows (max 2000)
    API->>DB: Bulk insert valid guests
    API->>QR: Generate QR for each guest
    API-->>Client: CsvImportReport {success_count, failed_rows}
```

## RSVP Flow

```mermaid
sequenceDiagram
    participant Guest as Guest (Invitation)
    participant API
    participant DB
    participant WS as WebSocket

    Guest->>API: POST /events/:id/rsvp {guest_id, attendance, guest_count}
    API->>API: Validate (no auth required)
    API->>DB: Upsert RSVP record
    API->>WS: broadcastRsvpUpdate(event_id, rsvp_data)
    WS-->>Dashboard: rsvp_updated event
    API-->>Guest: Success confirmation
```

## QR Check-in Flow

```mermaid
sequenceDiagram
    participant Scanner as Scanner App
    participant API
    participant DB
    participant WS as WebSocket
    participant Dashboard

    Scanner->>API: POST /events/:id/checkin/verify {qr_payload}
    API->>API: Decrypt QR payload → {guest_id, event_id}
    API->>DB: Find guest by ID + event
    alt QR Invalid
        API-->>Scanner: 🔴 RED {status: "invalid"}
    else Already Checked In
        API->>DB: Find existing check-in
        API-->>Scanner: 🟡 YELLOW {status: "duplicate", checked_in_at}
    else Valid
        API->>DB: Insert check-in record
        API->>WS: broadcastCheckIn(event_id, guest_data)
        WS-->>Dashboard: guest_checked_in
        WS-->>Scanner: guest_checked_in
        API-->>Scanner: 🟢 GREEN {status: "valid", guest_name, group}
    end
```

## Offline Check-in Flow (Scanner PWA)

```mermaid
sequenceDiagram
    participant Scanner
    participant IndexedDB
    participant SW as Service Worker
    participant API

    Note over Scanner: Device goes offline
    Scanner->>Scanner: Scan QR code
    Scanner->>IndexedDB: Check cached guest data
    alt Found in cache
        IndexedDB-->>Scanner: Guest data
        Scanner->>IndexedDB: Enqueue check-in
        Scanner-->>Scanner: 🟢 GREEN (offline)
    else Not found
        Scanner-->>Scanner: 🔴 RED (cannot verify offline)
    end

    Note over Scanner: Device comes back online (within 30s)
    SW->>IndexedDB: Get pending check-ins
    IndexedDB-->>SW: Queued records
    SW->>API: POST /checkin/verify (batch)
    alt Conflict (already checked in on another device)
        API-->>SW: Duplicate response
        SW->>IndexedDB: Mark as synced (server wins)
    else Success
        API-->>SW: Confirmed
        SW->>IndexedDB: Mark as synced
    end
```

## Go-Show Registration Flow

```mermaid
sequenceDiagram
    participant Operator as Scanner Operator
    participant API
    participant DB
    participant WS as WebSocket

    Operator->>API: POST /events/:id/checkin/go-show {name}
    API->>API: Create temporary guest record (type: go_show)
    API->>DB: Insert guest (no QR, no invitation)
    API->>DB: Insert check-in (method: go_show)
    API->>WS: broadcastGoShow(event_id, guest_data)
    WS-->>Dashboard: go_show_added
    API-->>Operator: Success + guest details
```

## CMS Section Management Flow

```mermaid
sequenceDiagram
    participant Client as Dashboard User
    participant API
    participant DB

    Note over Client: Initial event creation
    API->>DB: Create 14 default sections (all active, default order)

    Note over Client: Edit section content
    Client->>API: PUT /sections/:id/content {content JSON}
    API->>API: Validate content schema per section_type
    API->>DB: Update section content
    API-->>Client: Updated section

    Note over Client: Reorder sections (drag & drop)
    Client->>API: PUT /sections/sort {ordered_ids: [...]}
    API->>DB: Update sort_order for each section
    API-->>Client: Success

    Note over Client: Toggle section visibility
    Client->>API: PUT /sections/:id/toggle
    API->>DB: Flip is_active boolean
    API-->>Client: Updated section
```

## Invitation Rendering Flow

```mermaid
sequenceDiagram
    participant Guest as Guest Browser
    participant Next as Next.js (SSR)
    participant API
    participant DB

    Guest->>Next: GET /{event-slug}?to={guest-slug}
    Next->>API: GET /invitations/{event-slug}
    API->>DB: Find event by slug
    API->>DB: Get active sections (sorted)
    API->>DB: Get event config (theme)
    API-->>Next: {event, sections, config, guest_slug}
    Next->>Next: Apply theme CSS variables
    Next->>Next: Render SectionRenderer (dynamic components)
    Next->>Next: Personalize cover with guest name
    Next-->>Guest: Full invitation page (animated)
```

## Notification Sending Flow

```mermaid
sequenceDiagram
    participant Client as Dashboard User
    participant API
    participant DB
    participant WA as WhatsApp Provider
    participant Email as Email Provider

    Client->>API: POST /notifications/bulk {guest_ids, channel}
    API->>API: Validate (max 500 per batch)
    API->>DB: Fetch guests with contact info
    API->>API: Decrypt PII (phone/email)

    loop For each guest
        alt Channel = WhatsApp
            API->>WA: Send personalized invitation link
            WA-->>API: Delivery status
        else Channel = Email
            API->>Email: Send invitation email
            Email-->>API: Delivery status
        end
        API->>DB: Update delivery_status (sent/failed)
    end

    API-->>Client: Bulk send report
```

## Deployment Flow

```mermaid
graph TB
    Push["Push to main"]
    CI["CI Pipeline<br/>(tests, lint, security audit, type-check)"]
    Gate{CI Pass?}
    FE["Frontend Deploy<br/>(Vercel per changed app)"]
    BE["Backend Deploy<br/>(Railway blue-green)"]
    Migrate["DB Migration<br/>(prisma migrate deploy)"]
    Health["Health Check<br/>(3 min, 3 consecutive)"]
    Swap["Swap Traffic"]
    Smoke["Smoke Tests<br/>(HTTP + asset check)"]
    Rollback["Auto-Rollback"]

    Push --> CI
    CI --> Gate
    Gate -->|Yes| FE
    Gate -->|Yes| BE
    Gate -->|No| Stop["Block deploy"]
    BE --> Migrate
    Migrate --> Health
    Health -->|Pass| Swap
    Health -->|Fail| Rollback
    Swap --> Smoke
    FE --> Smoke
```

## Scanner Device Registration Flow

```mermaid
sequenceDiagram
    participant Operator
    participant Scanner as Scanner App
    participant API
    participant DB

    Operator->>Scanner: Login
    Scanner->>API: POST /auth/login
    API-->>Scanner: JWT tokens

    Operator->>Scanner: Select event
    Scanner->>API: GET /events
    API-->>Scanner: Event list

    Scanner->>API: POST /events/:id/scanner/register {device_name}
    API->>DB: Check active devices (max 2)
    alt Max reached
        API-->>Scanner: Error (max 2 devices)
    else Available
        API->>API: Assign lane (lane_1 or lane_2)
        API->>DB: Insert scanner device
        API-->>Scanner: {device_id, lane}
    end

    Note over Scanner,API: Heartbeat (periodic)
    Scanner->>API: POST /scanner/heartbeat
    API->>DB: Update last_active_at
```

## Real-Time Stats Aggregation

```mermaid
sequenceDiagram
    participant Trigger as Check-in/RSVP Event
    participant Stats as StatsService
    participant DB
    participant WS as WebSocket
    participant Dashboard

    Trigger->>Stats: calculateAndBroadcastStats(event_id)
    Stats->>DB: Count total guests
    Stats->>DB: Count RSVPs by type
    Stats->>DB: Count check-ins
    Stats->>DB: Count go-shows
    Stats->>Stats: Aggregate EventStats
    Stats->>WS: broadcastStats(event_id, stats)
    WS-->>Dashboard: stats_updated
```
