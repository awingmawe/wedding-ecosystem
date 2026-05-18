/**
 * Guest route handlers — thin adapters over GuestService and GuestImportService.
 *
 * Routes handle only:
 * - Input extraction and basic validation
 * - Calling the service
 * - Mapping service results to HTTP responses
 *
 * All business logic (slug generation, AES-256 QR encryption, PII handling,
 * pagination, CSV parsing, duplicate detection) lives in GuestService /
 * GuestImportService, backed by PrismaGuestRepository.
 */

import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { PrismaClient } from '@wedding/db';
import { GuestService, isGuestError } from '../services/guest.service';
import { bulkImportGuests } from '../services/guest-import.service';
import { PrismaGuestRepository, getCurrentTenantEvent, replyEventNotFound } from '../repositories';
import type { GuestGroup, GuestType } from '@wedding/shared';

interface GuestRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function guestRoutes(app: FastifyInstance, opts: GuestRouteOptions) {
  const { prisma } = opts;

  // --- Wire up GuestService with its Prisma adapter ---
  const repository = new PrismaGuestRepository(prisma);

  const encryptionKey = process.env.AES_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || '';

  const guestService = new GuestService({ repository, encryptionKey });

  // Auth hook for all guest routes
  app.addHook('onRequest', async (request, reply) => {
    await (app as any).authenticate(request, reply);
  });

  // GET /guests
  app.get('/', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const query = request.query as {
      page?: string;
      per_page?: string;
      group?: string;
      status?: string;
      include?: string;
    };

    // Resolve the current event for this tenant — all guest operations are
    // scoped to an event, and tenants in this system map 1:1 with an event.
    const event = await getCurrentTenantEvent(prisma, user.tenant_id);
    if (!event) {
      // Tenant has no events yet — return empty list rather than 404
      return reply.send({ data: [], pagination: { page: 1, per_page: 50, total: 0, total_pages: 0 } });
    }

    const result = await guestService.listGuests(
      event.id,
      user.tenant_id,
      {
        page: parseInt(query.page || '1', 10),
        per_page: Math.min(parseInt(query.per_page || '50', 10), 50),
      },
      {
        group: query.group as GuestGroup | undefined,
        status: query.status as 'belum_rsvp' | 'confirmed' | 'declined' | 'checked_in' | undefined,
      }
    );

    if (isGuestError(result)) {
      return reply.status(404).send({
        success: false,
        error: { code: result.code, message: result.message },
      });
    }

    // Notifications page requests a flat delivery-status focused shape
    if (query.include === 'delivery_status') {
      return reply.send({
        guests: result.data.map((guest) => ({
          id: guest.id,
          name: guest.name,
          slug: guest.slug,
          phone: guest.phone,
          email: guest.email,
          delivery_status: guest.delivery_status,
          invitation_url: guest.invitation_url,
        })),
      });
    }

    return reply.send(result);
  });

  // POST /guests
  app.post('/', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const body = request.body as {
      event_id?: string;
      name: string;
      group: string;
      phone?: string;
      email?: string;
      plus_one_count?: number;
    };

    if (!body.name || !body.group) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'Nama dan grup diperlukan' },
      });
    }

    // Resolve event: use explicit event_id if provided, else fall back to
    // the tenant's current event (single-event-per-tenant model)
    let eventId = body.event_id;
    if (!eventId) {
      const event = await getCurrentTenantEvent(prisma, user.tenant_id);
      if (!event) return replyEventNotFound(reply);
      eventId = event.id;
    }

    const result = await guestService.addGuest(eventId, user.tenant_id, {
      name: body.name,
      group: body.group as GuestGroup,
      type: 'invited' as GuestType,
      phone: body.phone,
      email: body.email,
      plus_one_count: body.plus_one_count !== undefined ? Number(body.plus_one_count) : 0,
    });

    if (isGuestError(result)) {
      return reply.status(result.code === 'RES_5001' ? 404 : 400).send({
        success: false,
        error: { code: result.code, message: result.message },
      });
    }

    return reply.status(201).send(result);
  });

  // PUT /guests/:id
  app.put('/:id', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const result = await guestService.updateGuest(id, user.tenant_id, {
      name: body.name as string | undefined,
      group: body.group as GuestGroup | undefined,
      phone: body.phone as string | undefined,
      email: body.email as string | undefined,
      plus_one_count: body.plus_one_count as number | undefined,
    });

    if (isGuestError(result)) {
      return reply.status(404).send({
        success: false,
        error: { code: result.code, message: result.message },
      });
    }

    return reply.send(result);
  });

  // DELETE /guests/:id
  app.delete('/:id', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const result = await guestService.deleteGuest(id, user.tenant_id);

    if (isGuestError(result)) {
      return reply.status(404).send({
        success: false,
        error: { code: result.code, message: result.message },
      });
    }

    return reply.send(result);
  });

  // GET /guests/:id/qr
  app.get('/:id/qr', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const result = await guestService.getGuest(id, user.tenant_id);

    if (isGuestError(result)) {
      return reply.status(404).send({
        success: false,
        error: { code: result.code, message: result.message },
      });
    }

    const qr = result.qr_code;
    return reply.send({
      qr_image_url: qr?.qr_image_url ?? null,
      qr_payload: qr?.qr_payload ?? null,
      is_active: qr?.is_active ?? false,
    });
  });

  // GET /guests/search
  app.get('/search', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { q, event_id } = request.query as { q?: string; event_id?: string };

    if (!q) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'Parameter q diperlukan' },
      });
    }

    // Resolve event context
    let eventId = event_id;
    if (!eventId) {
      const event = await getCurrentTenantEvent(prisma, user.tenant_id);
      if (!event) return replyEventNotFound(reply);
      eventId = event.id;
    }

    const result = await guestService.searchGuests(eventId, user.tenant_id, q);

    if (!Array.isArray(result) && isGuestError(result)) {
      return reply.status(400).send({
        success: false,
        error: { code: result.code, message: result.message },
      });
    }

    return reply.send({ data: result });
  });

  // POST /guests/import
  app.post('/import', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const body = request.body as { csv_text?: string; event_id?: string };

    if (!body.csv_text) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'csv_text diperlukan' },
      });
    }

    // Resolve event context
    let eventId = body.event_id;
    if (!eventId) {
      const event = await getCurrentTenantEvent(prisma, user.tenant_id);
      if (!event) return replyEventNotFound(reply);
      eventId = event.id;
    }

    // Pre-fetch existing guest names so the import can exclude duplicates
    // against names already in the event, not just within the batch.
    const existingNames = await repository.findGuestNamesByEvent(eventId, user.tenant_id);

    const report = await bulkImportGuests(
      { eventId, tenantId: user.tenant_id, csvText: body.csv_text },
      guestService,
      existingNames
    );

    return reply.send({
      imported: report.successCount,
      errors: report.failedRows.length,
      details: report.failedRows,
    });
  });
}
