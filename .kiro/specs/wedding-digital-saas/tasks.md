# Implementation Plan: Wedding Digital SaaS Ecosystem

## Overview

This plan implements a multi-tenant Wedding Digital SaaS platform consisting of three frontend applications (Dashboard, Invitation, Scanner) sharing a single backend API. Implementation follows a bottom-up approach: database schema and shared packages first, then backend services, followed by frontend applications in order of dependency (Dashboard → Invitation → Scanner). TypeScript is used throughout with fast-check for property-based testing.

## Tasks

- [x] 1. Set up monorepo structure and shared packages
  - [x] 1.1 Initialize monorepo with workspace configuration
    - Create root `package.json` with npm/pnpm workspaces
    - Set up `apps/dashboard`, `apps/invitation`, `apps/scanner` directories with Next.js 16.2
    - Set up `packages/api`, `packages/db`, `packages/shared`, `packages/realtime` directories
    - Configure shared TypeScript config (`tsconfig.base.json`)
    - Configure ESLint and Prettier at root level
    - _Requirements: 12.1, 12.2_

  - [x] 1.2 Define shared types, constants, and utilities
    - Create `packages/shared/src/types/` with interfaces for Tenant, User, Event, Guest, QRCode, RSVP, CheckIn, InvitationSection, ScannerDevice, Message
    - Define enums: UserRole, GuestGroup, GuestType, AttendanceType, CheckInMethod, SectionType, EventStatus, ScannerLane
    - Create shared validation schemas (Zod 3.25) for input validation
    - Define error codes and response types
    - _Requirements: 2.5, 3.1, 5.2, 7.2, 8.5, 13.5_

  - [x] 1.3 Set up database schema and migrations
    - Configure Prisma 7.7 ORM in `packages/db`
    - Define all tables per data model: Tenant, User, Event, EventConfig, Guest, QRCode, RSVP, CheckIn, InvitationSection, ScannerDevice, Message
    - Add `tenant_id` column to all tenant-scoped tables
    - Create database indexes on: `qr_payload`, `guest.slug`, `event.slug`, `tenant_id`
    - Set up migration scripts
    - _Requirements: 1.1, 1.4, 12.6_

- [x] 2. Implement Authentication and Authorization service
  - [x] 2.1 Implement auth service with JWT and refresh token rotation
    - Create `packages/api/src/services/auth.service.ts`
    - Implement login with email/password validation
    - Implement JWT access token generation (15min expiry) and refresh token (7 day expiry)
    - Implement refresh token rotation (revoke old, issue new pair)
    - Implement bcrypt password hashing with cost factor 10
    - Implement account lockout after 5 failed attempts (15min duration)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.9, 2.10, 2.11_

  - [x]* 2.2 Write unit tests for auth service
    - Test valid login flow
    - Test invalid credentials (generic error message)
    - Test account lockout after 5 failures
    - Test refresh token rotation
    - Test expired token handling
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.3 Implement tenant isolation middleware and RBAC
    - Create middleware to extract `tenant_id` from authenticated session
    - Auto-filter all queries by `tenant_id`
    - Implement role-based access control for Admin, Client, WO, Scanner Operator
    - Return 403 Forbidden for cross-tenant access without revealing resource existence
    - Reject requests without valid `tenant_id`
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.5, 2.6, 2.7, 2.8_

  - [x]* 2.4 Write property test for tenant data isolation
    - **Property 1: Tenant Data Isolation**
    - **Property 19: Cross-Tenant Access Rejection**
    - **Validates: Requirements 1.2, 1.3**

  - [x]* 2.5 Write property test for role-based data access
    - **Property 3: Role-Based Data Access**
    - **Validates: Requirements 2.6, 2.7, 2.8**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Guest Management service
  - [x] 4.1 Implement guest CRUD and QR code generation
    - Create `packages/api/src/services/guest.service.ts`
    - Implement add guest with auto QR code generation (AES-256 encrypted payload containing guest_id + event_id)
    - Implement guest CRUD operations (create, read, update, delete)
    - Implement guest deactivation (deactivate QR on delete)
    - Implement guest listing with pagination (50 per page), filtering by group and status
    - Generate unique slug per guest for invitation URL
    - _Requirements: 3.1, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

  - [x] 4.2 Implement CSV bulk import for guests
    - Create CSV parser with validation (required: nama, grup; optional: phone, email, plus_one_count)
    - Validate each row: non-empty name, valid group enum, no duplicate names within event
    - Generate QR code for each valid guest
    - Return import report with success count and failed rows with reasons
    - Support max 2000 rows per file
    - _Requirements: 3.2, 3.3, 3.4_

  - [x]* 4.3 Write property test for QR code uniqueness
    - **Property 4: QR Code Uniqueness**
    - **Validates: Requirements 3.1, 3.3, 3.6**

  - [x]* 4.4 Write property test for QR code encryption
    - **Property 5: QR Code Encryption**
    - **Validates: Requirements 3.5, 13.1**

  - [x]* 4.5 Write property test for event data isolation within tenant
    - **Property 2: Event Data Isolation Within Tenant**
    - **Validates: Requirement 1.4**

