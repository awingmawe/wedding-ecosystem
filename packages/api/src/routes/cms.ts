import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { PrismaClient } from '@wedding/db';
import { PrismaCMSRepository } from '../repositories';
import { CMSService, isCMSError } from '../services/cms.service';
import { ErrorCode } from '@wedding/shared';

interface CMSRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function cmsRoutes(app: FastifyInstance, opts: CMSRouteOptions) {
  const { prisma } = opts;
  const repository = new PrismaCMSRepository(prisma);
  const cmsService = new CMSService({ repository });

  // Auth hook for all CMS routes
  app.addHook('onRequest', async (request, reply) => {
    await (app as any).authenticate(request, reply);
  });

  // GET /cms/sections/:eventId - List all sections for an event
  app.get('/sections/:eventId', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { eventId } = request.params as { eventId: string };

    const sections = await cmsService.listSections(eventId, user.tenant_id);

    if (isCMSError(sections)) {
      return reply.status(sections.code === ErrorCode.NOT_FOUND ? 404 : 400).send({
        success: false,
        error: sections,
      });
    }

    return reply.send({ data: sections });
  });

  // GET /cms/sections/:eventId/:sectionId - Get a single section
  app.get('/sections/:eventId/:sectionId', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { eventId, sectionId } = request.params as { eventId: string; sectionId: string };

    const section = await cmsService.getSection(sectionId, eventId, user.tenant_id);

    if (isCMSError(section)) {
      return reply.status(404).send({
        success: false,
        error: section,
      });
    }

    return reply.send(section);
  });

  // PUT /cms/sections/:eventId/:sectionId/content - Update section content
  app.put('/sections/:eventId/:sectionId/content', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { eventId, sectionId } = request.params as { eventId: string; sectionId: string };
    const { content } = request.body as { content: Record<string, unknown> };

    const updated = await cmsService.updateSectionContent(sectionId, eventId, user.tenant_id, content);

    if (isCMSError(updated)) {
      return reply.status(updated.code === ErrorCode.NOT_FOUND ? 404 : 400).send({
        success: false,
        error: updated,
      });
    }

    return reply.send(updated);
  });

  // PUT /cms/sections/:eventId/:sectionId/toggle - Activate/deactivate section
  app.put('/sections/:eventId/:sectionId/toggle', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { eventId, sectionId } = request.params as { eventId: string; sectionId: string };
    const { is_active } = request.body as { is_active: boolean };

    const updated = await cmsService.toggleSectionActive(sectionId, eventId, user.tenant_id, is_active);

    if (isCMSError(updated)) {
      return reply.status(updated.code === ErrorCode.NOT_FOUND ? 404 : 400).send({
        success: false,
        error: updated,
      });
    }

    return reply.send(updated);
  });

  // PUT /cms/sections/:eventId/:sectionId/reorder - Change section sort order
  app.put('/sections/:eventId/:sectionId/reorder', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { eventId, sectionId } = request.params as { eventId: string; sectionId: string };
    const { position } = request.body as { position: number };

    const updated = await cmsService.updateSortOrder(sectionId, eventId, user.tenant_id, position);

    if (isCMSError(updated)) {
      return reply.status(updated.code === ErrorCode.NOT_FOUND ? 404 : 400).send({
        success: false,
        error: updated,
      });
    }

    return reply.send(updated);
  });

  // POST /cms/media/upload/:eventId - Upload media file
  app.post('/media/upload/:eventId', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { eventId } = request.params as { eventId: string };

    const result = await cmsService.uploadMedia(eventId, user.tenant_id);

    if (isCMSError(result)) {
      return reply.status(result.code === ErrorCode.NOT_FOUND ? 404 : 501).send({
        success: false,
        error: result,
      });
    }

    return reply.send({
      success: true,
      url: result.url,
    });
  });
}
