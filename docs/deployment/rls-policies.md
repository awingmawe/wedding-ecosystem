# Row-Level Security (RLS) Policies

## Overview

Row-Level Security (RLS) is enabled on all tenant-scoped tables in the Wedding Digital SaaS database. This provides an additional layer of data isolation at the PostgreSQL level, ensuring that even if application-level tenant filtering is accidentally bypassed, the database itself will prevent cross-tenant data access.

## How It Works

### Session Variable: `app.current_tenant_id`

RLS policies use a PostgreSQL session variable (`app.current_tenant_id`) to determine which tenant's data the current session is authorized to access. Every query is automatically filtered by this variable.

- If the variable is **not set**, all tenant-scoped queries return **zero rows** (fail-closed behavior).
- If the variable is set to a valid tenant UUID, only rows belonging to that tenant are visible.

### Policy Types

#### Direct Tenant Scoping

Tables with a `tenant_id` column use a simple equality check:

```sql
tenant_id = current_setting('app.current_tenant_id', true)::uuid
```

**Tables**: `users`, `events`, `guests`

#### Indirect Tenant Scoping (via event_id)

Tables without a direct `tenant_id` but with an `event_id` foreign key join to the `events` table:

```sql
EXISTS (
  SELECT 1 FROM events
  WHERE events.id = <table>.event_id
    AND events.tenant_id = current_setting('app.current_tenant_id', true)::uuid
)
```

**Tables**: `event_configs`, `invitation_sections`, `scanner_devices`, `messages`

#### Indirect Tenant Scoping (via guest_id)

Tables with a `guest_id` foreign key join to the `guests` table (which has a direct `tenant_id`):

```sql
EXISTS (
  SELECT 1 FROM guests
  WHERE guests.id = <table>.guest_id
    AND guests.tenant_id = current_setting('app.current_tenant_id', true)::uuid
)
```

**Tables**: `qr_codes`, `rsvps`, `check_ins`

### Tables WITHOUT RLS

- `tenants` — The root entity; not tenant-scoped itself.

## Setting Tenant Context in the Application

### With Prisma (via `$executeRawUnsafe` or `$queryRaw`)

Before executing tenant-scoped queries, set the session variable using `SET LOCAL` (scoped to the current transaction):

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function withTenantContext<T>(tenantId: string, operation: () => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Set tenant context for this transaction
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);

    // Execute the operation within the tenant context
    return operation();
  });
}
```

### With Raw SQL (e.g., PgBouncer transaction mode)

```sql
BEGIN;
SET LOCAL app.current_tenant_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

-- All subsequent queries in this transaction are tenant-scoped
SELECT * FROM events; -- Only returns events for the specified tenant

COMMIT;
```

### Fastify Request Middleware Pattern

A recommended pattern for the API server is to set the tenant context at the beginning of each request:

```typescript
import { FastifyInstance } from 'fastify';

export function tenantContextPlugin(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request, reply) => {
    const tenantId = request.user?.tenantId;

    if (!tenantId) {
      return reply.status(401).send({ error: 'Tenant context required' });
    }

    // Store tenant ID for use in database operations
    request.tenantId = tenantId;
  });
}
```

Then in service functions:

```typescript
async function getEvents(prisma: PrismaClient, tenantId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
    return tx.event.findMany();
  });
}
```

## Important Notes

### `current_setting('app.current_tenant_id', true)`

The second parameter `true` means "return NULL if the setting doesn't exist" instead of throwing an error. When the setting is NULL, the UUID cast fails gracefully and the policy evaluates to `false`, returning no rows. This is the **fail-closed** behavior we want.

### FORCE ROW LEVEL SECURITY

The migration includes `FORCE ROW LEVEL SECURITY` on all tables. This ensures that even the table owner (the database role that created the tables) is subject to RLS policies. Without this, superusers and table owners bypass RLS by default.

### Performance Considerations

- **Direct tenant_id policies** are very fast — they use the existing index on `tenant_id`.
- **Indirect policies** (via EXISTS subquery) add a small overhead but are optimized by PostgreSQL's query planner using the foreign key indexes.
- For high-throughput tables like `check_ins` and `qr_codes`, the `guests.tenant_id` index ensures the EXISTS subquery is efficient.

### Bypassing RLS for Admin/Migration Operations

For administrative operations (migrations, data fixes, background jobs), you can bypass RLS by:

1. Using a superuser role that is not subject to RLS (only if `FORCE ROW LEVEL SECURITY` is removed for that role)
2. Or by creating a separate database role with `BYPASSRLS` privilege for admin operations:

```sql
-- Create an admin role that bypasses RLS (use with caution)
CREATE ROLE app_admin BYPASSRLS;
```

### Testing RLS Policies

To verify RLS is working correctly:

```sql
-- Set tenant context
SET LOCAL app.current_tenant_id = 'tenant-uuid-here';

-- This should only return events for the specified tenant
SELECT * FROM events;

-- Reset and try without context — should return 0 rows
RESET app.current_tenant_id;
SELECT * FROM events; -- Returns empty result set
```

## Migration File

The RLS policies are defined in:

```
packages/db/prisma/migrations/20250101000001_add_rls_policies/migration.sql
```

Apply with:

```bash
npx prisma migrate deploy
```
