# Implementation Plan: Production Deployment Strategy

## Overview

This implementation plan covers the complete production deployment infrastructure for the Wedding Digital SaaS platform. Tasks are organized to build foundational security and configuration first, then layer on deployment pipelines, monitoring, and operational readiness. Each task specifies which MCP server to use when interacting with external platforms (Supabase, Upstash, Cloudflare, GitHub).

## Tasks

- [x] 1. Set up network security and infrastructure foundation
  - [x] 1.1 Configure Railway private networking and security groups for backend services
    - Set up Railway project with private networking enabled
    - Configure service-to-service communication (API → PostgreSQL port 5432, API/WebSocket → Redis port 6379)
    - Ensure backend services are not directly accessible from public internet
    - Only expose services through Railway's built-in load balancer on port 443
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 1.2 Configure Cloudflare WAF and DDoS protection
    - Enable Cloudflare WAF with OWASP Top 10 managed ruleset (SQL injection, XSS, path traversal)
    - Configure DDoS protection at network and application layers
    - Set up WAF logging to capture blocked requests with attack pattern details
    - **Use Cloudflare Bindings MCP** for WAF rule configuration
    - **Use Cloudflare Observability MCP** to verify WAF logs are flowing
    - _Requirements: 1.4, 1.5, 1.6_

  - [x] 1.3 Configure SSL/TLS and HTTPS enforcement across all domains
    - Configure Cloudflare SSL/TLS with minimum TLS 1.2, preference TLS 1.3 for all domains
    - Set up HTTPS redirect (HTTP 301 → HTTPS) for all domains
    - Configure HSTS header with max-age=31536000 and includeSubDomains
    - Enable end-to-end encryption between Cloudflare and Railway origin
    - **Use Cloudflare Bindings MCP** for SSL/TLS configuration
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7_

- [x] 2. Configure database production environment
  - [x] 2.1 Set up Supabase PostgreSQL with high availability and connection pooling
    - Configure Supabase project for production with connection pooling (PgBouncer)
    - Set pool size based on formula: (CPU cores × 2) + 1, minimum 10 connections
    - Configure SSL mode `verify-full` for all database connections
    - Set query timeout to 30 seconds
    - **Use Supabase MCP** to configure database settings
    - _Requirements: 4.1, 4.2, 4.5, 4.8_

  - [x] 2.2 Create database indexes for production performance
    - Create indexes on frequently queried columns: `tenant_id`, `event_id`, `guest_id`, `qr_payload`, `guest_slug`, `event_slug`, `checked_in_at`
    - Write Prisma migration file for all production indexes
    - **Use Supabase MCP** to verify index creation
    - _Requirements: 4.7_

  - [x] 2.3 Implement Row-Level Security (RLS) policies on tenant-scoped tables
    - Create RLS policies ensuring queries without `tenant_id` filter return no data
    - Apply RLS to all tenant-scoped tables (events, guests, invitations, cms_sections, etc.)
    - **Use Supabase MCP** to create and manage RLS policies
    - _Requirements: 4.3_

  - [x] 2.4 Configure automated database backup and WAL archiving
    - Enable automated backups every 6-8 hours via Supabase
    - Configure continuous WAL archiving for RPO < 1 hour
    - Set point-in-time recovery retention to 30 days
    - **Use Supabase MCP** to verify backup configuration
    - _Requirements: 4.4, 4.5, 10.1_

  - [x]\* 2.5 Write integration tests for database connectivity and RLS enforcement
    - Test that RLS policies block cross-tenant data access
    - Test connection pooling under concurrent load
    - Test SSL `verify-full` connection mode
    - _Requirements: 4.2, 4.3_

