import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { PrismaClient } from '@wedding/db';

interface EventRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function eventRoutes(app: FastifyInstance, opts: EventRouteOptions) {
  const { prisma } = opts;

  // Auth hook for all event routes
  app.addHook('onRequest', async (request, reply) => {
    await (app as any).authenticate(request, reply);
  });

  // GET /events/current
  app.get('/current', async (request: FastifyRequest, reply) => {
    const user = request.user!;

    const event = await prisma.event.findFirst({
      where: { tenant_id: user.tenant_id },
      orderBy: { created_at: 'desc' },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    return reply.send(event);
  });

  // GET /events/:id/stats
  app.get('/:id/stats', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const event = await prisma.event.findFirst({
      where: { id, tenant_id: user.tenant_id },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    const total_guests = await prisma.guest.count({
      where: { event_id: id },
    });

    const total_rsvp = await prisma.rSVP.count({
      where: { guest: { event_id: id } },
    });

    const total_checked_in = await prisma.checkIn.count({
      where: { guest: { event_id: id } },
    });

    const total_go_show = await prisma.guest.count({
      where: { event_id: id, type: 'go_show' },
    });

    return reply.send({
      total_guests,
      total_rsvp,
      total_checked_in,
      total_go_show,
    });
  });

  // GET /events/:id/rsvp
  app.get('/:id/rsvp', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const event = await prisma.event.findFirst({
      where: { id, tenant_id: user.tenant_id },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    const rsvps = await prisma.rSVP.findMany({
      where: { guest: { event_id: id } },
      include: { guest: { select: { id: true, name: true } } },
      orderBy: { submitted_at: 'desc' },
    });

    const data = rsvps.map((rsvp) => ({
      guest_id: rsvp.guest_id,
      guest_name: rsvp.guest.name,
      attendance: rsvp.attendance,
      guest_count: rsvp.guest_count,
      submitted_at: rsvp.submitted_at.toISOString(),
    }));

    return reply.send({ data });
  });

  // NOTE: Section management (content, toggle, reorder) lives in /cms routes.
  // Use GET /cms/sections/:eventId, PUT /cms/sections/:eventId/:sectionId/content, etc.

  // POST /events/:id/media/upload
  app.post('/:id/media/upload', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    // Verify event belongs to tenant
    const event = await prisma.event.findFirst({
      where: { id, tenant_id: user.tenant_id },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    // TODO: Implement real file upload via StorageService (presigned URL flow)
    // For now, return a proper error in production or a placeholder in development
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      return reply.status(501).send({
        success: false,
        error: {
          code: 'SYS_0001',
          message: 'Upload belum diimplementasikan. Gunakan endpoint /cms/media/presigned-url.',
        },
      });
    }

    return reply.send({
      success: true,
      url: `/uploads/mock-${Date.now()}.jpg`,
    });
  });
}