- [x] 5. Implement RSVP service
  - [x] 5.1 Implement RSVP submission and update logic
    - Create `packages/api/src/services/rsvp.service.ts`
    - Implement RSVP creation with attendance choice (akad, resepsi, both, decline)
    - Validate guest_count: min 1, max plus_one_count + 1 (set to 0 if declined)
    - Implement upsert logic (update existing RSVP, not create new)
    - Trigger WebSocket broadcast on RSVP submit (< 500ms)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x]* 5.2 Write property test for RSVP guest count validation
    - **Property 6: RSVP Guest Count Validation**
    - **Validates: Requirements 4.3, 4.4**

  - [x]* 5.3 Write unit tests for RSVP service
    - Test valid RSVP submission
    - Test decline hides guest_count
    - Test guest_count exceeds limit rejection
    - Test RSVP update (upsert) behavior
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7_

- [x] 6. Implement Check-in and Scanner service
  - [x] 6.1 Implement QR scan verification with Redis duplicate detection
    - Create `packages/api/src/services/checkin.service.ts`
    - Decrypt QR payload and validate against database
    - Use Redis atomic operations for duplicate detection (< 200ms)
    - Return GREEN (valid, not checked-in), RED (invalid/not found/wrong event), or YELLOW (already checked-in with timestamp)
    - Ensure idempotency: only one check-in record per guest regardless of attempts
    - Handle concurrent scan from 2 devices (atomic Redis SET NX)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.8, 12.5_

  - [x] 6.2 Implement manual check-in and Go-Show registration
    - Implement guest search by name (partial match, min 3 chars, max 10 results)
    - Implement manual check-in for found guests (one-click)
    - Implement Go-Show registration (create guest with type="go_show", immediate check-in, method="go_show")
    - Broadcast check-in/Go-Show events via WebSocket (< 500ms)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x] 6.3 Implement scanner device management
    - Track active scanner devices per event
    - Enforce max 2 scanner devices per event
    - Reject 3rd device connection with error message
    - Track last_active_at for device heartbeat
    - _Requirements: 7.6, 7.7_

  - [x]* 6.4 Write property test for check-in idempotency
    - **Property 11: Check-in Idempotency**
    - **Validates: Requirements 7.5, 7.8**

  - [x]* 6.5 Write property test for scanner verification status mapping
    - **Property 10: Scanner Verification Status Mapping**
    - **Validates: Requirements 7.2, 7.3, 7.4**

  - [x]* 6.6 Write property test for scanner device limit
    - **Property 12: Scanner Device Limit**
    - **Validates: Requirement 7.6**

  - [x]* 6.7 Write property test for Go-Show guest tracking
    - **Property 13: Go-Show Guest Tracking**
    - **Validates: Requirements 8.5, 8.6**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement Real-time Sync service (WebSocket)
  - [x] 8.1 Implement WebSocket server with room-based connections
    - Create `packages/realtime/src/index.ts` with Socket.io 4.8 server
    - Implement room-based connections per event (join/leave event room)
    - Broadcast check-in events to all connected Dashboard clients
    - Broadcast RSVP updates to Dashboard clients
    - Ensure broadcast latency < 500ms
    - Implement connection status tracking (connected/disconnected indicator)
    - _Requirements: 9.1, 9.2, 9.3, 9.6, 9.8_

  - [x] 8.2 Implement real-time statistics aggregation
    - Calculate and broadcast updated stats on each event: total guests, total RSVP, total check-ins, total Go-Show
    - Ensure dashboard total_checked_in equals actual DB count on every broadcast
    - _Requirements: 9.6, 9.7_

  - [x]* 8.3 Write property test for WebSocket room isolation
    - **Property 14: WebSocket Room Isolation**
    - **Validates: Requirement 9.3**

  - [x]* 8.4 Write property test for real-time data consistency
    - **Property 16: Real-time Data Consistency**
    - **Validates: Requirement 9.7**