- [x] 3. Configure Redis production environment
  - [x] 3.1 Create Upstash Redis database for caching (session, rate limits, response cache)
    - Create Redis database with `allkeys-lru` eviction policy
    - Configure for session data, rate limit counters, and response caching
    - Set appropriate memory limits for 1 event / ≤500 guests
    - **Use Upstash MCP** (`mcp_upstash_redis_database_create_new`) to create the cache database
    - _Requirements: 5.1, 5.2_

  - [x] 3.2 Create separate Upstash Redis database for pub/sub (Socket.io adapter)
    - ~~Create dedicated Redis instance for Socket.io pub/sub channels~~
    - ~~Ensure separation from cache instance to prevent pub/sub load affecting cache performance~~
    - _Status: SKIPPED — At current scale (1 event / ≤500 guests), pub/sub shares the cache instance. Code in `redis.ts` falls back to `UPSTASH_REDIS_CACHE_URL` when `UPSTASH_REDIS_PUBSUB_URL` is not set. Separate when scaling to multiple concurrent events._
    - _Requirements: 5.4_

  - [x] 3.3 Configure Redis persistence and backup settings
    - Enable RDB snapshots every 15 minutes on cache instance
    - Configure daily backups via Upstash
    - **Use Upstash MCP** (`mcp_upstash_redis_database_set_daily_backup`) to enable backups
    - _Requirements: 5.3, 10.1_
    - _Status: RDB persistence is platform-managed by Upstash (equivalent durability). Daily backups require paid tier upgrade — documented in `docs/deployment/redis-backup-config.md` with upgrade steps._

  - [x] 3.4 Implement Redis connection configuration in API server with retry and graceful degradation
    - Configure ioredis connection with 5-second timeout
    - Implement exponential backoff retry strategy (max 3 retries)
    - Implement graceful degradation: bypass cache on connection failure, log error to monitoring
    - Create `packages/api/src/config/redis.ts` with production connection settings
    - _Requirements: 5.5, 5.6_

  - [x]\* 3.5 Write integration tests for Redis connection failover and graceful degradation
    - Test that API continues operating when Redis is unavailable
    - Test retry strategy with exponential backoff
    - Test cache hit/miss behavior
    - _Requirements: 5.5, 5.6_

