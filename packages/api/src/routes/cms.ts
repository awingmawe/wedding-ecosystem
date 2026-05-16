import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';

interface CMSRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function cmsRoutes(app: FastifyInstance, opts: CMSRouteOptions) {
  const { prisma } = opts;

  // Auth hook for all CMS routes
  app.addHook('onRequest', async (request, reply) => {
    await (app as any).authenticate(request, reply);
  });

  // GET /cms/sections/:eventId - List all sections for an event
  app.get('/sections/:eventId', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { eventId } = request.params as { eventId: string };

    // Verify event belongs to tenant
    const event = await prisma.event.findFirst({
      where: { id: eventId, tenant_id: user.tenant_id },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    const sections = await prisma.invitationSection.findMany({
      where: { event_id: eventId },
      orderBy: { sort_order: 'asc' },
    });

    return reply.send({ data: sections });
  });

  // GET /cms/sections/:eventId/:sectionId - Get a single section
  app.get('/sections/:eventId/:sectionId', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { eventId, sectionId } = request.params as { eventId: string; sectionId: string };

    const event = await prisma.event.findFirst({
      where: { id: eventId, tenant_id: user.tenant_id },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    const section = await prisma.invitationSection.findFirst({
      where: { id: sectionId, event_id: eventId },
    });

    if (!section) {
      return reply.status(404).send({
        success: false,
        error: { code: 'CMS_9001', message: 'Section tidak ditemukan' },
      });
    }

    return reply.send(section);
  });

  // PUT /cms/sections/:eventId/:sectionId/content - Update section content
  app.put('/sections/:eventId/:sectionId/content', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { eventId, sectionId } = request.params as { eventId: string; sectionId: string };
    const { content } = request.body as { content: Record<string, unknown> };

    const event = await prisma.event.findFirst({
      where: { id: eventId, tenant_id: user.tenant_id },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    const section = await prisma.invitationSection.findFirst({
      where: { id: sectionId, event_id: eventId },
    });

    if (!section) {
      return reply.status(404).send({
        success: false,
        error: { code: 'CMS_9001', message: 'Section tidak ditemukan' },
      });
    }

    const updated = await prisma.invitationSection.update({
      where: { id: sectionId },
      data: { content: content as any, updated_at: new Date() },
    });

    return reply.send(updated);
  });

  // PUT /cms/sections/:eventId/:sectionId/toggle - Activate/deactivate section
  app.put('/sections/:eventId/:sectionId/toggle', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { eventId, sectionId } = request.params as { eventId: string; sectionId: string };
    const { is_active } = request.body as { is_active: boolean };

    const event = await prisma.event.findFirst({
      where: { id: eventId, tenant_id: user.tenant_id },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    const section = await prisma.invitationSection.findFirst({
      where: { id: sectionId, event_id: eventId },
    });

    if (!section) {
      return reply.status(404).send({
        success: false,
        error: { code: 'CMS_9001', message: 'Section tidak ditemukan' },
      });
    }

    const updated = await prisma.invitationSection.update({
      where: { id: sectionId },
      data: { is_active, updated_at: new Date() },
    });

    // Resequence sort orders after toggle
    const allSections = await prisma.invitationSection.findMany({
      where: { event_id: eventId },
      orderBy: { sort_order: 'asc' },
    });

    for (let i = 0; i < allSections.length; i++) {
      if (allSections[i].sort_order !== i + 1) {
        await prisma.invitationSection.update({
          where: { id: allSections[i].id },
          data: { sort_order: i + 1 },
        });
      }
    }

    return reply.send(updated);
  });

  // PUT /cms/sections/:eventId/:sectionId/reorder - Change section sort order
  app.put('/sections/:eventId/:sectionId/reorder', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { eventId, sectionId } = request.params as { eventId: string; sectionId: string };
    const { position } = request.body as { position: number };

    const event = await prisma.event.findFirst({
      where: { id: eventId, tenant_id: user.tenant_id },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    const allSections = await prisma.invitationSection.findMany({
      where: { event_id: eventId },
      orderBy: { sort_order: 'asc' },
    });

    const section = allSections.find((s) => s.id === sectionId);
    if (!section) {
      return reply.status(404).send({
        success: false,
        error: { code: 'CMS_9001', message: 'Section tidak ditemukan' },
      });
    }

    if (position < 1 || position > allSections.length) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: `Urutan harus antara 1 dan ${allSections.length}` },
      });
    }

    // Reorder
    const reordered = allSections.filter((s) => s.id !== sectionId);
    reordered.splice(position - 1, 0, section);

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

  // POST /cms/media/upload/:eventId - Upload media file
  app.post('/media/upload/:eventId', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { eventId } = request.params as { eventId: string };

    const event = await prisma.event.findFirst({
      where: { id: eventId, tenant_id: user.tenant_id },
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
