import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { GuestGroup, GuestType, DeliveryStatus } from '@wedding/shared';
import {
  GuestService,
  GuestRepository,
  GuestRecord,
  QRCodeRecord,
} from './guest.service';

// --- Constants ---

const TEST_ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes in hex for AES-256

// --- Arbitraries ---

/** Generates a valid guest name (non-empty, alphanumeric with spaces) */
const arbGuestName = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.replace(/[^a-zA-Z0-9\s]/g, 'a').trim() || 'Guest');

/** Generates a valid guest group */
const arbGuestGroup = fc.constantFrom(
  GuestGroup.FAMILY,
  GuestGroup.FRIEND,
  GuestGroup.COLLEAGUE,
  GuestGroup.VIP
);

/** Generates a UUID-like event ID */
const arbEventId = fc.uuid();

/** Generates a UUID-like tenant ID */
const arbTenantId = fc.uuid();

/** Generates a number of guests to create (1 to 20 for reasonable test time) */
const arbGuestCount = fc.integer({ min: 2, max: 20 });

// --- Test Helpers ---

/**
 * Creates a mock repository that tracks all created QR payloads
 * to verify uniqueness across the platform.
 */
function createMockRepository(): GuestRepository & { qrPayloads: Set<string> } {
  const qrPayloads = new Set<string>();
  const slugs = new Set<string>();

  return {
    qrPayloads,

    createGuest: async (data) => ({
      id: data.id,
      event_id: data.event_id,
      tenant_id: data.tenant_id,
      name: data.name,
      slug: data.slug,
      phone: data.phone,
      email: data.email,
      group: data.group,
      type: data.type,
      plus_one_count: data.plus_one_count,
      invitation_url: data.invitation_url,
      delivery_status: data.delivery_status,
      created_at: new Date(),
    }),

    createQRCode: async (data) => {
      qrPayloads.add(data.qr_payload);
      return {
        id: data.id,
        guest_id: data.guest_id,
        qr_payload: data.qr_payload,
        qr_image_url: null,
        is_active: data.is_active,
        generated_at: new Date(),
      };
    },

    findGuestById: async () => null,
    findGuestBySlug: async () => null,
    findGuestsByEvent: async () => ({
      data: [],
      pagination: { page: 1, per_page: 50, total: 0, total_pages: 0 },
    }),
    updateGuest: async () => null,
    deleteGuest: async () => true,
    deactivateQRCode: async () => true,
    findQRCodeByGuestId: async () => null,

    checkSlugExists: async (_eventId: string, slug: string) => {
      if (slugs.has(`${_eventId}:${slug}`)) {
        return true;
      }
      slugs.add(`${_eventId}:${slug}`);
      return false;
    },

    checkQRPayloadExists: async (payload: string) => {
      return qrPayloads.has(payload);
    },

    findEventById: async (eventId: string) => ({
      id: eventId,
      slug: `event-${eventId.slice(0, 8)}`,
    }),
  };
}

function createGuestService(repository: GuestRepository): GuestService {
  return new GuestService({
    repository,
    encryptionKey: TEST_ENCRYPTION_KEY,
  });
}

// --- Property Tests ---

describe('Property 4: QR Code Uniqueness', () => {
  /**
   * **Validates: Requirements 3.1, 3.3, 3.6**
   *
   * For any N guests added to an event (individually), all generated QR code
   * payloads SHALL be unique — no two guests within the same event SHALL share
   * the same QR payload.
   */
  it('all QR code payloads are unique when adding N guests to the same event', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEventId,
        arbTenantId,
        arbGuestCount,
        fc.array(arbGuestName, { minLength: 2, maxLength: 20 }),
        arbGuestGroup,
        async (eventId, tenantId, _count, names, group) => {
          const repository = createMockRepository();
          const service = createGuestService(repository);

          const payloads: string[] = [];

          // Add multiple guests to the same event
          for (const name of names) {
            const result = await service.addGuest(eventId, tenantId, {
              name,
              group,
            });

            // Should succeed
            if ('qr_code' in result && result.qr_code) {
              payloads.push(result.qr_code.qr_payload);
            }
          }

          // All payloads must be unique
          const uniquePayloads = new Set(payloads);
          expect(uniquePayloads.size).toBe(payloads.length);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 3.1, 3.6**
   *
   * For any guests added across different events, all generated QR code payloads
   * SHALL be unique — no two guests across events SHALL share the same QR payload.
   */
  it('QR code payloads are unique across different events', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbEventId, { minLength: 2, maxLength: 5 }),
        arbTenantId,
        arbGuestName,
        arbGuestGroup,
        async (eventIds, tenantId, guestName, group) => {
          // Use a single repository to track all payloads across events
          const repository = createMockRepository();
          const service = createGuestService(repository);

          const payloads: string[] = [];

          // Add a guest with the same name to each different event
          for (const eventId of eventIds) {
            const result = await service.addGuest(eventId, tenantId, {
              name: guestName,
              group,
            });

            if ('qr_code' in result && result.qr_code) {
              payloads.push(result.qr_code.qr_payload);
            }
          }

          // All payloads must be unique even across events
          const uniquePayloads = new Set(payloads);
          expect(uniquePayloads.size).toBe(payloads.length);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 3.3, 3.6**
   *
   * For any N guests added via bulk import (simulated by sequential addGuest calls
   * as bulkImportGuests uses addGuest internally), all generated QR code payloads
   * SHALL be unique.
   */
  it('bulk import generates unique QR codes for all valid guests', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEventId,
        arbTenantId,
        fc.array(
          fc.record({
            name: arbGuestName,
            group: arbGuestGroup,
          }),
          { minLength: 3, maxLength: 15 }
        ),
        async (eventId, tenantId, guests) => {
          const repository = createMockRepository();
          const service = createGuestService(repository);

          const payloads: string[] = [];

          // Simulate bulk import — each guest gets a QR code
          for (const guest of guests) {
            const result = await service.addGuest(eventId, tenantId, {
              name: guest.name,
              group: guest.group,
            });

            if ('qr_code' in result && result.qr_code) {
              payloads.push(result.qr_code.qr_payload);
            }
          }

          // All payloads from bulk import must be unique
          const uniquePayloads = new Set(payloads);
          expect(uniquePayloads.size).toBe(payloads.length);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 3.1, 3.3, 3.6**
   *
   * The createEncryptedPayload function always produces unique payloads
   * even when called with the same guest_id and event_id multiple times
   * (due to timestamp + random nonce).
   */
  it('createEncryptedPayload produces unique payloads for same inputs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.integer({ min: 3, max: 10 }),
        async (guestId, eventId, count) => {
          const repository = createMockRepository();
          const service = createGuestService(repository);

          const payloads: string[] = [];

          for (let i = 0; i < count; i++) {
            const payload = await service.createEncryptedPayload(guestId, eventId);
            payloads.push(payload);
          }

          // Even with same inputs, all payloads must be unique
          const uniquePayloads = new Set(payloads);
          expect(uniquePayloads.size).toBe(payloads.length);
        }
      ),
      { numRuns: 50 }
    );
  });
});