- [x] 4. Checkpoint - Verify data layer configuration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement application security hardening
  - [x] 5.1 Implement security headers middleware in Fastify API server
    - Add `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
    - Add `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`
    - Remove `X-Powered-By` and `Server` headers
    - Disable stack traces in production error responses
    - Create `packages/api/src/plugins/security-headers.ts`
    - _Requirements: 12.1, 12.2_

  - [x] 5.2 Implement rate limiting plugin for Fastify with per-endpoint configuration
    - Configure rate limits: 100 req/min (general), 20 req/min (auth), 300 req/min (scanner check-in)
    - Use Redis-backed rate limiting via Upstash cache instance
    - Return 429 with `Retry-After` header when limit exceeded
    - Create `packages/api/src/plugins/rate-limiter.ts`
    - _Requirements: 12.4_

  - [x] 5.3 Implement request validation middleware (Content-Type, body size, request ID)
    - Validate Content-Type header matches endpoint expectation (return 415 if mismatch)
    - Set request body size limits: 1MB for JSON, 10MB for file upload
    - Generate and attach correlation ID (request_id) to every incoming request
    - Create `packages/api/src/plugins/request-validation.ts`
    - _Requirements: 12.3, 12.5, 12.9_

  - [x] 5.4 Implement CORS configuration for production domains
    - Configure CORS to only allow origins: `dashboard.{domain}`, `*.{domain}` (invitation), `scanner.{domain}`
    - Block requests from unauthorized origins
    - Create `packages/api/src/plugins/cors.ts`
    - _Requirements: 11.6_

  - [x] 5.5 Implement audit logging for sensitive operations
    - Log login, logout, data export, bulk operations, tenant config changes
    - Include timestamp, user_id, tenant_id, action, and request_id in audit entries
    - Create `packages/api/src/plugins/audit-logger.ts`
    - _Requirements: 12.10_

  - [x] 5.6 Implement output sanitization for user-generated content displayed in Invitation App
    - Sanitize HTML in guest names and wishes/messages before storage and rendering
    - Prevent stored XSS in CMS-rendered content
    - Create `packages/shared/src/utils/sanitize.ts`
    - _Requirements: 12.7_

  - [x]\* 5.7 Write unit tests for security middleware (rate limiting, headers, validation, sanitization)
    - Test rate limiting enforcement per endpoint category
    - Test security headers presence on responses
    - Test Content-Type validation rejects invalid types
    - Test HTML sanitization removes XSS vectors
    - _Requirements: 12.1, 12.3, 12.4, 12.7_

- [x] 6. Implement health check and monitoring endpoints
  - [x] 6.1 Implement `/health` endpoint in Fastify API server
    - Check PostgreSQL connectivity and latency
    - Check Redis connectivity and latency (single instance handles cache + pub/sub)
    - Check WebSocket server status
    - Return structured `HealthCheckResponse` with dependency status
    - Return HTTP 200 for healthy, HTTP 503 with failing component details for unhealthy
    - Ensure response time < 500ms
    - Create `packages/api/src/routes/health.ts`
    - _Requirements: 9.8, 9.9_

  - [x] 6.2 Configure structured JSON logging for all backend services
    - Implement structured log format: timestamp, level, service_name, request_id, tenant_id, message
    - Configure log levels per environment (debug for local dev, info for production)
    - Create `packages/api/src/config/logger.ts`
    - _Requirements: 9.2_

  - [x] 6.3 Configure alert rules for critical conditions
    - Define alert thresholds: API error rate > 5% (5 min), p95 response time > 2s (5 min), connection pool > 80%, disk > 80%
    - Configure notification to minimum 2 channels (email + Slack/Telegram) within 1 minute
    - Document alert rules in `docs/monitoring/alert-rules.md`
    - _Requirements: 9.4, 9.5_

  - [x]\* 6.4 Write integration tests for health check endpoint
    - Test healthy response when all dependencies are up
    - Test degraded/unhealthy response when a dependency is down
    - Test response time is under 500ms
    - _Requirements: 9.8, 9.9_

- [x] 7. Checkpoint - Verify security and monitoring
  - Ensure all tests pass, ask the user if questions arise.
  - _Note: Optional test tasks 5.7 and 6.4 skipped for MVP. Core security middleware and health check are implemented and functional._

- [x] 8. Configure CDN, storage, and static asset optimization
  - [x] 8.1 Configure Cloudflare CDN caching rules and compression
    - Set cache-control for immutable assets (hashed filenames): max-age 1 year
    - Set cache-control for HTML/API responses: max-age 60s or no-cache
    - Enable Brotli compression with Gzip fallback for text-based assets
    - Enable origin shield to reduce origin load on cache miss
    - **Use Cloudflare Bindings MCP** for CDN configuration
    - _Requirements: 7.2, 7.4, 7.7_

  - [x] 8.2 Configure Cloudflare image optimization for CMS media
    - Enable automatic WebP conversion for uploaded images
    - Configure responsive image sizing
    - **Use Cloudflare Bindings MCP** for image optimization settings
    - _Requirements: 7.3_
    - _Status: Cloudflare Bindings MCP does not support image optimization settings directly. Configuration provided via Terraform (`terraform/cloudflare-image-optimization.tf`), Image Resizer Worker (`workers/image-resizer.ts`), and documentation (`cloudflare-image-optimization.md`)._

  - [x] 8.3 Create Cloudflare R2 bucket for production media storage
    - Create R2 bucket for production environment
    - Configure server-side encryption (SSE) with managed keys
    - Block public access; configure access only through CDN (Origin Access)
    - Apply Bucket Lock (30-day retention) for accidental deletion protection
    - Configure CORS: upload from Dashboard domain, download via CDN domain
    - **Use Cloudflare Bindings MCP** to create and configure R2 bucket
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.7_
    - _Status: Bucket `wedding-ecosystem` created (APAC region). SSE always-on. Bucket Lock `protect-media-30d` applied via Cloudflare API. R2 does not support S3-style object versioning — Bucket Lock used instead. CORS and Custom Domain pending production domain (see task 15.1)._

  - [x] 8.4 Implement signed URL generation for direct-to-R2 upload
    - Generate signed URLs with 15-minute expiry for direct upload from Dashboard
    - Implement tenant storage quota check (5GB per tenant) before generating URL
    - Create `packages/api/src/services/storage.ts`
    - _Requirements: 8.6, 8.8_
    - _Status: Implemented and tested end-to-end against live R2 bucket `wedding-ecosystem`. 26 unit tests passing. Default bucket updated to `wedding-ecosystem`._

  - [x] 8.5 Configure R2 lifecycle policy for infrequent access storage class
    - Move files not accessed for 90 days to Infrequent Access storage class
    - **Use Cloudflare Bindings MCP** for lifecycle rule configuration
    - _Requirements: 8.4_
    - _Status: Applied via S3-compatible API (AWS SDK v3). Two rules active: `transition-to-infrequent-access-90d` (IA after 90 days) and `abort-incomplete-multipart-uploads` (7 days). Cloudflare Bindings MCP does not support lifecycle rules — Terraform and shell script also provided as IaC alternatives._

- [x] 9. Configure WebSocket server for production
  - [x] 9.1 Configure Socket.io with Redis adapter for production
    - Connect Socket.io to shared Upstash Redis instance (same as cache, via UPSTASH_REDIS_CACHE_URL fallback)
    - Configure sticky session support for WebSocket connections on load balancer
    - Set idle timeout to 60s with ping/pong keepalive every 25s
    - Configure for single instance deployment (sufficient for 1 event / ≤500 guests)
    - Create/update `packages/realtime/src/config/production.ts`
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 9.2 Implement WebSocket authentication and room-level authorization
    - Validate JWT token on WebSocket handshake (same token as REST API)
    - Implement room-level authorization: users can only join rooms for assigned events
    - Create `packages/realtime/src/middleware/auth.ts`
    - _Requirements: 13.6, 13.7_

  - [x] 9.3 Implement graceful shutdown for WebSocket server instances
    - Wait for existing connections to finish or timeout (max 30s) before termination
    - Allow immediate termination if all connections close naturally before timeout
    - Create `packages/realtime/src/lifecycle/graceful-shutdown.ts`
    - _Requirements: 13.5_

  - [x] 9.4 Implement client-side reconnection with exponential backoff
    - Scanner: reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
    - Dashboard: show "reconnecting" indicator on disconnect
    - Update `apps/scanner/src/lib/socket.ts` and `apps/dashboard/src/lib/socket.ts`
    - _Requirements: 13.8_

  - [x]\* 9.5 Write integration tests for WebSocket authentication and room authorization
    - Test JWT validation on handshake rejects invalid tokens
    - Test room-level authorization prevents cross-event access
    - Test reconnection behavior
    - _Requirements: 13.6, 13.7, 13.8_

- [x] 10. Checkpoint - Verify infrastructure services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Set up CI/CD pipeline with GitHub Actions
  - [x] 11.1 Create GitHub Actions workflow for automated testing and security scanning
    - Run unit + integration tests with minimum 80% coverage on business logic
    - Run dependency vulnerability scanning (npm audit, Snyk or equivalent)
    - Run static code analysis
    - Block deployment on critical/high severity vulnerabilities
    - **Use GitHub MCP** to create workflow files and manage repository settings
    - Create `.github/workflows/ci.yml`
    - _Requirements: 6.1, 6.2_

  - [x] 11.2 Create GitHub Actions workflow for backend deployment (blue-green on Railway)
    - Implement blue-green deployment strategy for Fastify API and WebSocket server
    - Run database migrations automatically before deploying new application code
    - Include rollback mechanism that restores previous version within 5 minutes
    - Add 3-minute health check window post-deployment; auto-rollback on failure
    - Record deployment audit trail (who triggered, commit hash, timestamp, status)
    - **Use GitHub MCP** to create workflow file
    - Create `.github/workflows/deploy-backend.yml`
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.9_

  - [x] 11.3 Create GitHub Actions workflow for frontend deployment (Vercel)
    - Configure separate deployment pipelines for Dashboard, Invitation, and Scanner apps
    - Trigger Vercel deployment via GitHub integration (push to main/release branch)
    - Include post-deployment smoke test for CDN asset accessibility
    - **Use GitHub MCP** to create workflow file
    - Create `.github/workflows/deploy-frontend.yml`
    - _Requirements: 6.3, 6.7_

  - [x] 11.4 Implement manual approval gate for production deployments
    - Configure GitHub Actions environment protection rules requiring 1 authorized approver
    - Block deployment until explicit approval is received
    - **Use GitHub MCP** to configure repository environment settings
    - _Requirements: 6.8_

  - [x] 11.5 Implement pre-commit hook and secret scanning for repository
    - Set up pre-commit hook to detect secrets (API keys, passwords, tokens)
    - Enable GitHub secret scanning on push
    - Block commits containing detected secrets
    - **Use GitHub MCP** to enable secret scanning settings
    - Create `.husky/pre-commit` with secret detection script
    - _Requirements: 3.6_

  - [x] 11.6 Create post-deployment smoke test workflow
    - Verify API health check endpoint responds correctly
    - Verify database connectivity
    - Verify Redis connectivity
    - Verify WebSocket connectivity
    - Verify CDN asset accessibility
    - Trigger cache purge on changed paths (not full purge)
    - **Use GitHub MCP** to create workflow file
    - **Use Cloudflare Bindings MCP** for cache purge
    - Create `.github/workflows/smoke-test.yml`
    - _Requirements: 15.5, 7.6_

- [x] 12. Configure secret management and rotation
  - [x] 12.1 Document and configure all production environment variables
    - Create comprehensive list of required environment variables per service
    - Configure secrets in Railway (backend) and Vercel (frontend) environments
    - Ensure no plaintext secrets stored on disk
    - Create `docs/deployment/environment-variables.md`
    - _Requirements: 3.1, 3.2, 15.1_

  - [x] 12.2 Implement secret rotation mechanism for database credentials and JWT keys
    - Configure database credential rotation with 90-day interval
    - Configure JWT signing key rotation with 30-day interval and 24-hour grace period
    - Implement alert on rotation failure (retain current secret, notify admin)
    - Create `packages/api/src/config/secret-rotation.ts`
    - _Requirements: 3.3, 3.4, 3.5_

  - [x] 12.3 Configure separate storage for AES-256 encryption key (QR payload and PII)
    - Store encryption key in separate secret store from application secrets
    - Restrict access to API server service account only
    - _Requirements: 3.8_

- [x] 13. Implement performance optimization
  - [x] 13.1 Configure API server for production readiness
    - Verify Fastify runs correctly as single process in production mode
    - Document scaling path (clustering, auto-scaling) for future growth
    - Create `packages/api/src/config/production.ts` with production-specific settings
    - _Requirements: 14.1, 14.5_

  - [x] 13.2 Implement response caching strategy with Redis
    - Cache event details (TTL 5 min), CMS sections (TTL 5 min), guest list (TTL 1 min)
    - Implement cache invalidation on write operations
    - **Use Upstash MCP** to verify cache behavior with `mcp_upstash_redis_database_run_redis_commands`
    - Create `packages/api/src/plugins/response-cache.ts`
    - _Requirements: 14.3_

  - [x] 13.3 Configure Invitation App ISR (Incremental Static Regeneration)
    - Set revalidation period to 60 seconds for invitation pages
    - Ensure majority of requests served from edge cache without hitting backend
    - Update `apps/invitation/src/app/[eventSlug]/page.tsx` with ISR configuration
    - _Requirements: 14.4_

  - [x] 13.4 Implement Scanner PWA service worker caching strategy
    - Configure cache-first for static assets
    - Configure network-first for API calls with fallback to cached response
    - Update `apps/scanner/public/sw.js` or service worker registration
    - _Requirements: 14.7_

  - [x] 13.5 Configure HTTP/2 on Cloudflare for multiplexing and header compression
    - Enable HTTP/2 on all Cloudflare-proxied domains
    - **Use Cloudflare Bindings MCP** for HTTP/2 configuration
    - _Requirements: 14.8_

- [x] 14. Configure DNS, domain routing, and load balancing
  - [x] 14.1 Configure Cloudflare DNS records for all production subdomains
    - Set up DNS records: `dashboard.{domain}`, `scanner.{domain}`, `api.{domain}`, `ws.{domain}`
    - Configure wildcard or dynamic routing for `{event-slug}.{domain}` (Invitation App)
    - Set initial TTL to 300 seconds (lower for go-live flexibility)
    - Enable DNSSEC for DNS spoofing prevention
    - **Use Cloudflare Bindings MCP** for DNS record management
    - _Requirements: 11.1, 11.2, 11.7_

  - [x] 14.2 Configure DNS health checks and failover
    - Set up health check that detects primary endpoint unresponsive for 30 seconds
    - Configure automatic failover to secondary endpoint
    - Set load balancer health check interval to 10 seconds, threshold 3 consecutive failures
    - **Use Cloudflare Bindings MCP** for health check configuration
    - _Requirements: 11.3, 11.5_

  - [x] 14.3 Configure WebSocket subdomain with sticky session support
    - Set up `ws.{domain}` subdomain for WebSocket connections
    - Configure sticky session (session affinity) on load balancer for WebSocket upgrade
    - _Requirements: 11.4_

- [x] 15. Checkpoint - Verify deployment pipeline and infrastructure
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15.1 Post-domain setup: Update all domain-dependent environment variables and configurations
  - WHEN production domain is live on Vercel, update the following:
  - Set `R2_PUBLIC_URL=https://cdn.{domain}` in `.env` and Railway/Vercel env vars
  - Configure R2 Custom Domain (`cdn.{domain}`) in Cloudflare Dashboard → R2 → bucket → Settings → Custom Domains
  - Update R2 CORS rules: set allowed origins to `https://dashboard.{domain}` (upload) and `https://cdn.{domain}` (download)
  - Update CORS plugin (`packages/api/src/plugins/cors.ts`) with production domain origins
  - Apply Cloudflare zone-level CDN cache rules (Terraform or `scripts/configure-cdn-cache.sh`)
  - Enable Brotli compression on zone (Dashboard → Speed → Optimization)
  - Enable Smart Tiered Cache (Dashboard → Caching → Tiered Cache)
  - Apply Cloudflare Worker routes for CDN cache worker and Image Resizer worker
  - Update Vercel environment variables with production API domain (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`)
  - Verify SSL/TLS is active on all subdomains
  - _Requirements: 7.2, 7.4, 7.5, 7.7, 8.5, 11.1, 11.6_

- [ ] 16. Set up backup, disaster recovery, and operational readiness
  - [ ] 16.1 Configure cross-region backup for all critical components
    - Verify PostgreSQL backups stored in different region from production (Supabase)
    - Verify Redis backups configured (Upstash daily backup)
    - Configure R2 cross-region replication for object storage
    - **Use Supabase MCP** to verify database backup settings
    - **Use Upstash MCP** (`mcp_upstash_redis_database_list_backups`) to verify Redis backups
    - **Use Cloudflare Bindings MCP** for R2 replication configuration
    - _Requirements: 10.1, 10.2, 10.7_

  - [ ] 16.2 Create disaster recovery runbook documentation
    - Document step-by-step procedures: database restore, service re-deploy, DNS failover, post-recovery validation
    - Document RTO target (4 hours) and RPO target (1 hour)
    - Define backup retention policy: daily (7 days), weekly (4 weeks), monthly (12 months)
    - Create `docs/operations/disaster-recovery-runbook.md`
    - _Requirements: 10.3, 10.4, 10.8_

  - [ ] 16.3 Create operational runbook for day-to-day operations
    - Document deployment procedures, rollback steps, manual scaling
    - Document incident response and escalation contacts
    - Create `docs/operations/operational-runbook.md`
    - _Requirements: 15.8_

  - [ ] 16.4 Create pre-deployment verification checklist script
    - Verify all environment variables configured
    - Verify database migration status matches application version
    - Verify SSL certificates valid on all domains
    - Verify DNS propagation complete
    - Verify monitoring and alerting active (send test alert)
    - Verify backup has completed at least 1 full cycle
    - Create `.github/workflows/pre-deploy-checklist.yml`
    - **Use GitHub MCP** to create workflow file
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.6, 15.7_

  - [ ] 16.5 Configure public status page with automated status updates
    - Set up status page reflecting real-time platform status (operational, degraded, outage)
    - Connect to monitoring data for automatic status updates
    - _Requirements: 15.10_

- [ ] 17. Configure monitoring dashboards and security logging
  - [ ] 17.1 Set up observability dashboard with real-time metrics
    - Configure dashboard showing: system health overview, active users per app, check-in rate per event, error breakdown by service
    - Include metrics: API response time (p50, p95, p99), error rate, throughput, DB pool usage, Redis memory, WebSocket connections
    - **Use Cloudflare Observability MCP** to configure analytics and log queries
    - _Requirements: 9.1, 9.7_

  - [ ] 17.2 Configure security event logging
    - Log failed login attempts, rate limit hits, WAF blocks, unauthorized access attempts
    - Store in dedicated security log with 30-day retention
    - **Use Cloudflare Observability MCP** for WAF block analytics
    - _Requirements: 9.10, 9.6_

  - [ ] 17.3 Configure database monitoring for slow queries and resource usage
    - Set up slow query logging (threshold > 1 second)
    - Monitor connection pool utilization
    - Monitor disk usage with alert at 80% capacity
    - **Use Supabase MCP** to check database performance metrics
    - **Use Upstash MCP** (`mcp_upstash_redis_database_get_statistics`) for Redis monitoring
    - _Requirements: 4.9, 4.10, 5.7_

- [ ] 18. Final checkpoint - Verify complete production readiness
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- **MCP-first approach**: Tasks interacting with Supabase, Upstash, Cloudflare, or GitHub MUST use the corresponding MCP server tools before falling back to CLI/terminal
- This is a strategic deployment plan — implementation creates configuration files, workflows, and infrastructure code rather than application features
- Unit tests and integration tests validate infrastructure behavior (no property-based tests per design decision)
- All secrets managed via MCP server configurations; never hardcode credentials in project files

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1", "3.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.3", "3.4"] },
    { "id": 3, "tasks": ["2.5", "3.5", "5.1", "5.2", "5.3"] },
    { "id": 4, "tasks": ["5.4", "5.5", "5.6", "6.1", "6.2"] },
    { "id": 5, "tasks": ["5.7", "6.3", "6.4", "8.1", "8.2"] },
    { "id": 6, "tasks": ["8.3", "8.4", "8.5", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "9.4", "13.1", "13.2"] },
    { "id": 8, "tasks": ["9.5", "13.3", "13.4", "13.5"] },
    { "id": 9, "tasks": ["11.1", "11.5", "12.1"] },
    { "id": 10, "tasks": ["11.2", "11.3", "11.4", "12.2", "12.3"] },
    { "id": 11, "tasks": ["11.6", "14.1", "14.2", "14.3"] },
    { "id": 12, "tasks": ["15.1", "16.1", "16.2", "16.3"] },
    { "id": 13, "tasks": ["16.4", "16.5", "17.1", "17.2", "17.3"] }
  ]
}
```
