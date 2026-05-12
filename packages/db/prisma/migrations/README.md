# Database Migrations

## Setup

Migrations are managed by Prisma Migrate. To create and apply migrations, you need a running PostgreSQL database.

### Prerequisites

1. Set `DATABASE_URL` in `packages/db/.env`:
   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/wedding_digital_saas?schema=public"
   ```

2. Ensure PostgreSQL is running and accessible.

### Commands

```bash
# Create a new migration (development)
npm run migrate:dev

# Apply migrations (production)
npm run migrate:deploy

# Generate Prisma client (no DB needed)
npm run generate

# Reset database (destructive - development only)
npx prisma migrate reset
```

### Initial Migration

To create the initial migration when a database is available:

```bash
cd packages/db
npx prisma migrate dev --name init
```

This will create the migration SQL file based on the schema defined in `prisma/schema.prisma`.

## Schema Overview

The database uses PostgreSQL with the following tables:

- `tenants` - Multi-tenant business clients
- `users` - Platform users with role-based access
- `events` - Wedding events owned by tenants
- `event_configs` - Event configuration (theme, sections)
- `guests` - Guest records (directly tenant-scoped for performance)
- `qr_codes` - QR codes for guest check-in
- `rsvps` - RSVP submissions
- `check_ins` - Check-in records
- `invitation_sections` - CMS sections for invitations
- `scanner_devices` - Scanner devices per event
- `messages` - Guest messages/wishes

### Key Indexes

- `qr_codes.qr_payload` (unique + index) - Fast QR lookup < 100ms
- `guests.slug` - Fast guest lookup by slug
- `events.slug` (unique) - Fast event lookup by slug
- `guests.tenant_id` - Tenant isolation queries
- `users.tenant_id` - Tenant isolation queries
- `events.tenant_id` - Tenant isolation queries
