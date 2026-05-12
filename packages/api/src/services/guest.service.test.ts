import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDecipheriv } from 'crypto';
import {
  GuestService,
  GuestRepository,
  GuestRecord,
  QRCodeRecord,
  GuestListItem,
  PaginatedGuestList,
  isGuestError,
  GUEST_CONSTANTS,
} from './guest.service';
import { GuestGroup, GuestType, DeliveryStatus, ErrorCode } from '@wedding/shared';

// --- Test Helpers ---

const TEST_ENCRYPTION_KEY =
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

function createMockRepository(): GuestRepository {
  return {
    createGuest: vi.fn(),
    createQRCode: vi.fn(),
    findGuestById: vi.fn(),
    findGuestBySlug: vi.fn(),
    findGuestsByEvent: vi.fn(),
    updateGuest: vi.fn(),
    deleteGuest: vi.fn(),
    deactivateQRCode: vi.fn(),
    findQRCodeByGuestId: vi.fn(),
    checkSlugExists: vi.fn(),
    checkQRPayloadExists: vi.fn(),
    findEventById: vi.fn(),
  };
}

function createMockGuest(overrides: Partial<GuestRecord> = {}): GuestRecord {
  return {
    id: 'guest-001',
    event_id: 'event-001',
    tenant_id: 'tenant-001',
    name: 'John Doe',
    slug: 'john-doe',
    phone: '+6281234567890',
    email: 'john@example.com',
    group: GuestGroup.FRIEND,
    type: GuestType.INVITED,
    plus_one_count: 1,
    invitation_url: '/wedding-event?to=john-doe',
    delivery_status: DeliveryStatus.NOT_SENT,
    created_at: new Date('2024-01-01'),
    ...overrides,
  };
}

function createMockQRCode(overrides: Partial<QRCodeRecord> = {}): QRCodeRecord {
  return {
    id: 'qr-001',
    guest_id: 'guest-001',
    qr_payload: 'abc123:encrypted_data',
    qr_image_url: null,
    is_active: true,
    generated_at: new Date('2024-01-01'),
    ...overrides,
  };
}

// --- Tests ---

