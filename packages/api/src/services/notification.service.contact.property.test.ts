import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { DeliveryStatus } from '@wedding/shared';
import {
  NotificationService,
  NotificationGuest,
  NotificationRepository,
  WhatsAppProvider,
  EmailProvider,
} from './notification.service';

// --- Arbitraries ---

/** Generates a valid phone number (non-empty string) */
const arbPhone = fc
  .string({ minLength: 8, maxLength: 15 })
  .filter((s) => s.trim().length > 0)
  .map((s) => `+62${s.replace(/[^0-9]/g, '').slice(0, 12)}`);

/** Generates a valid email address */
const arbEmail = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-z0-9]+$/.test(s)),
    fc.string({ minLength: 2, maxLength: 10 }).filter((s) => /^[a-z]+$/.test(s))
  )
  .map(([local, domain]) => `${local}@${domain}.com`);

/** Generates a guest with NO contact info (neither phone nor email) */
const arbGuestNoContact = fc
  .record({
    id: fc.uuid(),
    event_id: fc.uuid(),
    tenant_id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    slug: fc.string({ minLength: 3, maxLength: 50 }).filter((s) => /^[a-z0-9-]+$/.test(s)),
  })
  .map(
    (data): NotificationGuest => ({
      ...data,
      phone: null,
      email: null,
      invitation_url: `/${data.slug}`,
      delivery_status: DeliveryStatus.NOT_SENT,
    })
  );

/** Generates a guest with at least one contact method (phone, email, or both) */
const arbGuestWithContact = fc
  .record({
    id: fc.uuid(),
    event_id: fc.uuid(),
    tenant_id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    slug: fc.string({ minLength: 3, maxLength: 50 }).filter((s) => /^[a-z0-9-]+$/.test(s)),
    hasPhone: fc.boolean(),
    hasEmail: fc.boolean(),
    phone: arbPhone,
    email: arbEmail,
  })
  .filter((data) => data.hasPhone || data.hasEmail)
  .map(
    (data): NotificationGuest => ({
      id: data.id,
      event_id: data.event_id,
      tenant_id: data.tenant_id,
      name: data.name,
      slug: data.slug,
      phone: data.hasPhone ? data.phone : null,
      email: data.hasEmail ? data.email : null,
      invitation_url: `/${data.slug}`,
      delivery_status: DeliveryStatus.NOT_SENT,
    })
  );

// --- Test Helpers ---

function createMockRepository(): NotificationRepository {
  return {
    findGuestById: async () => null,
    findGuestsByIds: async () => [],
    findEventById: async () => null,
    updateDeliveryStatus: async () => true,
    logDeliveryFailure: async () => {},
  };
}

function createMockWhatsAppProvider(): WhatsAppProvider {
  return {
    send: async () => ({ success: true }),
  };
}

function createMockEmailProvider(): EmailProvider {
  return {
    send: async () => ({ success: true }),
  };
}

function createService(): NotificationService {
  return new NotificationService({
    repository: createMockRepository(),
    whatsappProvider: createMockWhatsAppProvider(),
    emailProvider: createMockEmailProvider(),
    baseUrl: 'https://example.com',
  });
}

// --- Property Tests ---

describe('Property 20: Invitation Sending Contact Completeness', () => {
  /**
   * **Validates: Requirement 14.5**
   *
   * IF tamu tidak memiliki nomor phone dan alamat email secara lengkap,
   * THEN THE Dashboard SHALL menonaktifkan seluruh opsi pengiriman undangan
   * dan menampilkan indikasi bahwa data kontak (phone dan email) harus
   * dilengkapi sebelum undangan dapat dikirim.
   */

  it('guests with NEITHER phone NOR email have sending disabled (can_send = false)', () => {
    const service = createService();

    fc.assert(
      fc.property(arbGuestNoContact, (guest) => {
        const result = service.checkContactCompleteness(guest);

        // Sending must be disabled
        expect(result.can_send).toBe(false);

        // No channels should be available
        expect(result.available_channels).toHaveLength(0);

        // Must provide a message indicating contact data is required
        expect(result.message).toBeDefined();
        expect(result.message).toContain('kontak');
      }),
      { numRuns: 100 }
    );
  });

  it('guests with at least one contact method (phone OR email) have sending enabled (can_send = true)', () => {
    const service = createService();

    fc.assert(
      fc.property(arbGuestWithContact, (guest) => {
        const result = service.checkContactCompleteness(guest);

        // Sending must be enabled
        expect(result.can_send).toBe(true);

        // At least one channel should be available
        expect(result.available_channels.length).toBeGreaterThan(0);

        // Available channels must match the contact info present
        if (guest.phone) {
          expect(result.available_channels).toContain('whatsapp');
        }
        if (guest.email) {
          expect(result.available_channels).toContain('email');
        }

        // No error message when sending is enabled
        expect(result.message).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });
});
