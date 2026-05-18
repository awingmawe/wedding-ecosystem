import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { PrismaClient } from '@wedding/db';
import type { RealtimeServer } from '@wedding/realtime';
import { AttendanceType, ErrorCode } from '@wedding/shared';
import { RsvpService, isRsvpError } from '../services/rsvp.service';
import { PrismaRsvpRepository, RealtimeRsvpBroadcaster } from '../repositories';

interface RsvpRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
  realtime: RealtimeServer | null;
}

export async function rsvpRoutes(app: FastifyInstance, opts: RsvpRouteOptions) {
  const { prisma, realtime } = opts;

  // Wire up service
  const repository = new PrismaRsvpRepository(prisma);
  const broadcaster = new RealtimeRsvpBroadcaster(() => realtime);
  const rsvpService = new RsvpService({ repository, broadcaster });

  // POST /rsvp - Submit or update RSVP (public route, no auth required)
  app.post('/', async (request: FastifyRequest, reply) => {
    const { guest_id, event_id, attendance, guest_count } = request.body as {
      guest_id: string;
      event_id: string;
      attendance: string;
      guest_count: number;
    };

    if (!guest_id || !event_id || !attendance) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'guest_id, event_id, dan attendance diperlukan' },
      });
    }

    // Validate attendance value
    const validAttendance = ['akad', 'resepsi', 'both', 'decline'];
    if (!validAttendance.includes(attendance)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'Pilihan kehadiran tidak valid' },
      });
    }

    const result = await rsvpService.submitRsvp(guest_id, event_id, {
      attendance: attendance as AttendanceType,
      guest_count: guest_count ?? 1,
    });

    if (isRsvpError(result)) {
      const statusCode = result.code === ErrorCode.GUEST_NOT_FOUND ? 404 : 400;
      return reply.status(statusCode).send({
        success: false,
        error: { code: result.code, message: result.message },
      });
    }

    return reply.send({
      success: true,
      rsvp: {
        id: result.id,
        guest_id: result.guest_id,
        attendance: result.attendance,
        guest_count: result.guest_count,
        submitted_at: result.submitted_at.toISOString(),
      },
    });
  });

  // GET /rsvp/:guestId - Get RSVP status for a guest (public)
  app.get('/:guestId', async (request: FastifyRequest, reply) => {
    const { guestId } = request.params as { guestId: string };

    const rsvp = await repository.findRsvpByGuestId(guestId);

    if (!rsvp) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RSVP_4003', message: 'RSVP belum disubmit' },
      });
    }

    return reply.send({
      id: rsvp.id,
      guest_id: rsvp.guest_id,
      attendance: rsvp.attendance,
      guest_count: rsvp.guest_count,
      submitted_at: rsvp.submitted_at.toISOString(),
    });
  });
}
