import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createDecipheriv } from 'crypto';
import { GuestGroup, GuestType, DeliveryStatus } from '@wedding/shared';
import {
  GuestService,
  GuestRepository,
  GUEST_CONSTANTS,
} from './guest.service';

// --- Constants ---

const TEST_ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes in hex for AES-256
const { AES_ALGORITHM, IV_LENGTH } = GUEST_CONSTANTS;

// --- Arbitraries ---

/** Generates a UUID v4 for guest_id */
const arbGuestId = fc.uuid();

/** Generates a UUID v4 for event_id */
const arbEventId = fc.uuid();

// --- Test Helpers ---

/**
 * Creates a minimal mock repository sufficient for QR code generation.
 */
function createMockRepository(): GuestRepository {
  const qrPayloads = new Set<string>();
  const slugs = new Set<string>();

  return {
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

/**
 * Decrypts a QR payload using the same AES-256-CBC algorithm.
 * Returns the plaintext string or null if decryption fails.
 */
function decryptPayload(payload: string): string | null {
  try {
    const parts = payload.split(':');
    if (parts.length !== 2) return null;

    const [ivHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const key = Buffer.from(TEST_ENCRYPTION_KEY, 'hex');
    const decipher = createDecipheriv(AES_ALGORITHM, key, iv);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch {
    return null;
  }
}

// --- Property Tests ---

describe('Property 5: QR Code Encryption', () => {
  /**
   * **Validates: Requirements 3.5, 13.1**
   *
   * For any generated QR code, the payload SHALL be encrypted using AES-256
   * such that the raw guest_id and event_id are not readable from the payload
   * without decryption.
   */
  it('encrypted payload does NOT contain raw guest_id or event_id as plaintext', async () => {
    await fc.assert(
      fc.asyncProperty(arbGuestId, arbEventId, async (guestId, eventId) => {
        const repository = createMockRepository();
        const service = createGuestService(repository);

        const payload = await service.createEncryptedPayload(guestId, eventId);

        // The raw guest_id and event_id must NOT appear in the payload
        expect(payload).not.toContain(guestId);
        expect(payload).not.toContain(eventId);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.5, 13.1**
   *
   * For any generated QR code, the payload CAN be decrypted back to the
   * original guest_id and event_id using the correct encryption key.
   */
  it('encrypted payload can be decrypted to recover original guest_id and event_id', async () => {
    await fc.assert(
      fc.asyncProperty(arbGuestId, arbEventId, async (guestId, eventId) => {
        const repository = createMockRepository();
        const service = createGuestService(repository);

        const payload = await service.createEncryptedPayload(guestId, eventId);

        // Decrypt the payload
        const decrypted = decryptPayload(payload);
        expect(decrypted).not.toBeNull();

        // Parse the decrypted plaintext: guest_id|event_id|timestamp|nonce
        const segments = decrypted!.split('|');
        expect(segments.length).toBe(4);

        const [recoveredGuestId, recoveredEventId] = segments;
        expect(recoveredGuestId).toBe(guestId);
        expect(recoveredEventId).toBe(eventId);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.5, 13.1**
   *
   * The payload format uses AES-256-CBC encryption:
   * - Format is iv_hex:encrypted_hex
   * - IV is exactly 16 bytes (32 hex characters)
   * - Both parts are valid hex strings
   */
  it('payload uses correct AES-256-CBC format (iv_hex:encrypted_hex)', async () => {
    await fc.assert(
      fc.asyncProperty(arbGuestId, arbEventId, async (guestId, eventId) => {
        const repository = createMockRepository();
        const service = createGuestService(repository);

        const payload = await service.createEncryptedPayload(guestId, eventId);

        // Payload must have format: iv_hex:encrypted_hex
        const parts = payload.split(':');
        expect(parts.length).toBe(2);

        const [ivHex, encryptedHex] = parts;

        // IV must be exactly 16 bytes = 32 hex characters (AES block size)
        expect(ivHex.length).toBe(IV_LENGTH * 2);

        // Both parts must be valid hex strings
        expect(ivHex).toMatch(/^[0-9a-f]+$/);
        expect(encryptedHex).toMatch(/^[0-9a-f]+$/);

        // Encrypted data must be non-empty
        expect(encryptedHex.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.5, 13.1**
   *
   * The payload cannot be decrypted with a wrong key, ensuring
   * that AES-256 encryption provides confidentiality.
   */
  it('payload cannot be decrypted with a different key', async () => {
    await fc.assert(
      fc.asyncProperty(arbGuestId, arbEventId, async (guestId, eventId) => {
        const repository = createMockRepository();
        const service = createGuestService(repository);

        const payload = await service.createEncryptedPayload(guestId, eventId);

        // Try to decrypt with a different key
        const wrongKey = 'b'.repeat(64); // Different 32-byte key
        const parts = payload.split(':');
        const [ivHex, encryptedHex] = parts;

        let decryptedWithWrongKey: string | null = null;
        try {
          const iv = Buffer.from(ivHex, 'hex');
          const key = Buffer.from(wrongKey, 'hex');
          const decipher = createDecipheriv(AES_ALGORITHM, key, iv);
          let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          decryptedWithWrongKey = decrypted;
        } catch {
          // Expected: decryption should fail with wrong key
          decryptedWithWrongKey = null;
        }

        // Either decryption fails entirely, or the decrypted content
        // does not contain the original guest_id and event_id
        if (decryptedWithWrongKey !== null) {
          const segments = decryptedWithWrongKey.split('|');
          const wrongGuestId = segments[0];
          const wrongEventId = segments[1];
          // Even if decryption doesn't throw, the data should be garbage
          expect(wrongGuestId === guestId && wrongEventId === eventId).toBe(
            false
          );
        }
      }),
      { numRuns: 100 }
    );
  });
});
