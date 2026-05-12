import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';

interface NotificationRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function notificationRoutes(app: FastifyInstance, opts: NotificationRouteOptions) {
  const { prisma } = opts;

  // Auth hook for all notification routes
  app.addHook('onRequest', async (request, reply) => {
    await (app as any).authenticate(request, reply);
  });

  // POST /notifications/send
  app.post('/send', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { guest_id, channel } = request.body as { guest_id: string; channel: string };

    if (!guest_id || !channel) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'guest_id dan channel diperlukan' },
      });
    }

    const guest = await prisma.guest.findFirst({
      where: { id: guest_id, tenant_id: user.tenant_id },
    });

    if (!guest) {
      return reply.status(404).send({
        success: false,
        error: { code: 'GUEST_6001', message: 'Tamu tidak ditemukan' },
      });
    }

    // Check contact info
    if (channel === 'whatsapp' && !guest.phone) {
      return reply.send({
        guest_id: guest.id,
        channel,
        success: false,
        error: 'Nomor phone belum dilengkapi',
      });
    }

    if (channel === 'email' && !guest.email) {
      return reply.send({
        guest_id: guest.id,
        channel,
        success: false,
        error: 'Alamat email belum dilengkapi',
      });
    }

    // Simulate sending (dev mode - always succeeds)
    await prisma.guest.update({
      where: { id: guest_id },
      data: { delivery_status: 'sent' },
    });

    return reply.send({
      guest_id: guest.id,
      channel,
      success: true,
    });
  });

  // POST /notifications/send-bulk
  app.post('/send-bulk', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { guest_ids, channel } = request.body as { guest_ids: string[]; channel: string };

    if (!guest_ids || !Array.isArray(guest_ids) || guest_ids.length === 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'guest_ids diperlukan' },
      });
    }

    if (guest_ids.length > 500) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'Maksimal 500 tamu per batch' },
      });
    }

    const guests = await prisma.guest.findMany({
      where: { id: { in: guest_ids }, tenant_id: user.tenant_id },
    });

    const results: any[] = [];
    let sent = 0;
    let failed = 0;

    for (const guest of guests) {
      const hasContact = channel === 'whatsapp' ? !!guest.phone : !!guest.email;

      if (!hasContact) {
        results.push({
          guest_id: guest.id,
          channel,
          success: false,
          error: channel === 'whatsapp' ? 'Nomor phone belum dilengkapi' : 'Alamat email belum dilengkapi',
        });
        failed++;
        continue;
      }

      // Simulate sending
      await prisma.guest.update({
        where: { id: guest.id },
        data: { delivery_status: 'sent' },
      });

      results.push({
        guest_id: guest.id,
        channel,
        success: true,
      });
      sent++;
    }

    // Add results for guests not found
    const foundIds = new Set(guests.map((g) => g.id));
    for (const guestId of guest_ids) {
      if (!foundIds.has(guestId)) {
        results.push({
          guest_id: guestId,
          channel,
          success: false,
          error: 'Tamu tidak ditemukan',
        });
        failed++;
      }
    }

    return reply.send({
      total: guest_ids.length,
      sent,
      failed,
      results,
    });
  });
}
