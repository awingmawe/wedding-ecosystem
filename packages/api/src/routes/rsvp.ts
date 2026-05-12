import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';
import type { RealtimeServer } from '@wedding/realtime';

interface RsvpRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
  realtime: RealtimeServer | null;
}

export async function rsvpRoutes(app: FastifyInstance, opts: RsvpRouteOptions) {
  const { prisma, realtime } = opts;

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

    // Find guest
    const guest = await prisma.guest.findFirst({
      where: { id: guest_id, event_id },
    });

    if (!guest) {
      return reply.status(404).send({
        success: false,
        error: { code: 'GUEST_6001', message: 'Tamu tidak ditemukan' },
      });
    }

    // Determine guest_count based on attendance
    let finalGuestCount: number;
    if (attendance === 'decline') {
      finalGuestCount = 0;
    } else {
      finalGuestCount = guest_count ?? 1;
      const maxAllowed = guest.plus_one_count + 1;

      if (finalGuestCount < 1) {
        return reply.status(400).send({
          success: false,
          error: { code: 'RSVP_4001', message: 'Jumlah tamu minimal 1' },
        });
      }

      if (finalGuestCount > maxAllowed) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'RSVP_4002',
            message: `Jumlah tamu melebihi batas. Maksimum ${maxAllowed} tamu diizinkan`,
          },
        });
      }
    }

    // Upsert RSVP (Req 4.7)
    const { randomUUID } = await import('crypto');
    const existingRsvp = await prisma.rSVP.findFirst({
      where: { guest_id },
    });

    let rsvp;
    if (existingRsvp) {
      rsvp = await prisma.rSVP.update({
        where: { id: existingRsvp.id },
        data: {
          attendance: attendance as any,
          guest_count: finalGuestCount,
          submitted_at: new Date(),
        },
      });
    } else {
      rsvp = await prisma.rSVP.create({
        data: {
          id: randomUUID(),
          guest_id,
          attendance: attendance as any,
          guest_count: finalGuestCount,
          submitted_at: new Date(),
        },
      });
    }

    // Broadcast via WebSocket (Req 4.6 - < 500ms)
    if (realtime) {
      realtime.broadcastRsvpUpdate(event_id, {
        guest_id,
        guest_name: guest.name,
        attendance,
        guest_count: finalGuestCount,
        submitted_at: rsvp.submitted_at.toISOString(),
        event_id,
      });
    }

    return reply.send({
      success: true,
      rsvp: {
        id: rsvp.id,
        guest_id: rsvp.guest_id,
        attendance: rsvp.attendance,
        guest_count: rsvp.guest_count,
        submitted_at: rsvp.submitted_at.toISOString(),
      },
    });
  });

  // GET /rsvp/:guestId - Get RSVP status for a guest (public)
  app.get('/:guestId', async (request: FastifyRequest, reply) => {
    const { guestId } = request.params as { guestId: string };

    const rsvp = await prisma.rSVP.findFirst({
      where: { guest_id: guestId },
    });

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
