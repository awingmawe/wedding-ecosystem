import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotificationService,
  NotificationRepository,
  NotificationGuest,
  WhatsAppProvider,
  EmailProvider,
  SendResult,
  BulkSendResult,
  isNotificationError,
  MAX_BATCH_SIZE,
} from './notification.service';
import { DeliveryStatus, ErrorCode } from '@wedding/shared';

// --- Test Helpers ---

const BASE_URL = 'https://wedding.example.com';

function createMockRepository(): NotificationRepository {
  return {
    findGuestById: vi.fn(),
    findGuestsByIds: vi.fn(),
    findEventById: vi.fn(),
    updateDeliveryStatus: vi.fn(),
    logDeliveryFailure: vi.fn(),
  };
}

function createMockWhatsAppProvider(): WhatsAppProvider {
  return {
    send: vi.fn(),
  };
}

function createMockEmailProvider(): EmailProvider {
  return {
    send: vi.fn(),
  };
}

function createMockGuest(overrides: Partial<NotificationGuest> = {}): NotificationGuest {
  return {
    id: 'guest-001',
    event_id: 'event-001',
    tenant_id: 'tenant-001',
    name: 'Budi Santoso',
    slug: 'budi-santoso',
    phone: '+6281234567890',
    email: 'budi@example.com',
    invitation_url: '/andi-sari-wedding?to=budi-santoso',
    delivery_status: DeliveryStatus.NOT_SENT,
    ...overrides,
  };
}

// --- Tests ---

