import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { ScannerLane } from '@wedding/shared';

interface ScannerRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function scannerRoutes(app: FastifyInstance, opts: ScannerRouteOptions) {
  const { prisma } = opts;

  // Auth hook for all scanner routes
  app.addHook('onRequest', async (request, reply) => {
    await (app as any).authenticate(request, reply);
  });

  // POST /scanner/devices/register - Register a scanner device
  app.post('/devices/register', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { event_id, device_name, lane } = request.body as {
      event_id: string;
      device_name: string;
      lane?: string;
    };

    if (!event_id || !device_name) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VAL_4001', message: 'event_id dan device_name diperlukan' },
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

    // Check active device count (max 2 per event)
    const activeDevices = await prisma.scannerDevice.count({
      where: { event_id, is_active: true },
    });

    if (activeDevices >= 2) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'SCANNER_7001',
          message: 'Batas maksimal 2 scanner device per event telah tercapai',
        },
      });
    }

    // Create scanner device
    const { randomUUID } = await import('crypto');
    const device = await prisma.scannerDevice.create({
      data: {
        id: randomUUID(),
        event_id,
        device_name,
        lane: (lane as ScannerLane) || (activeDevices === 0 ? ScannerLane.LANE_1 : ScannerLane.LANE_2),
        is_active: true,
        last_active_at: new Date(),
      },
    });

    return reply.status(201).send(device);
  });

  // PUT /scanner/devices/:deviceId/heartbeat - Update device heartbeat
  app.put('/devices/:deviceId/heartbeat', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { deviceId } = request.params as { deviceId: string };

    const device = await prisma.scannerDevice.findFirst({
      where: { id: deviceId },
      include: { event: true },
    });

    if (!device || device.event.tenant_id !== user.tenant_id) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Device tidak ditemukan' },
      });
    }

    const updated = await prisma.scannerDevice.update({
      where: { id: deviceId },
      data: { last_active_at: new Date() },
    });

    return reply.send(updated);
  });

  // DELETE /scanner/devices/:deviceId - Deactivate a scanner device
  app.delete('/devices/:deviceId', async (request: FastifyRequest, reply) => {
    const user = request.user!;
    const { deviceId } = request.params as { deviceId: string };

    const device = await prisma.scannerDevice.findFirst({
      where: { id: deviceId },
      include: { event: true },
    });

    if (!device || device.event.tenant_id !== user.tenant_id) {
      return reply.status(404).send({
        success: false,
        error: { code: 'RES_5001', message: 'Device tidak ditemukan' },
      });
    }

    const updated = await prisma.scannerDevice.update({
      where: { id: deviceId },
      data: { is_active: false },
    });

    return reply.send({ success: true, device: updated });
  });

  // GET /scanner/devices/:eventId - List active scanner devices for an event
  app.get('/devices/:eventId', async (request: FastifyRequest, reply) => {
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

    const devices = await prisma.scannerDevice.findMany({
      where: { event_id: eventId, is_active: true },
      orderBy: { last_active_at: 'desc' },
    });

    return reply.send({ data: devices });
  });

  // GET /scanner/guests/:eventId - Get guest cache for offline use
  app.get('/guests/:eventId', async (request: FastifyRequest, reply) => {
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

    // Return guest data for offline cache (name, QR payload, check-in status)
    const guests = await prisma.guest.findMany({
      where: { event_id: eventId },
      include: {
        qr_codes: { where: { is_active: true }, take: 1 },
        check_ins: { take: 1 },
      },
    });

    const data = guests.map((guest) => ({
      id: guest.id,
      name: guest.name,
      group: guest.group,
      type: guest.type,
      qr_payload: guest.qr_codes[0]?.qr_payload || null,
      is_checked_in: guest.check_ins.length > 0,
      checked_in_at: guest.check_ins[0]?.checked_in_at?.toISOString() || null,
    }));

    return reply.send({ data, cached_at: new Date().toISOString() });
  });
}
