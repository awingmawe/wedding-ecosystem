import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';
import type { RealtimeServer } from '@wedding/realtime';

interface CheckInRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
  realtime: RealtimeServer | null;
}

export async function checkinRoutes(app: FastifyInstance, opts: CheckInRouteOptions) {
  const { prisma, realtime } = opts;

  // Auth hook for all check-in routes
  app.addHook('onRequest', async (request, reply) => {
    await (app as any).authenticate(request, reply);
  });

  // POST /checkin/scan - QR code scan verification
  app.post('/scan', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { qr_payload, event_id, scanner_device_id } = request.body as {
      qr_payload: string;
      event_id: string;
      scanner_device_id?: string;
    };

    if (!qr_payload || !event_id) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'qr_payload dan event_id diperlukan' },
      });
    }

    // Verify event belongs to tenant
    const event = await prisma.event.findFirst({
      where: { id: event_id, tenant_id: user.tenant_id },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    // Find QR code by payload
    const qrCode = await prisma.qRCode.findFirst({
      where: { qr_payload },
      include: { guest: true },
    });

    if (!qrCode || !qrCode.is_active) {
      return reply.send({
        status: 'RED',
        guest_name: null,
        guest_group: null,
        message: 'QR code tidak valid',
        checked_in_at: null,
      });
    }

    // Validate guest belongs to this event
    if (qrCode.guest.event_id !== event_id) {
      return reply.send({
        status: 'RED',
        guest_name: null,
        guest_group: null,
        message: 'QR code bukan untuk event ini',
        checked_in_at: null,
      });
    }

    // Check if already checked in
    const existingCheckIn = await prisma.checkIn.findFirst({
      where: { guest_id: qrCode.guest_id },
    });

    if (existingCheckIn) {
      return reply.send({
        status: 'YELLOW',
        guest_name: qrCode.guest.name,
        guest_group: qrCode.guest.group,
        message: 'Tamu sudah check-in sebelumnya',
        checked_in_at: existingCheckIn.checked_in_at.toISOString(),
      });
    }

    // Create check-in record
    const { randomUUID } = await import('crypto');
    const now = new Date();
    const checkIn = await prisma.checkIn.create({
      data: {
        id: randomUUID(),
        guest_id: qrCode.guest_id,
        scanner_device_id: scanner_device_id || null,
        method: 'qr_scan',
        checked_in_at: now,
      },
    });

    // Broadcast via WebSocket
    if (realtime) {
      realtime.broadcastCheckIn(event_id, {
        guest_id: qrCode.guest_id,
        guest_name: qrCode.guest.name,
        group: qrCode.guest.group,
        method: 'qr_scan',
        checked_in_at: now.toISOString(),
        event_id,
      });
    }

    return reply.send({
      status: 'GREEN',
      guest_name: qrCode.guest.name,
      guest_group: qrCode.guest.group,
      message: 'Check-in berhasil',
      checked_in_at: now.toISOString(),
    });
  });

  // POST /checkin/manual - Manual check-in by guest ID
  app.post('/manual', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { guest_id, event_id, scanner_device_id } = request.body as {
      guest_id: string;
      event_id: string;
      scanner_device_id?: string;
    };

    if (!guest_id || !event_id) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'guest_id dan event_id diperlukan' },
      });
    }

    // Verify event belongs to tenant
    const event = await prisma.event.findFirst({
      where: { id: event_id, tenant_id: user.tenant_id },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    // Find guest in this event
    const guest = await prisma.guest.findFirst({
      where: { id: guest_id, event_id },
    });

    if (!guest) {
      return reply.status(404).send({
        success: false,
        error: { code: 'GUEST_6001', message: 'Tamu tidak ditemukan' },
      });
    }

    // Check if already checked in
    const existingCheckIn = await prisma.checkIn.findFirst({
      where: { guest_id },
    });

    if (existingCheckIn) {
      return reply.status(409).send({
        success: false,
        error: { code: 'CHECKIN_7001', message: 'Tamu sudah check-in sebelumnya' },
        checked_in_at: existingCheckIn.checked_in_at.toISOString(),
      });
    }

    // Create check-in record
    const { randomUUID } = await import('crypto');
    const now = new Date();
    const checkIn = await prisma.checkIn.create({
      data: {
        id: randomUUID(),
        guest_id,
        scanner_device_id: scanner_device_id || null,
        method: 'manual',
        checked_in_at: now,
      },
    });

    // Broadcast via WebSocket
    if (realtime) {
      realtime.broadcastCheckIn(event_id, {
        guest_id,
        guest_name: guest.name,
        group: guest.group,
        method: 'manual',
        checked_in_at: now.toISOString(),
        event_id,
      });
    }

    return reply.send({
      success: true,
      guest_name: guest.name,
      checked_in_at: now.toISOString(),
    });
  });

  // POST /checkin/go-show - Register Go-Show guest
  app.post('/go-show', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { name, event_id, scanner_device_id } = request.body as {
      name: string;
      event_id: string;
      scanner_device_id?: string;
    };

    if (!name || !event_id) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'Nama dan event_id diperlukan' },
      });
    }

    // Verify event belongs to tenant
    const event = await prisma.event.findFirst({
      where: { id: event_id, tenant_id: user.tenant_id },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
      });
    }

    // Create Go-Show guest
    const { randomUUID } = await import('crypto');
    const guestId = randomUUID();
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const guest = await prisma.guest.create({
      data: {
        id: guestId,
        event_id,
        tenant_id: user.tenant_id,
        name: name.trim(),
        slug: `${slug}-goshow-${Date.now()}`,
        type: 'go_show',
        group: 'friend',
        plus_one_count: 0,
        delivery_status: 'not_sent',
      },
    });

    // Immediately create check-in record
    const now = new Date();
    await prisma.checkIn.create({
      data: {
        id: randomUUID(),
        guest_id: guestId,
        scanner_device_id: scanner_device_id || null,
        method: 'go_show',
        checked_in_at: now,
      },
    });

    // Broadcast via WebSocket
    if (realtime) {
      realtime.broadcastGoShow(event_id, {
        guest_id: guestId,
        guest_name: name.trim(),
        checked_in_at: now.toISOString(),
        event_id,
      });
    }

    return reply.status(201).send({
      success: true,
      guest_id: guestId,
      guest_name: name.trim(),
      checked_in_at: now.toISOString(),
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

    const results: Array<{ guest_id: string; status: 'synced' | 'duplicate' | 'error'; message?: string }> = [];

    for (const record of records) {
      // Verify event belongs to tenant
      const event = await prisma.event.findFirst({
        where: { id: record.event_id, tenant_id: user.tenant_id },
      });

      if (!event) {
        results.push({ guest_id: record.guest_id, status: 'error', message: 'Event tidak ditemukan' });
        continue;
      }

      // Check if already checked in (idempotency)
      const existing = await prisma.checkIn.findFirst({
        where: { guest_id: record.guest_id },
      });

      if (existing) {
        // Idempotent: ignore duplicate without error
        results.push({ guest_id: record.guest_id, status: 'duplicate' });
        continue;
      }

      // Create check-in record
      const { randomUUID } = await import('crypto');
      await prisma.checkIn.create({
        data: {
          id: randomUUID(),
          guest_id: record.guest_id,
          scanner_device_id: record.scanner_device_id || null,
          method: record.method as any,
          checked_in_at: new Date(record.checked_in_at),
        },
      });

      results.push({ guest_id: record.guest_id, status: 'synced' });

      // Broadcast each synced check-in
      if (realtime) {
        const guest = await prisma.guest.findFirst({ where: { id: record.guest_id } });
        if (guest) {
          realtime.broadcastCheckIn(record.event_id, {
            guest_id: record.guest_id,
            guest_name: guest.name,
            group: guest.group,
            method: record.method,
            checked_in_at: record.checked_in_at,
            event_id: record.event_id,
          });
        }
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
}