describe('NotificationService', () => {
  let service: NotificationService;
  let repository: NotificationRepository;
  let whatsappProvider: WhatsAppProvider;
  let emailProvider: EmailProvider;

  beforeEach(() => {
    repository = createMockRepository();
    whatsappProvider = createMockWhatsAppProvider();
    emailProvider = createMockEmailProvider();
    service = new NotificationService({
      repository,
      whatsappProvider,
      emailProvider,
      baseUrl: BASE_URL,
    });
  });

  describe('checkContactCompleteness', () => {
    it('should return can_send=true with both channels when guest has phone and email', () => {
      const guest = createMockGuest();
      const result = service.checkContactCompleteness(guest);

      expect(result.can_send).toBe(true);
      expect(result.available_channels).toContain('whatsapp');
      expect(result.available_channels).toContain('email');
    });

    it('should return can_send=true with whatsapp only when guest has phone but no email', () => {
      const guest = createMockGuest({ email: null });
      const result = service.checkContactCompleteness(guest);

      expect(result.can_send).toBe(true);
      expect(result.available_channels).toEqual(['whatsapp']);
    });

    it('should return can_send=true with email only when guest has email but no phone', () => {
      const guest = createMockGuest({ phone: null });
      const result = service.checkContactCompleteness(guest);

      expect(result.can_send).toBe(true);
      expect(result.available_channels).toEqual(['email']);
    });

    it('should return can_send=false when guest has neither phone nor email (Req 14.5)', () => {
      const guest = createMockGuest({ phone: null, email: null });
      const result = service.checkContactCompleteness(guest);

      expect(result.can_send).toBe(false);
      expect(result.available_channels).toEqual([]);
      expect(result.message).toContain('Data kontak');
    });
  });

  describe('sendInvitation', () => {
    it('should send invitation via WhatsApp with personalized URL (Req 14.1, 14.2)', async () => {
      const guest = createMockGuest();
      vi.mocked(repository.findGuestById).mockResolvedValue(guest);
      vi.mocked(whatsappProvider.send).mockResolvedValue({ success: true });
      vi.mocked(repository.updateDeliveryStatus).mockResolvedValue(true);

      const result = await service.sendInvitation(
        { guest_id: 'guest-001', channel: 'whatsapp' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(false);
      if (!isNotificationError(result)) {
        expect(result.success).toBe(true);
        expect(result.channel).toBe('whatsapp');
        expect(result.guest_id).toBe('guest-001');
      }

      // Verify WhatsApp was called with correct phone and message containing URL
      expect(whatsappProvider.send).toHaveBeenCalledWith(
        '+6281234567890',
        expect.stringContaining(`${BASE_URL}/andi-sari-wedding?to=budi-santoso`)
      );
    });

    it('should send invitation via Email with personalized URL (Req 14.1, 14.2)', async () => {
      const guest = createMockGuest();
      vi.mocked(repository.findGuestById).mockResolvedValue(guest);
      vi.mocked(emailProvider.send).mockResolvedValue({ success: true });
      vi.mocked(repository.updateDeliveryStatus).mockResolvedValue(true);

      const result = await service.sendInvitation(
        { guest_id: 'guest-001', channel: 'email' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(false);
      if (!isNotificationError(result)) {
        expect(result.success).toBe(true);
        expect(result.channel).toBe('email');
      }

      // Verify Email was called with correct email and body containing URL
      expect(emailProvider.send).toHaveBeenCalledWith(
        'budi@example.com',
        'Undangan Pernikahan',
        expect.stringContaining(`${BASE_URL}/andi-sari-wedding?to=budi-santoso`)
      );
    });

    it('should update delivery status to SENT on success (Req 14.7)', async () => {
      const guest = createMockGuest();
      vi.mocked(repository.findGuestById).mockResolvedValue(guest);
      vi.mocked(whatsappProvider.send).mockResolvedValue({ success: true });
      vi.mocked(repository.updateDeliveryStatus).mockResolvedValue(true);

      await service.sendInvitation(
        { guest_id: 'guest-001', channel: 'whatsapp' },
        'event-001',
        'tenant-001'
      );

      expect(repository.updateDeliveryStatus).toHaveBeenCalledWith(
        'guest-001',
        'tenant-001',
        DeliveryStatus.SENT
      );
    });

    it('should update delivery status to FAILED and log error on failure (Req 14.6)', async () => {
      const guest = createMockGuest();
      vi.mocked(repository.findGuestById).mockResolvedValue(guest);
      vi.mocked(whatsappProvider.send).mockResolvedValue({
        success: false,
        error: 'Phone number unreachable',
      });
      vi.mocked(repository.updateDeliveryStatus).mockResolvedValue(true);
      vi.mocked(repository.logDeliveryFailure).mockResolvedValue(undefined);

      const result = await service.sendInvitation(
        { guest_id: 'guest-001', channel: 'whatsapp' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(false);
      if (!isNotificationError(result)) {
        expect(result.success).toBe(false);
        expect(result.error).toBe('Phone number unreachable');
      }

      expect(repository.updateDeliveryStatus).toHaveBeenCalledWith(
        'guest-001',
        'tenant-001',
        DeliveryStatus.FAILED
      );

      expect(repository.logDeliveryFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          guest_id: 'guest-001',
          channel: 'whatsapp',
          error: 'Phone number unreachable',
        })
      );
    });

    it('should return error when guest not found', async () => {
      vi.mocked(repository.findGuestById).mockResolvedValue(null);

      const result = await service.sendInvitation(
        { guest_id: 'nonexistent', channel: 'whatsapp' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(true);
      if (isNotificationError(result)) {
        expect(result.code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('should return error when guest does not belong to event', async () => {
      const guest = createMockGuest({ event_id: 'other-event' });
      vi.mocked(repository.findGuestById).mockResolvedValue(guest);

      const result = await service.sendInvitation(
        { guest_id: 'guest-001', channel: 'whatsapp' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(true);
      if (isNotificationError(result)) {
        expect(result.code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('should return CONTACT_MISSING when guest has no phone and no email (Req 14.5)', async () => {
      const guest = createMockGuest({ phone: null, email: null });
      vi.mocked(repository.findGuestById).mockResolvedValue(guest);

      const result = await service.sendInvitation(
        { guest_id: 'guest-001', channel: 'whatsapp' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(true);
      if (isNotificationError(result)) {
        expect(result.code).toBe(ErrorCode.CONTACT_MISSING);
      }
    });

    it('should return CONTACT_MISSING when requesting WhatsApp but guest has no phone', async () => {
      const guest = createMockGuest({ phone: null });
      vi.mocked(repository.findGuestById).mockResolvedValue(guest);

      const result = await service.sendInvitation(
        { guest_id: 'guest-001', channel: 'whatsapp' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(true);
      if (isNotificationError(result)) {
        expect(result.code).toBe(ErrorCode.CONTACT_MISSING);
        expect(result.message).toContain('phone');
      }
    });

    it('should return CONTACT_MISSING when requesting Email but guest has no email', async () => {
      const guest = createMockGuest({ email: null });
      vi.mocked(repository.findGuestById).mockResolvedValue(guest);

      const result = await service.sendInvitation(
        { guest_id: 'guest-001', channel: 'email' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(true);
      if (isNotificationError(result)) {
        expect(result.code).toBe(ErrorCode.CONTACT_MISSING);
        expect(result.message).toContain('email');
      }
    });

    it('should return error when invitation_url is not generated (Req 14.4)', async () => {
      const guest = createMockGuest({ invitation_url: null });
      vi.mocked(repository.findGuestById).mockResolvedValue(guest);

      const result = await service.sendInvitation(
        { guest_id: 'guest-001', channel: 'whatsapp' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(true);
      if (isNotificationError(result)) {
        expect(result.code).toBe(ErrorCode.NOTIFICATION_FAILED);
      }
    });

    it('should handle provider throwing an exception gracefully', async () => {
      const guest = createMockGuest();
      vi.mocked(repository.findGuestById).mockResolvedValue(guest);
      vi.mocked(whatsappProvider.send).mockRejectedValue(new Error('Network timeout'));
      vi.mocked(repository.updateDeliveryStatus).mockResolvedValue(true);
      vi.mocked(repository.logDeliveryFailure).mockResolvedValue(undefined);

      const result = await service.sendInvitation(
        { guest_id: 'guest-001', channel: 'whatsapp' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(false);
      if (!isNotificationError(result)) {
        expect(result.success).toBe(false);
        expect(result.error).toBe('Network timeout');
      }

      // Should still update status and log failure
      expect(repository.updateDeliveryStatus).toHaveBeenCalledWith(
        'guest-001',
        'tenant-001',
        DeliveryStatus.FAILED
      );
      expect(repository.logDeliveryFailure).toHaveBeenCalled();
    });
  });

  describe('sendBulkInvitations', () => {
    it('should send invitations to multiple guests (Req 14.3)', async () => {
      const guest1 = createMockGuest({ id: 'guest-001', name: 'Budi' });
      const guest2 = createMockGuest({
        id: 'guest-002',
        name: 'Sari',
        slug: 'sari',
        phone: '+6289876543210',
        invitation_url: '/andi-sari-wedding?to=sari',
      });

      vi.mocked(repository.findEventById).mockResolvedValue({
        id: 'event-001',
        slug: 'andi-sari-wedding',
      });
      vi.mocked(repository.findGuestsByIds).mockResolvedValue([guest1, guest2]);
      vi.mocked(whatsappProvider.send).mockResolvedValue({ success: true });
      vi.mocked(repository.updateDeliveryStatus).mockResolvedValue(true);

      const result = await service.sendBulkInvitations(
        { guest_ids: ['guest-001', 'guest-002'], channel: 'whatsapp' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(false);
      if (!isNotificationError(result)) {
        expect(result.total).toBe(2);
        expect(result.sent).toBe(2);
        expect(result.failed).toBe(0);
        expect(result.results).toHaveLength(2);
      }
    });

    it('should reject batch exceeding 500 guests (Req 14.3)', async () => {
      const guestIds = Array.from({ length: 501 }, (_, i) => `guest-${i}`);

      const result = await service.sendBulkInvitations(
        { guest_ids: guestIds, channel: 'whatsapp' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(true);
      if (isNotificationError(result)) {
        expect(result.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(result.message).toContain('500');
      }
    });

    it('should reject empty guest list', async () => {
      const result = await service.sendBulkInvitations(
        { guest_ids: [], channel: 'whatsapp' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(true);
      if (isNotificationError(result)) {
        expect(result.code).toBe(ErrorCode.VALIDATION_FAILED);
      }
    });

    it('should return error when event not found', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue(null);

      const result = await service.sendBulkInvitations(
        { guest_ids: ['guest-001'], channel: 'whatsapp' },
        'nonexistent',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(true);
      if (isNotificationError(result)) {
        expect(result.code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('should skip guests without contact info and mark as failed', async () => {
      const guestWithContact = createMockGuest({ id: 'guest-001' });
      const guestWithoutContact = createMockGuest({
        id: 'guest-002',
        phone: null,
        email: null,
      });

      vi.mocked(repository.findEventById).mockResolvedValue({
        id: 'event-001',
        slug: 'wedding',
      });
      vi.mocked(repository.findGuestsByIds).mockResolvedValue([
        guestWithContact,
        guestWithoutContact,
      ]);
      vi.mocked(whatsappProvider.send).mockResolvedValue({ success: true });
      vi.mocked(repository.updateDeliveryStatus).mockResolvedValue(true);

      const result = await service.sendBulkInvitations(
        { guest_ids: ['guest-001', 'guest-002'], channel: 'whatsapp' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(false);
      if (!isNotificationError(result)) {
        expect(result.sent).toBe(1);
        expect(result.failed).toBe(1);
        const failedResult = result.results.find((r) => r.guest_id === 'guest-002');
        expect(failedResult?.success).toBe(false);
        expect(failedResult?.error).toContain('Data kontak');
      }
    });

    it('should handle guests not found in event', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue({
        id: 'event-001',
        slug: 'wedding',
      });
      vi.mocked(repository.findGuestsByIds).mockResolvedValue([]); // No guests found

      const result = await service.sendBulkInvitations(
        { guest_ids: ['guest-001', 'guest-002'], channel: 'whatsapp' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(false);
      if (!isNotificationError(result)) {
        expect(result.total).toBe(2);
        expect(result.sent).toBe(0);
        expect(result.failed).toBe(2);
      }
    });

    it('should handle mixed success and failure in bulk send', async () => {
      const guest1 = createMockGuest({ id: 'guest-001' });
      const guest2 = createMockGuest({
        id: 'guest-002',
        name: 'Sari',
        slug: 'sari',
        phone: '+6289876543210',
        invitation_url: '/wedding?to=sari',
      });

      vi.mocked(repository.findEventById).mockResolvedValue({
        id: 'event-001',
        slug: 'wedding',
      });
      vi.mocked(repository.findGuestsByIds).mockResolvedValue([guest1, guest2]);
      vi.mocked(whatsappProvider.send)
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'Delivery failed' });
      vi.mocked(repository.updateDeliveryStatus).mockResolvedValue(true);
      vi.mocked(repository.logDeliveryFailure).mockResolvedValue(undefined);

      const result = await service.sendBulkInvitations(
        { guest_ids: ['guest-001', 'guest-002'], channel: 'whatsapp' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(false);
      if (!isNotificationError(result)) {
        expect(result.sent).toBe(1);
        expect(result.failed).toBe(1);
      }
    });

    it('should accept exactly 500 guests (boundary test)', async () => {
      const guestIds = Array.from({ length: 500 }, (_, i) => `guest-${i}`);
      const guests = guestIds.map((id) =>
        createMockGuest({ id, phone: '+6281234567890', invitation_url: '/w?to=g' })
      );

      vi.mocked(repository.findEventById).mockResolvedValue({
        id: 'event-001',
        slug: 'wedding',
      });
      vi.mocked(repository.findGuestsByIds).mockResolvedValue(guests);
      vi.mocked(whatsappProvider.send).mockResolvedValue({ success: true });
      vi.mocked(repository.updateDeliveryStatus).mockResolvedValue(true);

      const result = await service.sendBulkInvitations(
        { guest_ids: guestIds, channel: 'whatsapp' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(false);
      if (!isNotificationError(result)) {
        expect(result.total).toBe(500);
        expect(result.sent).toBe(500);
      }
    });

    it('should skip guests without invitation_url', async () => {
      const guest = createMockGuest({ id: 'guest-001', invitation_url: null });

      vi.mocked(repository.findEventById).mockResolvedValue({
        id: 'event-001',
        slug: 'wedding',
      });
      vi.mocked(repository.findGuestsByIds).mockResolvedValue([guest]);

      const result = await service.sendBulkInvitations(
        { guest_ids: ['guest-001'], channel: 'whatsapp' },
        'event-001',
        'tenant-001'
      );

      expect(isNotificationError(result)).toBe(false);
      if (!isNotificationError(result)) {
        expect(result.failed).toBe(1);
        expect(result.results[0].error).toContain('Invitation URL');
      }
    });
  });

  describe('getDeliveryStatus', () => {
    it('should return delivery status for a guest (Req 14.7)', async () => {
      const guest = createMockGuest({ delivery_status: DeliveryStatus.SENT });
      vi.mocked(repository.findGuestById).mockResolvedValue(guest);

      const result = await service.getDeliveryStatus('guest-001', 'tenant-001');

      expect(isNotificationError(result)).toBe(false);
      if (!isNotificationError(result)) {
        expect(result.delivery_status).toBe(DeliveryStatus.SENT);
      }
    });

    it('should return NOT_SENT for new guests (Req 14.7)', async () => {
      const guest = createMockGuest({ delivery_status: DeliveryStatus.NOT_SENT });
      vi.mocked(repository.findGuestById).mockResolvedValue(guest);

      const result = await service.getDeliveryStatus('guest-001', 'tenant-001');

      expect(isNotificationError(result)).toBe(false);
      if (!isNotificationError(result)) {
        expect(result.delivery_status).toBe(DeliveryStatus.NOT_SENT);
      }
    });

    it('should return error when guest not found', async () => {
      vi.mocked(repository.findGuestById).mockResolvedValue(null);

      const result = await service.getDeliveryStatus('nonexistent', 'tenant-001');

      expect(isNotificationError(result)).toBe(true);
      if (isNotificationError(result)) {
        expect(result.code).toBe(ErrorCode.NOT_FOUND);
      }
    });
  });

  describe('isNotificationError type guard', () => {
    it('should return true for error objects', () => {
      expect(
        isNotificationError({ code: ErrorCode.NOT_FOUND, message: 'Not found' })
      ).toBe(true);
    });

    it('should return false for SendResult', () => {
      expect(
        isNotificationError({
          guest_id: 'guest-001',
          channel: 'whatsapp',
          success: true,
        })
      ).toBe(false);
    });

    it('should return false for BulkSendResult', () => {
      expect(
        isNotificationError({
          total: 1,
          sent: 1,
          failed: 0,
          results: [],
        })
      ).toBe(false);
    });

    it('should return false for delivery status result', () => {
      expect(
        isNotificationError({ delivery_status: DeliveryStatus.SENT })
      ).toBe(false);
    });
  });
});
