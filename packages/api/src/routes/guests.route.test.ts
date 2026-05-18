/**
 * Route integration tests for /guests endpoints.
 *
 * Tests the thin adapter layer: verifies that routes correctly
 * delegate to GuestService, handle service errors as HTTP responses,
 * and enforce authentication.
 *
 * Uses Fastify's inject() — no real DB, real HTTP, or real GuestService.
 * GuestService is mocked at the module level.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';

// --- Mocks ---

// Mock GuestService and GuestImportService before importing the route
vi.mock('../services/guest.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/guest.service')>();
  return {
    ...actual,
    GuestService: vi.fn().mockImplementation(() => ({
      addGuest: vi.fn(),
      getGuest: vi.fn(),
      updateGuest: vi.fn(),
      deleteGuest: vi.fn(),
      listGuests: vi.fn(),
      searchGuests: vi.fn(),
      generateQRCode: vi.fn(),
      nameToSlug: vi.fn(),
      generateUniqueSlug: vi.fn(),
    })),
  };
});

vi.mock('../services/guest-import.service', () => ({
  bulkImportGuests: vi.fn(),
}));

vi.mock('../repositories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../repositories')>();
  return {
    ...actual,
    PrismaGuestRepository: vi.fn().mockImplementation(() => ({
      findGuestNamesByEvent: vi.fn().mockResolvedValue([]),
    })),
    getCurrentTenantEvent: vi.fn(),
    replyEventNotFound: vi.fn((reply: any) =>
      reply.status(404).send({ success: false, error: { code: 'RES_5001', message: 'Event tidak ditemukan' } })
    ),
  };
});

import { guestRoutes } from '../routes/guests';
import { GuestService, isGuestError } from '../services/guest.service';
import { bulkImportGuests } from '../services/guest-import.service';
import { getCurrentTenantEvent } from '../repositories';
import { GuestGroup, GuestType, DeliveryStatus, ErrorCode } from '@wedding/shared';

// --- Helpers ---

const JWT_SECRET = 'test-secret-key';

function makeToken(tenantId = 'tenant-001', role = 'client') {
  return jwt.sign(
    { sub: 'user-001', tenant_id: tenantId, role, email: 'client@demo.com' },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function makeGuest(overrides = {}) {
  return {
    id: 'guest-001',
    event_id: 'event-001',
    tenant_id: 'tenant-001',
    name: 'Budi Santoso',
    slug: 'budi-santoso',
    phone: '+6281234567890',
    email: 'budi@example.com',
    group: GuestGroup.FAMILY,
    type: GuestType.INVITED,
    plus_one_count: 0,
    invitation_url: '/romeo-juliet?to=budi-santoso',
    delivery_status: DeliveryStatus.NOT_SENT,
    created_at: new Date('2024-01-01'),
    qr_code: null,
    ...overrides,
  };
}

function makeError(code: string, message: string) {
  return { code, message };
}

// --- App factory ---

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();

  // Decorate with authenticate
  app.decorate('authenticate', async function (request: any, reply: any) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ success: false, error: { code: 'AUTH_2002', message: 'Token diperlukan' } });
    }
    try {
      const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as any;
      request.user = { id: decoded.sub, tenant_id: decoded.tenant_id, role: decoded.role };
    } catch {
      return reply.status(401).send({ success: false, error: { code: 'AUTH_2003', message: 'Token tidak valid' } });
    }
  });

  await app.register(guestRoutes, {
    prefix: '/guests',
    prisma: {} as any,
  });

  await app.ready();
  return app;
}

function getServiceInstance(app: FastifyInstance) {
  // GuestService constructor was called once — return the mocked instance
  return vi.mocked(GuestService).mock.results[0]?.value;
}

// ---

describe('Guest Routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Default: tenant has a current event
    vi.mocked(getCurrentTenantEvent).mockResolvedValue({ id: 'event-001', slug: 'romeo-juliet' } as any);
    app = await buildApp();
    token = makeToken();
  });

  // ─── Auth guard ───────────────────────────────────────────────────────────

  describe('Auth enforcement', () => {
    it('should return 401 for all endpoints without a token', async () => {
      const endpoints = [
        { method: 'GET', url: '/guests' },
        { method: 'POST', url: '/guests' },
        { method: 'PUT', url: '/guests/guest-001' },
        { method: 'DELETE', url: '/guests/guest-001' },
        { method: 'GET', url: '/guests/guest-001/qr' },
        { method: 'GET', url: '/guests/search?q=budi' },
        { method: 'POST', url: '/guests/import' },
      ];

      for (const { method, url } of endpoints) {
        const response = await app.inject({ method: method as any, url });
        expect(response.statusCode, `${method} ${url} should be 401`).toBe(401);
      }
    });
  });

  // ─── GET /guests ──────────────────────────────────────────────────────────

  describe('GET /guests', () => {
    it('should return paginated guest list', async () => {
      const mockList = {
        data: [{ id: 'guest-001', name: 'Budi Santoso', invitation_url: '/romeo-juliet?to=budi' }],
        pagination: { page: 1, per_page: 50, total: 1, total_pages: 1 },
      };

      const service = getServiceInstance(app);
      service.listGuests.mockResolvedValue(mockList);

      const response = await app.inject({
        method: 'GET',
        url: '/guests',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(service.listGuests).toHaveBeenCalledWith(
        'event-001',
        'tenant-001',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should return flat delivery_status shape when include=delivery_status', async () => {
      const service = getServiceInstance(app);
      service.listGuests.mockResolvedValue({
        data: [{ id: 'g-1', name: 'Budi', slug: 'budi', phone: null, email: null, delivery_status: 'not_sent', invitation_url: '/event?to=budi' }],
        pagination: { page: 1, per_page: 50, total: 1, total_pages: 1 },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/guests?include=delivery_status',
        headers: { authorization: `Bearer ${token}` },
      });

      const body = JSON.parse(response.body);
      // Different shape — flat list under `guests` key
      expect(body.guests).toBeDefined();
      expect(body.guests[0]).toHaveProperty('delivery_status');
      expect(body.guests[0]).toHaveProperty('invitation_url');
    });

    it('should return empty list when tenant has no events', async () => {
      vi.mocked(getCurrentTenantEvent).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/guests',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual([]);
    });
  });

  // ─── POST /guests ─────────────────────────────────────────────────────────

  describe('POST /guests', () => {
    it('should create a guest and return 201', async () => {
      const mockResult = makeGuest();
      const service = getServiceInstance(app);
      service.addGuest.mockResolvedValue(mockResult);

      const response = await app.inject({
        method: 'POST',
        url: '/guests',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Budi Santoso', group: 'family' }),
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('Budi Santoso');
      expect(service.addGuest).toHaveBeenCalledWith(
        'event-001',
        'tenant-001',
        expect.objectContaining({ name: 'Budi Santoso', group: 'family' })
      );
    });

    it('should return 400 when name or group is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guests',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Budi' }), // no group
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when service returns an error', async () => {
      const service = getServiceInstance(app);
      service.addGuest.mockResolvedValue(makeError(ErrorCode.ALREADY_EXISTS, 'Duplikat slug'));

      const response = await app.inject({
        method: 'POST',
        url: '/guests',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Budi Santoso', group: 'family' }),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should return 404 when event not found', async () => {
      vi.mocked(getCurrentTenantEvent).mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/guests',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Budi Santoso', group: 'family' }),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ─── PUT /guests/:id ──────────────────────────────────────────────────────

  describe('PUT /guests/:id', () => {
    it('should update a guest and return the updated record', async () => {
      const updated = makeGuest({ name: 'Budi Hartono' });
      const service = getServiceInstance(app);
      service.updateGuest.mockResolvedValue(updated);

      const response = await app.inject({
        method: 'PUT',
        url: '/guests/guest-001',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Budi Hartono' }),
      });

      expect(response.statusCode).toBe(200);
      expect(service.updateGuest).toHaveBeenCalledWith(
        'guest-001',
        'tenant-001',
        expect.objectContaining({ name: 'Budi Hartono' })
      );
    });

    it('should return 404 when guest not found', async () => {
      const service = getServiceInstance(app);
      service.updateGuest.mockResolvedValue(makeError(ErrorCode.GUEST_NOT_FOUND, 'Tamu tidak ditemukan'));

      const response = await app.inject({
        method: 'PUT',
        url: '/guests/nonexistent',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ─── DELETE /guests/:id ───────────────────────────────────────────────────

  describe('DELETE /guests/:id', () => {
    it('should delete a guest and return success', async () => {
      const service = getServiceInstance(app);
      service.deleteGuest.mockResolvedValue({ success: true });

      const response = await app.inject({
        method: 'DELETE',
        url: '/guests/guest-001',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(service.deleteGuest).toHaveBeenCalledWith('guest-001', 'tenant-001');
    });

    it('should return 404 when guest not found', async () => {
      const service = getServiceInstance(app);
      service.deleteGuest.mockResolvedValue(makeError(ErrorCode.GUEST_NOT_FOUND, 'Tamu tidak ditemukan'));

      const response = await app.inject({
        method: 'DELETE',
        url: '/guests/nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ─── GET /guests/:id/qr ───────────────────────────────────────────────────

  describe('GET /guests/:id/qr', () => {
    it('should return QR code data for a guest', async () => {
      const guestWithQR = makeGuest({
        qr_code: {
          id: 'qr-001',
          qr_payload: 'abc:encrypted',
          qr_image_url: 'https://cdn.example.com/qr.png',
          is_active: true,
        },
      });
      const service = getServiceInstance(app);
      service.getGuest.mockResolvedValue(guestWithQR);

      const response = await app.inject({
        method: 'GET',
        url: '/guests/guest-001/qr',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.qr_payload).toBe('abc:encrypted');
      expect(body.is_active).toBe(true);
    });

    it('should return null QR fields when guest has no QR code', async () => {
      const service = getServiceInstance(app);
      service.getGuest.mockResolvedValue(makeGuest({ qr_code: null }));

      const response = await app.inject({
        method: 'GET',
        url: '/guests/guest-001/qr',
        headers: { authorization: `Bearer ${token}` },
      });

      const body = JSON.parse(response.body);
      expect(body.qr_payload).toBeNull();
      expect(body.is_active).toBe(false);
    });

    it('should return 404 when guest not found', async () => {
      const service = getServiceInstance(app);
      service.getGuest.mockResolvedValue(makeError(ErrorCode.GUEST_NOT_FOUND, 'Tamu tidak ditemukan'));

      const response = await app.inject({
        method: 'GET',
        url: '/guests/nonexistent/qr',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ─── GET /guests/search ───────────────────────────────────────────────────

  describe('GET /guests/search', () => {
    it('should return matched guests for a valid query', async () => {
      const service = getServiceInstance(app);
      service.searchGuests.mockResolvedValue([makeGuest()]);

      const response = await app.inject({
        method: 'GET',
        url: '/guests/search?q=budi',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(service.searchGuests).toHaveBeenCalledWith('event-001', 'tenant-001', 'budi');
    });

    it('should return 400 when q parameter is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/guests/search',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when service rejects short query', async () => {
      const service = getServiceInstance(app);
      service.searchGuests.mockResolvedValue(
        makeError(ErrorCode.VALIDATION_FAILED, 'Kata kunci pencarian minimal 3 karakter')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/guests/search?q=bu',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ─── POST /guests/import ──────────────────────────────────────────────────

  describe('POST /guests/import', () => {
    it('should run bulk import and return report', async () => {
      vi.mocked(bulkImportGuests).mockResolvedValue({
        successCount: 2,
        failedRows: [],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/guests/import',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ csv_text: 'nama,grup\nBudi Santoso,family\nAni Rahayu,friend' }),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.imported).toBe(2);
      expect(body.errors).toBe(0);
    });

    it('should return 400 when csv_text is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guests/import',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 404 when tenant has no events', async () => {
      vi.mocked(getCurrentTenantEvent).mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/guests/import',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ csv_text: 'nama,grup\nBudi,family' }),
      });

      expect(response.statusCode).toBe(404);
    });

    it('should include partial failure details in the report', async () => {
      vi.mocked(bulkImportGuests).mockResolvedValue({
        successCount: 1,
        failedRows: [{ row: 3, reason: 'Duplikat nama dalam event: "Budi Santoso"' }],
      });

      const response = await app.inject({
        method: 'POST',
        url: '/guests/import',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ csv_text: 'nama,grup\nAni,friend\nBudi Santoso,family' }),
      });

      const body = JSON.parse(response.body);
      expect(body.imported).toBe(1);
      expect(body.errors).toBe(1);
      expect(body.details[0].row).toBe(3);
    });
  });
});
