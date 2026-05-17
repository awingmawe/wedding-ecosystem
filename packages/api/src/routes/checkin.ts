/**
 * Check-in route handlers — thin adapters over CheckInService.
 *
 * Routes handle only:
 * - Input extraction and basic validation
 * - Tenant ownership verification
 * - Calling the service
 * - Mapping service results to HTTP responses
 *
 * All business logic (duplicate detection, QR decryption, broadcasting)
 * lives in CheckInService with atomic Redis-based duplicate detection.
 */

import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';
import type { RealtimeServer } from '@wedding/realtime';
import {
  ErrorCode,
  qrCheckInSchema,
  manualCheckInSchema,
  goShowSchema,
} from '@wedding/shared';
import { CheckInService, isServiceError } from '../services/checkin.service';
import {
  PrismaCheckInRepository,
  RealtimeCheckInBroadcaster,
  IoRedisCheckInClient,
  NoOpRedisCheckInClient,
  getTenantEvent,
  replyEventNotFound,
} from '../repositories';
import { getCacheClient } from '../config/redis';
import { validate } from '../middleware/validate';

interface CheckInRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
  realtime: RealtimeServer | null;
}

export async function checkinRoutes(app: FastifyInstance, opts: CheckInRouteOptions) {
  const { prisma, realtime } = opts;

  // --- Wire up CheckInService with its adapters ---
  const repository = new PrismaCheckInRepository(prisma);
  const broadcaster = new RealtimeCheckInBroadcaster(() => realtime);

  const redisClient = getCacheClient();
  const redisAdapter = redisClient
    ? new IoRedisCheckInClient(redisClient as any)
    : new NoOpRedisCheckInClient();

  const encryptionKey = process.env.AES_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || '';

  const checkInService = new CheckInService({
    repository,
    redis: redisAdapter,
    encryptionKey,
    broadcaster,
  });

  // Auth hook for all check-in routes
  app.addHook('onRequest', async (request, reply) => {
    await (app as any).authenticate(request, reply);
  });

  // POST /checkin/scan - QR code scan verification
  app.post('/scan', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const body = validate(request.body, qrCheckInSchema, reply);
    if (!body) return;

    const { qr_payload, event_id, scanner_device_id } = body;

    // Verify event belongs to tenant
    const event = await getTenantEvent(prisma, event_id, user.tenant_id);
    if (!event) return replyEventNotFound(reply);

    // Delegate to service — handles QR decryption, atomic duplicate detection, DB write, broadcast
    const result = await checkInService.verifyQRScan(
      qr_payload,
      event_id,
      scanner_device_id || null
    );

    // Map service result to HTTP response
    return reply.send({
      status: result.status,
      guest_name: result.guest_name,
      guest_group: result.guest_group,
      message: result.message,
      checked_in_at: result.checked_in_at?.toISOString() ?? null,
    });
  });

  // POST /checkin/manual - Manual check-in by guest ID
  app.post('/manual', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const body = validate(request.body, manualCheckInSchema, reply);
    if (!body) return;

    const { guest_id, event_id, scanner_device_id } = body as {
      guest_id: string;
      event_id: string;
      scanner_device_id?: string;
    };

    // Verify event belongs to tenant
    const event = await getTenantEvent(prisma, event_id, user.tenant_id);
    if (!event) return replyEventNotFound(reply);

    // Delegate to service — handles duplicate check, DB write, broadcast
    const result = await checkInService.manualCheckIn(
      guest_id,
      event_id,
      scanner_device_id || null
    );

    if (isServiceError(result)) {
      const statusCode = result.code === ErrorCode.ALREADY_CHECKED_IN ? 409 : 404;
      return reply.status(statusCode).send({
        success: false,
        error: { code: result.code, message: result.message },
      });
    }

    return reply.send({
      success: true,
      guest_name: result.guest.name,
      checked_in_at: result.check_in.checked_in_at.toISOString(),
    });
  });

  // POST /checkin/go-show - Register Go-Show guest
  app.post('/go-show', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const body = validate(request.body, goShowSchema, reply);
    if (!body) return;

    const { name, event_id, scanner_device_id } = body;

    // Verify event belongs to tenant
    const event = await getTenantEvent(prisma, event_id, user.tenant_id);
    if (!event) return replyEventNotFound(reply);

    // Delegate to service — handles guest creation, check-in, broadcast
    const result = await checkInService.registerGoShow(name, event_id, scanner_device_id || null);

    if (isServiceError(result)) {
      return reply.status(400).send({
        success: false,
        error: { code: result.code, message: result.message },
      });
    }

    return reply.status(201).send({
      success: true,
      guest_id: result.guest.id,
      guest_name: result.guest.name,
      checked_in_at: result.check_in.checked_in_at.toISOString(),
    });
  });

  // POST /checkin/sync - Sync offline check-in records
  app.post('/sync', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { records } = request.body as {
      records: Array<{
        guest_id: string;
        event_id: string;
        method: string;
        checked_in_at: string;
        scanner_device_id?: string;
      }>;
    };

    if (!records || !Array.isArray(records)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'records diperlukan' },
      });
    }

    const results: Array<{
      guest_id: string;
      status: 'synced' | 'duplicate' | 'error';
      message?: string;
    }> = [];

    for (const record of records) {
      // Verify event belongs to tenant
      const event = await prisma.event.findFirst({
        where: { id: record.event_id, tenant_id: user.tenant_id },
      });

      if (!event) {
        results.push({
          guest_id: record.guest_id,
          status: 'error',
          message: 'Event tidak ditemukan',
        });
        continue;
      }

      // Use manual check-in for sync (handles duplicate detection + broadcast)
      const syncResult = await checkInService.manualCheckIn(
        record.guest_id,
        record.event_id,
        record.scanner_device_id || null
      );

      if (isServiceError(syncResult)) {
        if (syncResult.code === ErrorCode.ALREADY_CHECKED_IN) {
          results.push({ guest_id: record.guest_id, status: 'duplicate' });
        } else {
          results.push({ guest_id: record.guest_id, status: 'error', message: syncResult.message });
        }
      } else {
        results.push({ guest_id: record.guest_id, status: 'synced' });
      }
    }

    return reply.send({
      success: true,
      total: records.length,
      synced: results.filter((r) => r.status === 'synced').length,
      duplicates: results.filter((r) => r.status === 'duplicate').length,
      errors: results.filter((r) => r.status === 'error').length,
      results,
    });
  });

  // GET /checkin/search - Search guests for manual check-in
  app.get('/search', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { q, event_id } = request.query as { q?: string; event_id?: string };

    if (!q || !event_id) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'q dan event_id diperlukan' },
      });
    }

    // Verify event belongs to tenant
    const event = await getTenantEvent(prisma, event_id, user.tenant_id);
    if (!event) return replyEventNotFound(reply);

    const result = await checkInService.searchGuests(event_id, q);

    if (isServiceError(result)) {
      return reply.status(400).send({
        success: false,
        error: { code: result.code, message: result.message },
      });
    }

    return reply.send({ data: result });
  });
}
