import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';

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

  // GET /events/:id/sections
  app.get('/:id/sections', async (request: FastifyRequest, reply) => {
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

    const sections = await prisma.invitationSection.findMany({
      where: { event_id: id },
      orderBy: { sort_order: 'asc' },
    });

    return reply.send(sections);
  });

  // PUT /events/:id/sections/:sectionId/content
  app.put('/:id/sections/:sectionId/content', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { id, sectionId } = request.params as { id: string; sectionId: string };
    const { content } = request.body as { content: Record<string, unknown> };

    const event = await prisma.event.findFirst({
      where: { id, tenant_id: user.tenant_id },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    const section = await prisma.invitationSection.findFirst({
      where: { id: sectionId, event_id: id },
    });

    if (!section) {
      return reply.status(404).send({
        success: false,
        error: { code: 'CMS_9001', message: 'Section tidak ditemukan' },
      });
    }

    const updated = await prisma.invitationSection.update({
      where: { id: sectionId },
      data: { content: content as any },
    });

    return reply.send(updated);
  });

  // PUT /events/:id/sections/:sectionId/toggle
  app.put('/:id/sections/:sectionId/toggle', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { id, sectionId } = request.params as { id: string; sectionId: string };
    const { is_active } = request.body as { is_active: boolean };

    const event = await prisma.event.findFirst({
      where: { id, tenant_id: user.tenant_id },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    const section = await prisma.invitationSection.findFirst({
      where: { id: sectionId, event_id: id },
    });

    if (!section) {
      return reply.status(404).send({
        success: false,
        error: { code: 'CMS_9001', message: 'Section tidak ditemukan' },
      });
    }

    const updated = await prisma.invitationSection.update({
      where: { id: sectionId },
      data: { is_active },
    });

    return reply.send(updated);
  });

  // PUT /events/:id/sections/:sectionId/reorder
  app.put('/:id/sections/:sectionId/reorder', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { id, sectionId } = request.params as { id: string; sectionId: string };
    const { position } = request.body as { position: number };

    const event = await prisma.event.findFirst({
      where: { id, tenant_id: user.tenant_id },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    // Get all sections
    const allSections = await prisma.invitationSection.findMany({
      where: { event_id: id },
      orderBy: { sort_order: 'asc' },
    });

    const section = allSections.find((s) => s.id === sectionId);
    if (!section) {
      return reply.status(404).send({
        success: false,
        error: { code: 'CMS_9001', message: 'Section tidak ditemukan' },
      });
    }

    // Reorder
    const reordered = allSections.filter((s) => s.id !== sectionId);
    reordered.splice(position - 1, 0, section);

    // Update sort orders
    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].sort_order !== i + 1) {
        await prisma.invitationSection.update({
          where: { id: reordered[i].id },
          data: { sort_order: i + 1 },
        });
      }
    }

    const updated = await prisma.invitationSection.findFirst({
      where: { id: sectionId },
    });

    return reply.send(updated);
  });

  // POST /events/:id/media/upload
  app.post('/:id/media/upload', async (request: FastifyRequest, reply) => {
    // For dev purposes, just return a mock URL
    // Real implementation would use multipart parsing + cloud storage
    return reply.send({
      url: `http://localhost:4000/uploads/mock-${Date.now()}.jpg`,
    });
  });
}
