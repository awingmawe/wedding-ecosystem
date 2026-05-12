import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

interface GuestRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function guestRoutes(app: FastifyInstance, opts: GuestRouteOptions) {
  const { prisma } = opts;

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

    const page = parseInt(query.page || '1', 10);
    const per_page = Math.min(parseInt(query.per_page || '50', 10), 50);
    const skip = (page - 1) * per_page;

    // Build where clause
    const where: any = { tenant_id: user.tenant_id };
    if (query.group) {
      where.group = query.group;
    }

    // Get total count
    const total = await prisma.guest.count({ where });
    const total_pages = Math.ceil(total / per_page);

    // Get guests with related data
    const guests = await prisma.guest.findMany({
      where,
      skip,
      take: per_page,
      orderBy: { created_at: 'desc' },
      include: {
        qr_codes: { where: { is_active: true }, take: 1 },
        rsvps: { take: 1, orderBy: { submitted_at: 'desc' } },
        check_ins: { take: 1 },
      },
    });

    const data = guests.map((guest) => ({
      id: guest.id,
      name: guest.name,
      slug: guest.slug,
      group: guest.group,
      type: guest.type,
      plus_one_count: guest.plus_one_count,
      phone: guest.phone,
      email: guest.email,
      delivery_status: guest.delivery_status,
      rsvp_status: guest.rsvps[0]?.attendance || null,
      check_in_status: guest.check_ins.length > 0,
      qr_active: guest.qr_codes.length > 0 && guest.qr_codes[0].is_active,
    }));

    // If include=delivery_status, return in the format the notifications page expects
    if (query.include === 'delivery_status') {
      return reply.send({
        guests: guests.map((guest) => ({
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

    return reply.send({
      data,
      pagination: { page, per_page, total, total_pages },
    });
  });

  // POST /guests
  app.post('/', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const body = request.body as {
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

    // Find event for this tenant
    const event = await prisma.event.findFirst({
      where: { tenant_id: user.tenant_id },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    // Generate slug
    const slug = body.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const guestId = randomUUID();
    const invitationUrl = `/${event.slug}?to=${slug}`;

    const guest = await prisma.guest.create({
      data: {
        id: guestId,
        event_id: event.id,
        tenant_id: user.tenant_id,
        name: body.name,
        slug,
        phone: body.phone || null,
        email: body.email || null,
        group: body.group as any,
        type: 'invited',
        plus_one_count: body.plus_one_count || 0,
        invitation_url: invitationUrl,
        delivery_status: 'not_sent',
      },
    });

    // Generate QR code
    const qrPayload = `${guestId}:${event.id}:${Date.now()}`;
    await prisma.qRCode.create({
      data: {
        id: randomUUID(),
        guest_id: guestId,
        qr_payload: qrPayload,
        is_active: true,
      },
    });

    return reply.status(201).send(guest);
  });

  // PUT /guests/:id
  app.put('/:id', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;

    const guest = await prisma.guest.findFirst({
      where: { id, tenant_id: user.tenant_id },
    });

    if (!guest) {
      return reply.status(404).send({
        success: false,
        error: { code: 'GUEST_6001', message: 'Tamu tidak ditemukan' },
      });
    }

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.group !== undefined) updateData.group = body.group;
    if (body.phone !== undefined) updateData.phone = body.phone || null;
    if (body.email !== undefined) updateData.email = body.email || null;
    if (body.plus_one_count !== undefined) updateData.plus_one_count = body.plus_one_count;

    const updated = await prisma.guest.update({
      where: { id },
      data: updateData,
    });

    return reply.send(updated);
  });

  // POST /guests/import
  app.post('/import', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { csv_text } = request.body as { csv_text: string };

    if (!csv_text) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'CSV text diperlukan' },
      });
    }

    const event = await prisma.event.findFirst({
      where: { tenant_id: user.tenant_id },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    // Parse CSV (simple: name,group,phone,email)
    const lines = csv_text.trim().split('\n');
    const header = lines[0].toLowerCase();
    const dataLines = lines.slice(1);

    const imported: any[] = [];
    const errors: any[] = [];

    for (let i = 0; i < dataLines.length; i++) {
      const cols = dataLines[i].split(',').map((c) => c.trim());
      const name = cols[0];
      const group = cols[1] || 'friend';
      const phone = cols[2] || null;
      const email = cols[3] || null;

      if (!name) {
        errors.push({ row: i + 2, message: 'Nama kosong' });
        continue;
      }

      const slug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      const guestId = randomUUID();
      try {
        const guest = await prisma.guest.create({
          data: {
            id: guestId,
            event_id: event.id,
            tenant_id: user.tenant_id,
            name,
            slug: `${slug}-${i}`,
            phone,
            email,
            group: (['family', 'friend', 'colleague', 'vip'].includes(group) ? group : 'friend') as any,
            type: 'invited',
            plus_one_count: 0,
            invitation_url: `/${event.slug}?to=${slug}-${i}`,
            delivery_status: 'not_sent',
          },
        });

        // Generate QR
        await prisma.qRCode.create({
          data: {
            id: randomUUID(),
            guest_id: guestId,
            qr_payload: `${guestId}:${event.id}:${Date.now()}:${i}`,
            is_active: true,
          },
        });

        imported.push(guest);
      } catch (err: any) {
        errors.push({ row: i + 2, message: err.message });
      }
    }

    return reply.send({
      imported: imported.length,
      errors: errors.length,
      details: errors,
    });
  });

  // GET /guests/:id/qr
  app.get('/:id/qr', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const guest = await prisma.guest.findFirst({
      where: { id, tenant_id: user.tenant_id },
      include: { qr_codes: { where: { is_active: true }, take: 1 } },
    });

    if (!guest) {
      return reply.status(404).send({
        success: false,
        error: { code: 'GUEST_6001', message: 'Tamu tidak ditemukan' },
      });
    }

    const qr = guest.qr_codes[0];
    return reply.send({
      qr_image_url: qr?.qr_image_url || null,
      qr_payload: qr?.qr_payload || null,
      is_active: qr?.is_active || false,
    });
  });

  // GET /guests/search
  app.get('/search', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const query = request.query as { q?: string; event_id?: string };

    if (!query.q || query.q.length < 3) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'Kata kunci pencarian minimal 3 karakter' },
      });
    }

    const where: any = {
      tenant_id: user.tenant_id,
      name: { contains: query.q, mode: 'insensitive' },
    };

    if (query.event_id) {
      where.event_id = query.event_id;
    }

    const guests = await prisma.guest.findMany({
      where,
      take: 10,
      orderBy: { name: 'asc' },
    });

    return reply.send({ data: guests });
  });
}