- [x] 9. Implement CMS service
  - [x] 9.1 Implement CMS CRUD for invitation sections
    - Create `packages/api/src/services/cms.service.ts`
    - Implement CRUD for 14 section types (cover, bride_groom, story, verse, countdown, akad_resepsi, rsvp, attire, gallery, video, gift, messages, closing, music)
    - Implement section activation/deactivation
    - Implement sort_order management with auto-resequencing (sequential, no gaps, starting from 1)
    - Store section-specific content as JSON per section type
    - _Requirements: 5.1, 5.2, 5.3, 5.9, 5.10, 5.11_

  - [x] 9.2 Implement media upload with validation
    - Implement file upload endpoint with Multer + Cloud Storage
    - Validate file format (JPEG, PNG, WebP for images; MP4, WebM for video)
    - Validate file size (max 5MB photos, 50MB video, 10MB general)
    - Implement virus scan integration
    - Return specific error messages for validation failures
    - _Requirements: 5.4, 5.5, 13.8, 13.9_

  - [x]* 9.3 Write property test for section sort order uniqueness
    - **Property 8: Section Sort Order Uniqueness**
    - **Validates: Requirement 5.9**

  - [x]* 9.4 Write property test for file upload explicit validation
    - **Property 22: File Upload Explicit Validation**
    - **Validates: Requirements 13.8, 13.9**

- [x] 10. Implement Security middleware and utilities
  - [x] 10.1 Implement PII encryption, rate limiting, CORS, and input validation
    - Implement AES-256 encryption for PII fields (phone, email) at rest
    - Implement rate limiting: 100 requests/min per tenant (return 429 on exceed)
    - Configure CORS to allow only registered origins per app
    - Implement server-side input validation (type, length max 1000 chars, format)
    - Return specific error messages for validation failures
    - _Requirements: 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

  - [x]* 10.2 Write property test for PII encryption at rest
    - **Property 17: PII Encryption at Rest**
    - **Validates: Requirement 13.2**

  - [x]* 10.3 Write property test for server-side input validation
    - **Property 18: Server-Side Input Validation**
    - **Validates: Requirements 13.5, 13.6**

- [x] 11. Implement Notification service
  - [x] 11.1 Implement invitation distribution via WhatsApp and Email
    - Create `packages/api/src/services/notification.service.ts`
    - Implement individual and bulk sending (max 500 per batch)
    - Include personalized invitation_url (`/{event-slug}?to={guest-slug}`)
    - Track delivery status per guest (belum dikirim, terkirim, gagal)
    - Disable sending when guest lacks both phone AND email
    - Log failed deliveries with error details
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

  - [x]* 11.2 Write property test for invitation sending contact completeness
    - **Property 20: Invitation Sending Contact Completeness**
    - **Validates: Requirement 14.5**

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement Client & WO Dashboard frontend
  - [x] 13.1 Set up Dashboard app with auth, layout, and theme system
    - Configure Next.js 16.2 app in `apps/dashboard` with TailwindCSS 4.1 and shadcn/ui
    - Implement login page and JWT auth flow (store tokens, auto-refresh)
    - Create responsive layout shell (sidebar, header, content area)
    - Implement dynamic theme system with 5 color properties (primary, secondary, accent, surface, text)
    - Apply theme changes in < 1 second without page reload
    - Provide 5 preset color palettes as inspiration references
    - Validate hex color format, reject invalid input with error message
    - Set Playfair Display for headings, Poppins for body
    - _Requirements: 2.1, 2.2, 11.1, 11.3, 11.4, 11.5, 11.6_

  - [x] 13.2 Implement Guest Management pages
    - Create guest list page with pagination (50/page), group/status filters
    - Create add/edit guest form (name, group, phone, email, plus_one_count)
    - Implement CSV import UI with progress and result report
    - Display QR code per guest
    - Show RSVP status and check-in status per guest
    - _Requirements: 3.1, 3.2, 3.5, 3.9, 3.10_

  - [x] 13.3 Implement CMS Editor pages
    - Create section list with drag-and-drop reordering
    - Create section editor forms for each of 14 section types
    - Implement media upload UI with format/size validation feedback
    - Implement section activation/deactivation toggles
    - Create invitation preview page
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [x] 13.4 Implement RSVP tracking and real-time dashboard
    - Create RSVP tracking page showing all guests with RSVP status, attendance choice, guest count, timestamp
    - Implement real-time statistics panel (total guests, RSVP count, check-in count, Go-Show count)
    - Connect to WebSocket for live updates
    - Show connection status indicator (terhubung/terputus)
    - _Requirements: 4.8, 9.6, 9.8_

  - [x] 13.5 Implement Notification/Invitation sending UI
    - Create invitation sending page with individual and bulk options (max 500 per batch)
    - Show delivery status per guest (belum dikirim, terkirim, gagal)
    - Disable send button when guest lacks both phone and email
    - Display failure notifications
    - _Requirements: 14.1, 14.3, 14.5, 14.6, 14.7_

  - [x]* 13.6 Write property test for theme application resilience
    - **Property 21: Theme Application Resilience**
    - **Validates: Requirement 11.7**

