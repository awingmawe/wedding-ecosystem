import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { DeliveryStatus } from '@wedding/shared';
import { NotificationService, NotificationGuest, ContactCheck } from './notification.service';

// --- Arbitraries ---

/** Generates a valid phone number string (non-empty) */
const arbPhone = fc
  .string({ minLength: 8, maxLength: 15 })
  .filter((s) => s.trim().length > 0)
  .map((s) => `+62${s.replace(/[^0-9]/g, '').slice(0, 12)}`);

/** Generates a valid email string (non-empty) */
const arbEmail = fc.emailAddress();

/** Generates a nullable phone (either a valid phone or null) */
const arbNullablePhone = fc.oneof(arbPhone, fc.constant(null));

/** Generates a nullable email (either a valid email or null) */
const arbNullableEmail = fc.oneof(arbEmail, fc.constant(null));

/** Generates an empty-ish phone value (null or empty string) */
const arbMissingPhone = fc.constantFrom(null, '');

/** Generates an empty-ish email value (null or empty string) */
const arbMissingEmail = fc.constantFrom(null, '');

/** Generates a base guest record with arbitrary contact info */
function arbGuest(
  phoneArb: fc.Arbitrary<string | null>,
  emailArb: fc.Arbitrary<string | null>
): fc.Arbitrary<NotificationGuest> {
  return fc.record({
    id: fc.uuid(),
    event_id: fc.uuid(),
    tenant_id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 100 }),
    slug: fc.string({ minLength: 1, maxLength: 50 }).map((s) => s.replace(/\s/g, '-')),
    phone: phoneArb,
    email: emailArb,
    invitation_url: fc.oneof(
      fc.constant(null),
      fc.string({ minLength: 1, maxLength: 100 }).map((s) => `/${s}`)
    ),
    delivery_status: fc.constantFrom(
      DeliveryStatus.NOT_SENT,
      DeliveryStatus.SENT,
      DeliveryStatus.FAILED
    ),
  });
}

// --- Test Helpers ---

function createService(): NotificationService {
  return new NotificationService({
    repository: {
      findGuestById: async () => null,
      findGuestsByIds: async () => [],
      findEventById: async () => null,
      updateDeliveryStatus: async () => true,
      logDeliveryFailure: async () => {},
    },
    whatsappProvider: { send: async () => ({ success: true }) },
    emailProvider: { send: async () => ({ success: true }) },
    baseUrl: 'https://example.com',
  });
}

// --- Property Tests ---

describe('Property 20: Invitation Sending Contact Completeness', () => {
  const service = createService();

  /**
   * **Validates: Requirements 14.5**
   *
   * For any guest without both phone AND email contact information,
   * the system SHALL disable all invitation sending options and indicate
   * that contact data must be completed before sending.
   */
  it('guests without both phone AND email cannot have invitations sent (can_send = false)', () => {
    fc.assert(
      fc.property(arbGuest(arbMissingPhone, arbMissingEmail), (guest) => {
        const result: ContactCheck = service.checkContactCompleteness(guest);

        // When both phone and email are missing/empty, sending must be disabled
        expect(result.can_send).toBe(false);
        expect(result.available_channels).toEqual([]);
        // Must indicate that contact data needs to be completed
        expect(result.message).toBeDefined();
        expect(result.message!.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 14.5**
   *
   * For any guest with at least a valid phone number (non-null, non-empty),
   * the system SHALL allow sending via WhatsApp channel.
   */
  it('guests with a valid phone number can send via whatsapp', () => {
    fc.assert(
      fc.property(arbGuest(arbPhone, arbNullableEmail), (guest) => {
        const result: ContactCheck = service.checkContactCompleteness(guest);

        // When phone is present, sending must be enabled
        expect(result.can_send).toBe(true);
        expect(result.available_channels).toContain('whatsapp');
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 14.5**
   *
   * For any guest with at least a valid email address (non-null, non-empty),
   * the system SHALL allow sending via email channel.
   */
  it('guests with a valid email address can send via email', () => {
    fc.assert(
      fc.property(arbGuest(arbNullablePhone, arbEmail), (guest) => {
        const result: ContactCheck = service.checkContactCompleteness(guest);

        // When email is present, sending must be enabled
        expect(result.can_send).toBe(true);
        expect(result.available_channels).toContain('email');
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 14.5**
   *
   * For any guest with both phone AND email present, the system SHALL
   * allow sending via both whatsapp and email channels.
   */
  it('guests with both phone and email have both channels available', () => {
    fc.assert(
      fc.property(arbGuest(arbPhone, arbEmail), (guest) => {
        const result: ContactCheck = service.checkContactCompleteness(guest);

        expect(result.can_send).toBe(true);
        expect(result.available_channels).toContain('whatsapp');
        expect(result.available_channels).toContain('email');
        expect(result.available_channels).toHaveLength(2);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 14.5**
   *
   * The contact completeness check is deterministic: for any guest,
   * calling checkContactCompleteness multiple times always yields the same result.
   */
  it('contact completeness check is deterministic for any guest', () => {
    fc.assert(
      fc.property(arbGuest(arbNullablePhone, arbNullableEmail), (guest) => {
        const result1 = service.checkContactCompleteness(guest);
        const result2 = service.checkContactCompleteness(guest);

        expect(result1.can_send).toBe(result2.can_send);
        expect(result1.available_channels).toEqual(result2.available_channels);
        expect(result1.message).toBe(result2.message);
      }),
      { numRuns: 200 }
    );
  });
});
