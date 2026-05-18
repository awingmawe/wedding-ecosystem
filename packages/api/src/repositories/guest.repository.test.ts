/**
 * Unit tests for PrismaGuestRepository.
 *
 * Tests the Prisma adapter against a mock PrismaClient, verifying that:
 * - All queries are always scoped by tenant_id (Req 1.2)
 * - Data is mapped correctly between Prisma shapes and domain records
 * - New methods (findGuestNamesByEvent, searchGuestsByName) work as expected
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaGuestRepository } from './guest.repository';
import { GuestGroup, GuestType, DeliveryStatus } from '@wedding/shared';

// --- Mock Prisma factory ---

function createMockPrisma() {
  return {
    guest: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    qRCode: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    event: {
      findFirst: vi.fn(),
    },
  };
}

// --- Shared fixtures ---

const BASE_GUEST = {
  id: 'guest-001',
  event_id: 'event-001',
  tenant_id: 'tenant-001',
  name: 'Budi Santoso',
  slug: 'budi-santoso',
  phone: '+6281234567890',
  email: 'budi@example.com',
  group: 'family',
  type: 'invited',
  plus_one_count: 1,
  invitation_url: '/romeo-juliet?to=budi-santoso',
  delivery_status: 'not_sent',
  created_at: new Date('2024-01-15'),
};

const BASE_QR = {
  id: 'qr-001',
  guest_id: 'guest-001',
  qr_payload: 'abc:encrypted123',
  qr_image_url: null,
  is_active: true,
  generated_at: new Date('2024-01-15'),
};

// ---

describe('PrismaGuestRepository', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let repo: PrismaGuestRepository;

  beforeEach(() => {
    prisma = createMockPrisma();
    repo = new PrismaGuestRepository(prisma as any);
  });

  // ─── createGuest ──────────────────────────────────────────────────────────

  describe('createGuest', () => {
    it('should create a guest and return a mapped GuestRecord', async () => {
      prisma.guest.create.mockResolvedValue(BASE_GUEST);

      const result = await repo.createGuest({
        id: 'guest-001',
        event_id: 'event-001',
        tenant_id: 'tenant-001',
        name: 'Budi Santoso',
        slug: 'budi-santoso',
        phone: '+6281234567890',
        email: 'budi@example.com',
        group: GuestGroup.FAMILY,
        type: GuestType.INVITED,
        plus_one_count: 1,
        invitation_url: '/romeo-juliet?to=budi-santoso',
        delivery_status: DeliveryStatus.NOT_SENT,
      });

      expect(result.id).toBe('guest-001');
      expect(result.group).toBe(GuestGroup.FAMILY);
      expect(result.type).toBe(GuestType.INVITED);
      expect(result.delivery_status).toBe(DeliveryStatus.NOT_SENT);
      expect(prisma.guest.create).toHaveBeenCalledOnce();
    });
  });

  // ─── createQRCode ─────────────────────────────────────────────────────────

  describe('createQRCode', () => {
    it('should create a QR code record', async () => {
      prisma.qRCode.create.mockResolvedValue(BASE_QR);

      const result = await repo.createQRCode({
        id: 'qr-001',
        guest_id: 'guest-001',
        qr_payload: 'abc:encrypted123',
        is_active: true,
      });

      expect(result.id).toBe('qr-001');
      expect(result.is_active).toBe(true);
      expect(result.qr_image_url).toBeNull();
    });
  });

  // ─── findGuestById ────────────────────────────────────────────────────────

  describe('findGuestById', () => {
    it('should return a guest scoped by tenant_id (Req 1.2)', async () => {
      prisma.guest.findFirst.mockResolvedValue(BASE_GUEST);

      const result = await repo.findGuestById('guest-001', 'tenant-001');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('guest-001');
      // Must always include tenant_id in the where clause
      expect(prisma.guest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'guest-001', tenant_id: 'tenant-001' },
        })
      );
    });

    it('should return null when guest does not exist or belongs to another tenant', async () => {
      prisma.guest.findFirst.mockResolvedValue(null);

      const result = await repo.findGuestById('guest-001', 'other-tenant');
      expect(result).toBeNull();
    });
  });

  // ─── findGuestsByEvent ────────────────────────────────────────────────────

  describe('findGuestsByEvent', () => {
    const guestWithRelations = {
      ...BASE_GUEST,
      qr_codes: [{ is_active: true }],
      rsvps: [{ attendance: 'both', submitted_at: new Date() }],
      check_ins: [],
    };

    it('should return a paginated list with relation data mapped', async () => {
      prisma.guest.count.mockResolvedValue(1);
      prisma.guest.findMany.mockResolvedValue([guestWithRelations]);

      const result = await repo.findGuestsByEvent('event-001', 'tenant-001', {
        page: 1,
        per_page: 50,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].qr_active).toBe(true);
      expect(result.data[0].rsvp_status).toBe('both');
      expect(result.data[0].check_in_status).toBe(false);
      expect(result.pagination.total).toBe(1);
    });

    it('should mark check_in_status true when check_ins is non-empty', async () => {
      prisma.guest.count.mockResolvedValue(1);
      prisma.guest.findMany.mockResolvedValue([
        {
          ...BASE_GUEST,
          qr_codes: [],
          rsvps: [],
          check_ins: [{ method: 'qr_scan' }],
        },
      ]);

      const result = await repo.findGuestsByEvent('event-001', 'tenant-001', {
        page: 1,
        per_page: 50,
      });

      expect(result.data[0].check_in_status).toBe(true);
      expect(result.data[0].qr_active).toBe(false);
      expect(result.data[0].rsvp_status).toBeNull();
    });

    it('should calculate total_pages correctly', async () => {
      prisma.guest.count.mockResolvedValue(105);
      prisma.guest.findMany.mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => ({
          ...BASE_GUEST,
          id: `guest-${i}`,
          qr_codes: [],
          rsvps: [],
          check_ins: [],
        }))
      );

      const result = await repo.findGuestsByEvent('event-001', 'tenant-001', {
        page: 1,
        per_page: 50,
      });

      // 105 total / 50 per page = 3 pages
      expect(result.pagination.total_pages).toBe(3);
    });

    it('should scope query by both event_id and tenant_id (Req 1.2)', async () => {
      prisma.guest.count.mockResolvedValue(0);
      prisma.guest.findMany.mockResolvedValue([]);

      await repo.findGuestsByEvent('event-001', 'tenant-001', { page: 1, per_page: 50 });

      expect(prisma.guest.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            event_id: 'event-001',
            tenant_id: 'tenant-001',
          }),
        })
      );
    });
  });

  // ─── updateGuest ──────────────────────────────────────────────────────────

  describe('updateGuest', () => {
    it('should update fields and return the updated record', async () => {
      const updated = { ...BASE_GUEST, name: 'Budi Hartono', slug: 'budi-hartono' };
      prisma.guest.updateMany.mockResolvedValue({ count: 1 });
      prisma.guest.findFirst.mockResolvedValue(updated);

      const result = await repo.updateGuest('guest-001', 'tenant-001', {
        name: 'Budi Hartono',
        slug: 'budi-hartono',
      });

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Budi Hartono');
      // Must scope update to tenant
      expect(prisma.guest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'guest-001', tenant_id: 'tenant-001' },
        })
      );
    });

    it('should return null when no rows were updated (wrong tenant)', async () => {
      prisma.guest.updateMany.mockResolvedValue({ count: 0 });

      const result = await repo.updateGuest('guest-001', 'other-tenant', { name: 'X' });
      expect(result).toBeNull();
    });
  });

  // ─── deleteGuest ──────────────────────────────────────────────────────────

  describe('deleteGuest', () => {
    it('should return true when guest is deleted', async () => {
      prisma.guest.deleteMany.mockResolvedValue({ count: 1 });

      const result = await repo.deleteGuest('guest-001', 'tenant-001');
      expect(result).toBe(true);
      expect(prisma.guest.deleteMany).toHaveBeenCalledWith({
        where: { id: 'guest-001', tenant_id: 'tenant-001' },
      });
    });

    it('should return false when no matching guest found (tenant isolation)', async () => {
      prisma.guest.deleteMany.mockResolvedValue({ count: 0 });

      const result = await repo.deleteGuest('guest-001', 'wrong-tenant');
      expect(result).toBe(false);
    });
  });

  // ─── deactivateQRCode ─────────────────────────────────────────────────────

  describe('deactivateQRCode', () => {
    it('should set is_active=false on all active QR codes for the guest', async () => {
      prisma.qRCode.updateMany.mockResolvedValue({ count: 1 });

      const result = await repo.deactivateQRCode('guest-001');

      expect(result).toBe(true);
      expect(prisma.qRCode.updateMany).toHaveBeenCalledWith({
        where: { guest_id: 'guest-001', is_active: true },
        data: { is_active: false },
      });
    });

    it('should return false if no active QR codes existed', async () => {
      prisma.qRCode.updateMany.mockResolvedValue({ count: 0 });

      const result = await repo.deactivateQRCode('guest-no-qr');
      expect(result).toBe(false);
    });
  });

  // ─── checkSlugExists ─────────────────────────────────────────────────────

  describe('checkSlugExists', () => {
    it('should return true when slug exists in the event', async () => {
      prisma.guest.findFirst.mockResolvedValue({ id: 'guest-001' });

      const result = await repo.checkSlugExists('event-001', 'budi-santoso');
      expect(result).toBe(true);
    });

    it('should return false when slug is available', async () => {
      prisma.guest.findFirst.mockResolvedValue(null);

      const result = await repo.checkSlugExists('event-001', 'new-slug');
      expect(result).toBe(false);
    });
  });

  // ─── findGuestNamesByEvent (NEW) ──────────────────────────────────────────

  describe('findGuestNamesByEvent', () => {
    it('should return all guest names for the event, scoped by tenant', async () => {
      prisma.guest.findMany.mockResolvedValue([
        { name: 'Budi Santoso' },
        { name: 'Ani Rahayu' },
        { name: 'Dian Kusuma' },
      ]);

      const names = await repo.findGuestNamesByEvent('event-001', 'tenant-001');

      expect(names).toEqual(['Budi Santoso', 'Ani Rahayu', 'Dian Kusuma']);
      expect(prisma.guest.findMany).toHaveBeenCalledWith({
        where: { event_id: 'event-001', tenant_id: 'tenant-001' },
        select: { name: true },
      });
    });

    it('should return empty array when event has no guests', async () => {
      prisma.guest.findMany.mockResolvedValue([]);

      const names = await repo.findGuestNamesByEvent('event-001', 'tenant-001');
      expect(names).toEqual([]);
    });

    it('should scope query by both event_id and tenant_id (Req 1.2)', async () => {
      prisma.guest.findMany.mockResolvedValue([]);

      await repo.findGuestNamesByEvent('event-001', 'tenant-001');

      expect(prisma.guest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { event_id: 'event-001', tenant_id: 'tenant-001' },
        })
      );
    });
  });

  // ─── searchGuestsByName (NEW) ─────────────────────────────────────────────

  describe('searchGuestsByName', () => {
    it('should return matched guests with case-insensitive partial match', async () => {
      prisma.guest.findMany.mockResolvedValue([BASE_GUEST]);

      const results = await repo.searchGuestsByName('budi', 'event-001', 'tenant-001', 10);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Budi Santoso');
      expect(prisma.guest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            event_id: 'event-001',
            tenant_id: 'tenant-001',
            name: { contains: 'budi', mode: 'insensitive' },
          }),
          take: 10,
        })
      );
    });

    it('should respect the limit parameter', async () => {
      prisma.guest.findMany.mockResolvedValue([BASE_GUEST]);

      await repo.searchGuestsByName('budi', 'event-001', 'tenant-001', 5);

      expect(prisma.guest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 })
      );
    });

    it('should return empty array when no match found', async () => {
      prisma.guest.findMany.mockResolvedValue([]);

      const results = await repo.searchGuestsByName('xyz', 'event-001', 'tenant-001', 10);
      expect(results).toEqual([]);
    });

    it('should scope search to the correct event and tenant (Req 1.2)', async () => {
      prisma.guest.findMany.mockResolvedValue([]);

      await repo.searchGuestsByName('budi', 'event-001', 'tenant-001', 10);

      // Must NOT search across all tenants
      expect(prisma.guest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: 'tenant-001',
            event_id: 'event-001',
          }),
        })
      );
    });
  });

  // ─── findEventById ────────────────────────────────────────────────────────

  describe('findEventById', () => {
    it('should return event when found under the tenant', async () => {
      prisma.event.findFirst.mockResolvedValue({ id: 'event-001', slug: 'romeo-juliet' });

      const result = await repo.findEventById('event-001', 'tenant-001');
      expect(result).toEqual({ id: 'event-001', slug: 'romeo-juliet' });
    });

    it('should return null for cross-tenant access (Req 1.2)', async () => {
      // Simulates: event exists but belongs to a different tenant
      prisma.event.findFirst.mockResolvedValue(null);

      const result = await repo.findEventById('event-001', 'wrong-tenant');
      expect(result).toBeNull();

      // Must query with both event_id and tenant_id
      expect(prisma.event.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'event-001', tenant_id: 'wrong-tenant' },
        })
      );
    });
  });
});