- [x] 14. Implement Wedding Invitation frontend
  - [x] 14.1 Set up Invitation app with dynamic rendering and personalization
    - Configure Next.js 16.2 app in `apps/invitation` with SSR/SSG
    - Implement URL routing: `/{event-slug}?to={guest-slug}`
    - Fetch event config and guest data from API
    - Render personalized cover with guest name
    - Show error page for invalid event-slug or guest-slug
    - Apply invitation theme (5 color properties from CMS)
    - Set Playfair Display for headings, Poppins for body
    - _Requirements: 6.1, 6.2, 6.3, 11.2_

  - [x] 14.2 Implement all 14 CMS-driven sections with lazy loading
    - Render only active sections in sort_order sequence
    - Implement lazy loading for images and media (viewport-based)
    - Implement scroll animations and section transitions (Motion 12.17)
    - Implement music player with play/pause control (only when music section active)
    - Implement countdown with "Tambah ke Kalender" button (.ics / Google Calendar link)
    - Implement Google Maps link for venue (only when akad_resepsi section active)
    - Target FCP < 3 seconds on mobile 3G
    - _Requirements: 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

  - [x] 14.3 Implement RSVP form and Messages section
    - Create RSVP form with attendance options (akad, resepsi, keduanya, menolak)
    - Show/hide guest_count field based on attendance choice
    - Validate guest_count against plus_one_count + 1
    - Implement messages form (sender name max 100 chars, message max 500 chars)
    - Display messages list with pagination (20 per page, newest first)
    - _Requirements: 4.1, 4.2, 4.3, 6.11, 6.12_

  - [x]* 14.4 Write property test for active section rendering
    - **Property 7: Active Section Rendering**
    - **Validates: Requirements 5.3, 6.4**

  - [x]* 14.5 Write property test for invitation personalization
    - **Property 9: Invitation Personalization**
    - **Validates: Requirements 6.1, 14.2**

- [x] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implement Scanner System frontend (PWA)
  - [x] 16.1 Set up Scanner PWA with service worker and offline capability
    - Configure Next.js 16.2 app in `apps/scanner` as PWA with service worker registration
    - Implement service worker for offline operation (cache app shell, static assets)
    - Implement local guest data cache (name, QR payload, check-in status) using IndexedDB
    - Refresh cache on connectivity and before event start
    - Implement offline queue for check-in records (capacity: 2000 entries with overflow handling — overwrite oldest synced records or show warning)
    - Auto-sync queued records on reconnect (chronological order by checked_in_at, within 30 seconds)
    - Apply idempotency on sync (ignore duplicates without error to operator)
    - Display offline/online mode indicator with clear visual distinction
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 16.2 Implement QR scanner camera and verification UI
    - Integrate html5-qrcode 2.3 for camera QR scanning
    - Send scanned payload to API for verification
    - Display GREEN screen (valid) with guest name and group (family/friend/colleague/VIP) for 5 seconds
    - Display RED screen (invalid/not found/wrong event) with error message
    - Display YELLOW screen (duplicate) with guest name and previous check-in timestamp
    - Return to scan-ready after 5 seconds or tap on screen
    - Verify against local cache when offline
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 12.1_

  - [x] 16.3 Implement manual check-in search and Go-Show registration
    - Create search bar with partial name match (min 3 chars input, max 10 results displayed)
    - Show check-in button for guests not yet checked-in
    - Show "Sudah Check-in" indicator for already checked-in guests (disable button)
    - Show "Tambah sebagai Go-Show" option when no results found
    - Create Go-Show registration form (nama required)
    - Display GREEN confirmation for 3 seconds on successful check-in/Go-Show
    - Preserve form data on server error
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7, 8.9_

  - [x] 16.4 Implement WebSocket connection and real-time sync
    - Connect to WebSocket server with event room using Socket.io client 4.8
    - Receive and apply real-time updates from other scanner devices
    - Handle reconnection gracefully (auto-reconnect with exponential backoff)
    - Sync offline queue on reconnect within 30 seconds
    - Update local cache after sync to reflect latest check-in states
    - _Requirements: 9.1, 9.4, 9.5_

  - [x]* 16.5 Write property test for offline sync completeness
    - **Property 15: Offline Sync Completeness**
    - **Validates: Requirements 9.5, 10.2, 10.3**

