import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { PrismaClient } from '@wedding/db';

interface MessageRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function messageRoutes(app: FastifyInstance, opts: MessageRouteOptions) {
  const { prisma } = opts;

  // POST /messages - Submit a message (public, no auth required)
  app.post('/', async (request: FastifyRequest, reply) => {
    const { event_id, sender_name, message_text } = request.body as {
      event_id: string;
      sender_name: string;
      message_text: string;
    };

    if (!event_id || !sender_name || !message_text) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'event_id, sender_name, dan message_text diperlukan' },
      });
    }

    // Validate lengths (Req 6.11)
    if (sender_name.length > 100) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'Nama pengirim maksimal 100 karakter' },
      });
    }

    if (message_text.length > 500) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'Isi ucapan maksimal 500 karakter' },
      });
    }

    // Verify event exists
    const event = await prisma.event.findFirst({
      where: { id: event_id },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    const { randomUUID } = await import('crypto');
    const message = await prisma.message.create({
      data: {
        id: randomUUID(),
        event_id,
        sender_name,
        message_text,
        is_visible: true,
        created_at: new Date(),
      },
    });

    return reply.status(201).send(message);
  });

  // GET /messages/:eventId - Get messages for an event (public, paginated)
  app.get('/:eventId', async (request: FastifyRequest, reply) => {
    const { eventId } = request.params as { eventId: string };
    const query = request.query as { page?: string; per_page?: string };

    const page = parseInt(query.page || '1', 10);
    const per_page = Math.min(parseInt(query.per_page || '20', 10), 20);
    const skip = (page - 1) * per_page;

    // Verify event exists
    const event = await prisma.event.findFirst({
      where: { id: eventId },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    const total = await prisma.message.count({
      where: { event_id: eventId, is_visible: true },
    });

    const messages = await prisma.message.findMany({
      where: { event_id: eventId, is_visible: true },
      orderBy: { created_at: 'desc' },
      skip,
      take: per_page,
    });

    return reply.send({
      data: messages,
      pagination: {
        page,
        per_page,
        total,
        total_pages: Math.ceil(total / per_page),
      },
    });
  });
}