describe('GuestService', () => {
  let service: GuestService;
  let repository: GuestRepository;

  beforeEach(() => {
    repository = createMockRepository();
    service = new GuestService({
      repository,
      encryptionKey: TEST_ENCRYPTION_KEY,
    });
  });

  describe('constructor', () => {
    it('should throw if encryption key is not 32 bytes', () => {
      expect(
        () =>
          new GuestService({
            repository,
            encryptionKey: 'short_key',
          })
      ).toThrow('Encryption key must be 32 bytes (64 hex characters) for AES-256');
    });

    it('should create service with valid 32-byte key', () => {
      expect(
        () =>
          new GuestService({
            repository,
            encryptionKey: TEST_ENCRYPTION_KEY,
          })
      ).not.toThrow();
    });
  });

  describe('addGuest', () => {
    it('should create a guest with auto QR code generation', async () => {
      const mockGuest = createMockGuest();
      const mockQR = createMockQRCode();

      vi.mocked(repository.findEventById).mockResolvedValue({
        id: 'event-001',
        slug: 'wedding-event',
      });
      vi.mocked(repository.checkSlugExists).mockResolvedValue(false);
      vi.mocked(repository.createGuest).mockResolvedValue(mockGuest);
      vi.mocked(repository.checkQRPayloadExists).mockResolvedValue(false);
      vi.mocked(repository.createQRCode).mockResolvedValue(mockQR);

      const result = await service.addGuest('event-001', 'tenant-001', {
        name: 'John Doe',
        group: GuestGroup.FRIEND,
        phone: '+6281234567890',
        email: 'john@example.com',
        plus_one_count: 1,
      });

      expect(isGuestError(result)).toBe(false);
      if (!isGuestError(result)) {
        expect(result.id).toBe('guest-001');
        expect(result.qr_code).not.toBeNull();
        expect(result.qr_code!.is_active).toBe(true);
      }

      // Verify guest was created with correct data
      expect(repository.createGuest).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: 'event-001',
          tenant_id: 'tenant-001',
          name: 'John Doe',
          group: GuestGroup.FRIEND,
          type: GuestType.INVITED,
          delivery_status: DeliveryStatus.NOT_SENT,
        })
      );

      // Verify QR code was created with the guest ID from createGuest
      expect(repository.createQRCode).toHaveBeenCalledWith(
        expect.objectContaining({
          is_active: true,
        })
      );
      // The guest_id should be a valid UUID (generated internally)
      const createQRCall = vi.mocked(repository.createQRCode).mock.calls[0][0];
      expect(createQRCall.guest_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('should return error if event not found', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue(null);

      const result = await service.addGuest('nonexistent', 'tenant-001', {
        name: 'John Doe',
        group: GuestGroup.FRIEND,
      });

      expect(isGuestError(result)).toBe(true);
      if (isGuestError(result)) {
        expect(result.code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('should generate invitation URL with event slug and guest slug', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue({
        id: 'event-001',
        slug: 'andi-sari-wedding',
      });
      vi.mocked(repository.checkSlugExists).mockResolvedValue(false);
      vi.mocked(repository.createGuest).mockImplementation(async (data) => ({
        ...data,
        created_at: new Date(),
      }));
      vi.mocked(repository.checkQRPayloadExists).mockResolvedValue(false);
      vi.mocked(repository.createQRCode).mockResolvedValue(createMockQRCode());

      await service.addGuest('event-001', 'tenant-001', {
        name: 'Budi Santoso',
        group: GuestGroup.FAMILY,
      });

      expect(repository.createGuest).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'budi-santoso',
          invitation_url: '/andi-sari-wedding?to=budi-santoso',
        })
      );
    });

    it('should handle optional fields with defaults', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue({
        id: 'event-001',
        slug: 'wedding',
      });
      vi.mocked(repository.checkSlugExists).mockResolvedValue(false);
      vi.mocked(repository.createGuest).mockImplementation(async (data) => ({
        ...data,
        created_at: new Date(),
      }));
      vi.mocked(repository.checkQRPayloadExists).mockResolvedValue(false);
      vi.mocked(repository.createQRCode).mockResolvedValue(createMockQRCode());

      await service.addGuest('event-001', 'tenant-001', {
        name: 'Jane',
        group: GuestGroup.VIP,
      });

      expect(repository.createGuest).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: null,
          email: null,
          plus_one_count: 0,
          type: GuestType.INVITED,
        })
      );
    });
  });

  describe('getGuest', () => {
    it('should return guest with QR code', async () => {
      const mockGuest = createMockGuest();
      const mockQR = createMockQRCode();

      vi.mocked(repository.findGuestById).mockResolvedValue(mockGuest);
      vi.mocked(repository.findQRCodeByGuestId).mockResolvedValue(mockQR);

      const result = await service.getGuest('guest-001', 'tenant-001');

      expect(isGuestError(result)).toBe(false);
      if (!isGuestError(result)) {
        expect(result.id).toBe('guest-001');
        expect(result.name).toBe('John Doe');
        expect(result.qr_code).toEqual(mockQR);
      }
    });

    it('should return error if guest not found', async () => {
      vi.mocked(repository.findGuestById).mockResolvedValue(null);

      const result = await service.getGuest('nonexistent', 'tenant-001');

      expect(isGuestError(result)).toBe(true);
      if (isGuestError(result)) {
        expect(result.code).toBe(ErrorCode.GUEST_NOT_FOUND);
      }
    });
  });

  describe('updateGuest', () => {
    it('should update guest fields', async () => {
      const mockGuest = createMockGuest();
      const updatedGuest = createMockGuest({ name: 'Jane Doe', slug: 'jane-doe' });

      vi.mocked(repository.findGuestById).mockResolvedValue(mockGuest);
      vi.mocked(repository.findEventById).mockResolvedValue({
        id: 'event-001',
        slug: 'wedding-event',
      });
      vi.mocked(repository.checkSlugExists).mockResolvedValue(false);
      vi.mocked(repository.updateGuest).mockResolvedValue(updatedGuest);

      const result = await service.updateGuest('guest-001', 'tenant-001', {
        name: 'Jane Doe',
      });

      expect(isGuestError(result)).toBe(false);
      if (!isGuestError(result)) {
        expect(result.name).toBe('Jane Doe');
      }
    });

    it('should regenerate slug when name changes', async () => {
      const mockGuest = createMockGuest();

      vi.mocked(repository.findGuestById).mockResolvedValue(mockGuest);
      vi.mocked(repository.findEventById).mockResolvedValue({
        id: 'event-001',
        slug: 'wedding-event',
      });
      vi.mocked(repository.checkSlugExists).mockResolvedValue(false);
      vi.mocked(repository.updateGuest).mockResolvedValue(
        createMockGuest({ name: 'New Name', slug: 'new-name' })
      );

      await service.updateGuest('guest-001', 'tenant-001', {
        name: 'New Name',
      });

      expect(repository.updateGuest).toHaveBeenCalledWith(
        'guest-001',
        'tenant-001',
        expect.objectContaining({
          name: 'New Name',
          slug: 'new-name',
          invitation_url: '/wedding-event?to=new-name',
        })
      );
    });

    it('should return error if guest not found', async () => {
      vi.mocked(repository.findGuestById).mockResolvedValue(null);

      const result = await service.updateGuest('nonexistent', 'tenant-001', {
        name: 'Test',
      });

      expect(isGuestError(result)).toBe(true);
      if (isGuestError(result)) {
        expect(result.code).toBe(ErrorCode.GUEST_NOT_FOUND);
      }
    });

    it('should update phone and email to null when empty string', async () => {
      const mockGuest = createMockGuest();

      vi.mocked(repository.findGuestById).mockResolvedValue(mockGuest);
      vi.mocked(repository.updateGuest).mockResolvedValue(
        createMockGuest({ phone: null, email: null })
      );

      await service.updateGuest('guest-001', 'tenant-001', {
        phone: '',
        email: '',
      });

      expect(repository.updateGuest).toHaveBeenCalledWith(
        'guest-001',
        'tenant-001',
        expect.objectContaining({
          phone: null,
          email: null,
        })
      );
    });
  });

  describe('deleteGuest', () => {
    it('should deactivate QR code and delete guest (Req 3.8)', async () => {
      const mockGuest = createMockGuest();

      vi.mocked(repository.findGuestById).mockResolvedValue(mockGuest);
      vi.mocked(repository.deactivateQRCode).mockResolvedValue(true);
      vi.mocked(repository.deleteGuest).mockResolvedValue(true);

      const result = await service.deleteGuest('guest-001', 'tenant-001');

      expect(isGuestError(result)).toBe(false);
      if (!isGuestError(result)) {
        expect(result.success).toBe(true);
      }

      // Verify QR was deactivated before deletion
      expect(repository.deactivateQRCode).toHaveBeenCalledWith('guest-001');
      expect(repository.deleteGuest).toHaveBeenCalledWith('guest-001', 'tenant-001');
    });

    it('should return error if guest not found', async () => {
      vi.mocked(repository.findGuestById).mockResolvedValue(null);

      const result = await service.deleteGuest('nonexistent', 'tenant-001');

      expect(isGuestError(result)).toBe(true);
      if (isGuestError(result)) {
        expect(result.code).toBe(ErrorCode.GUEST_NOT_FOUND);
      }
    });
  });

  describe('listGuests', () => {
    it('should return paginated guest list (Req 3.9)', async () => {
      const mockList: PaginatedGuestList = {
        data: [
          {
            id: 'guest-001',
            name: 'John Doe',
            slug: 'john-doe',
            group: GuestGroup.FRIEND,
            type: GuestType.INVITED,
            plus_one_count: 1,
            phone: '+6281234567890',
            email: 'john@example.com',
            delivery_status: DeliveryStatus.NOT_SENT,
            rsvp_status: 'confirmed',
            check_in_status: false,
            qr_active: true,
          },
        ],
        pagination: {
          page: 1,
          per_page: 50,
          total: 1,
          total_pages: 1,
        },
      };

      vi.mocked(repository.findEventById).mockResolvedValue({
        id: 'event-001',
        slug: 'wedding',
      });
      vi.mocked(repository.findGuestsByEvent).mockResolvedValue(mockList);

      const result = await service.listGuests('event-001', 'tenant-001', {
        page: 1,
        per_page: 50,
      });

      expect(isGuestError(result)).toBe(false);
      if (!isGuestError(result)) {
        expect(result.data).toHaveLength(1);
        expect(result.pagination.per_page).toBe(50);
      }
    });

    it('should enforce max 50 per page (Req 3.9)', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue({
        id: 'event-001',
        slug: 'wedding',
      });
      vi.mocked(repository.findGuestsByEvent).mockResolvedValue({
        data: [],
        pagination: { page: 1, per_page: 50, total: 0, total_pages: 0 },
      });

      await service.listGuests('event-001', 'tenant-001', {
        page: 1,
        per_page: 100, // Requesting more than max
      });

      // Should be capped at 50
      expect(repository.findGuestsByEvent).toHaveBeenCalledWith(
        'event-001',
        'tenant-001',
        { page: 1, per_page: 50 },
        undefined
      );
    });

    it('should pass filter options to repository (Req 3.10)', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue({
        id: 'event-001',
        slug: 'wedding',
      });
      vi.mocked(repository.findGuestsByEvent).mockResolvedValue({
        data: [],
        pagination: { page: 1, per_page: 50, total: 0, total_pages: 0 },
      });

      await service.listGuests(
        'event-001',
        'tenant-001',
        { page: 1, per_page: 50 },
        { group: GuestGroup.FAMILY, status: 'confirmed' }
      );

      expect(repository.findGuestsByEvent).toHaveBeenCalledWith(
        'event-001',
        'tenant-001',
        { page: 1, per_page: 50 },
        { group: GuestGroup.FAMILY, status: 'confirmed' }
      );
    });

    it('should return error if event not found', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue(null);

      const result = await service.listGuests('nonexistent', 'tenant-001', {
        page: 1,
        per_page: 50,
      });

      expect(isGuestError(result)).toBe(true);
      if (isGuestError(result)) {
        expect(result.code).toBe(ErrorCode.NOT_FOUND);
      }
    });
  });

  describe('QR Code Generation', () => {
    it('should generate encrypted QR payload with AES-256 (Req 3.6)', async () => {
      vi.mocked(repository.checkQRPayloadExists).mockResolvedValue(false);
      vi.mocked(repository.createQRCode).mockImplementation(async (data) => ({
        ...data,
        qr_image_url: null,
        generated_at: new Date(),
      }));

      const qrCode = await service.generateQRCode('guest-001', 'event-001');

      // Payload should be in format iv:encrypted (hex)
      expect(qrCode.qr_payload).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);

      // Verify it can be decrypted
      const [ivHex, encryptedHex] = qrCode.qr_payload.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const key = Buffer.from(TEST_ENCRYPTION_KEY, 'hex');
      const decipher = createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Decrypted should contain guest_id and event_id
      expect(decrypted).toContain('guest-001');
      expect(decrypted).toContain('event-001');
    });

    it('should generate unique payloads for different guests (Req 3.7)', async () => {
      vi.mocked(repository.checkQRPayloadExists).mockResolvedValue(false);

      const payloads: string[] = [];
      vi.mocked(repository.createQRCode).mockImplementation(async (data) => {
        payloads.push(data.qr_payload);
        return {
          ...data,
          qr_image_url: null,
          generated_at: new Date(),
        };
      });

      await service.generateQRCode('guest-001', 'event-001');
      await service.generateQRCode('guest-002', 'event-001');
      await service.generateQRCode('guest-003', 'event-002');

      // All payloads should be unique
      const uniquePayloads = new Set(payloads);
      expect(uniquePayloads.size).toBe(3);
    });

    it('should regenerate payload if collision detected (Req 3.7)', async () => {
      // First call returns true (collision), second returns false
      vi.mocked(repository.checkQRPayloadExists)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      vi.mocked(repository.createQRCode).mockImplementation(async (data) => ({
        ...data,
        qr_image_url: null,
        generated_at: new Date(),
      }));

      const qrCode = await service.generateQRCode('guest-001', 'event-001');

      // Should have been called twice due to collision
      expect(repository.checkQRPayloadExists).toHaveBeenCalledTimes(2);
      expect(qrCode.qr_payload).toBeTruthy();
    });
  });

  describe('Slug Generation', () => {
    it('should generate slug from name', () => {
      expect(service.nameToSlug('John Doe')).toBe('john-doe');
      expect(service.nameToSlug('Budi Santoso')).toBe('budi-santoso');
      expect(service.nameToSlug('  Spaces  Around  ')).toBe('spaces-around');
    });

    it('should handle special characters', () => {
      expect(service.nameToSlug("O'Brien")).toBe('obrien');
      expect(service.nameToSlug('José García')).toBe('jos-garca');
      expect(service.nameToSlug('Name@#$%')).toBe('name');
    });

    it('should generate unique slug with suffix when collision', async () => {
      vi.mocked(repository.checkSlugExists)
        .mockResolvedValueOnce(true) // 'john-doe' exists
        .mockResolvedValueOnce(false); // 'john-doe-2' is available

      const slug = await service.generateUniqueSlug('event-001', 'John Doe');
      expect(slug).toBe('john-doe-2');
    });

    it('should increment suffix until unique', async () => {
      vi.mocked(repository.checkSlugExists)
        .mockResolvedValueOnce(true) // 'john-doe' exists
        .mockResolvedValueOnce(true) // 'john-doe-2' exists
        .mockResolvedValueOnce(true) // 'john-doe-3' exists
        .mockResolvedValueOnce(false); // 'john-doe-4' is available

      const slug = await service.generateUniqueSlug('event-001', 'John Doe');
      expect(slug).toBe('john-doe-4');
    });

    it('should keep current slug if name produces same slug', async () => {
      const slug = await service.generateUniqueSlug(
        'event-001',
        'John Doe',
        'john-doe'
      );
      expect(slug).toBe('john-doe');
      // Should not check repository since slug matches
      expect(repository.checkSlugExists).not.toHaveBeenCalled();
    });
  });

  describe('isGuestError type guard', () => {
    it('should return true for error objects', () => {
      expect(
        isGuestError({ code: ErrorCode.GUEST_NOT_FOUND, message: 'Not found' })
      ).toBe(true);
    });

    it('should return false for guest records', () => {
      expect(isGuestError(createMockGuest())).toBe(false);
    });

    it('should return false for paginated results', () => {
      expect(
        isGuestError({
          data: [],
          pagination: { page: 1, per_page: 50, total: 0, total_pages: 0 },
        })
      ).toBe(false);
    });

    it('should return false for success results', () => {
      expect(isGuestError({ success: true })).toBe(false);
    });
  });
});