- [x] 17. Wire all components together and integration verification
  - [x] 17.1 Implement API gateway routing and connect all services
    - Set up Fastify 5.3 server in `packages/api` with all route handlers
    - Wire auth middleware to all protected routes
    - Wire tenant isolation middleware
    - Wire rate limiting middleware
    - Wire CORS configuration for Dashboard, Invitation, and Scanner origins
    - Connect WebSocket server to API events (check-in, RSVP, Go-Show broadcasts)
    - _Requirements: 1.2, 2.1, 13.3, 13.7_

  - [x] 17.2 Implement default theme and event creation flow
    - Apply default theme (dashboard + invitation) on new event creation
    - Handle theme application failure gracefully (create event without styling)
    - Initialize 14 sections with default sort_order on event creation
    - _Requirements: 11.7, 5.10_

  - [x]* 17.3 Write integration tests for end-to-end flows
    - Test: add guest → generate QR → scan QR → check-in → dashboard update
    - Test: RSVP submit → dashboard real-time update
    - Test: concurrent scanner operations (2 devices, same QR)
    - Test: offline scan → reconnect → sync → dashboard update
    - Test: Go-Show registration → dashboard update
    - _Requirements: 7.1, 8.8, 9.1, 9.5, 12.4_

- [x] 18. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check 4.2
- Unit tests validate specific examples and edge cases using Vitest 3.2
- All code uses TypeScript 5.9 throughout the monorepo
- UI text and labels are in Bahasa Indonesia; code is in English
- Performance targets: QR scan < 2s, Invitation FCP < 3s (3G), WebSocket < 500ms
- Backend uses Fastify 5.3 with Prisma 7.7 ORM
- Frontend uses Next.js 16.2 with React 19.2 and TailwindCSS 4.1
- Dashboard uses shadcn/ui (new-york style) with TailwindCSS 4 CSS-first configuration
- Scanner app uses html5-qrcode 2.3 for QR scanning and Socket.io client 4.8 for real-time
- Default dashboard theme palette: Sage Green (#A8BBA3), Cream (#F7F4EA), Warm Brown (#B87C4C), Blush (#EBD9D1), Dark Charcoal (#2D3436)
- Default invitation theme: Classic Sage & Gold — Sage Green (#5F7161), Light Sage (#A7C4A0), Gold (#C9A96E), Warm White (#FDFCF9)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.3"] },
    { "id": 3, "tasks": ["2.2", "2.4", "2.5"] },
    { "id": 4, "tasks": ["4.1", "4.2", "10.1"] },
    { "id": 5, "tasks": ["4.3", "4.4", "4.5", "5.1", "10.2", "10.3"] },
    { "id": 6, "tasks": ["5.2", "5.3", "6.1", "6.2", "6.3"] },
    { "id": 7, "tasks": ["6.4", "6.5", "6.6", "6.7", "8.1"] },
    { "id": 8, "tasks": ["8.2", "8.3", "8.4", "9.1", "9.2"] },
    { "id": 9, "tasks": ["9.3", "9.4", "11.1"] },
    { "id": 10, "tasks": ["11.2", "13.1", "14.1"] },
    { "id": 11, "tasks": ["13.2", "13.3", "13.4", "13.5", "14.2", "14.3"] },
    { "id": 12, "tasks": ["13.6", "14.4", "14.5", "16.1"] },
    { "id": 13, "tasks": ["16.2", "16.3", "16.4"] },
    { "id": 14, "tasks": ["16.5", "17.1", "17.2"] },
    { "id": 15, "tasks": ["17.3"] }
  ]
}
```
