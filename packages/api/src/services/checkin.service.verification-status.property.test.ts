import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createCipheriv, randomBytes } from 'crypto';
import {
  GuestGroup,
  VerificationStatus,
} from '@wedding/shared';
import {
  CheckInService,
  CheckInRepository,
  RedisClient,
  CheckInRecord,
  GuestInfo,
} from './checkin.service';

// --- Constants ---

const TEST_ENCRYPTION_KEY =
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

// --- Arbitraries ---

/** Generates a UUID-like guest ID */
const arbGuestId = fc.uuid();

/** Generates a UUID-like event ID */
const arbEventId = fc.uuid();

/** Generates a valid guest group */
const arbGuestGroup = fc.constantFrom(
  GuestGroup.FAMILY,
  GuestGroup.FRIEND,
  GuestGroup.COLLEAGUE,
  GuestGroup.VIP
);

/** Generates a guest name (non-empty string) */
const arbGuestName = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

/** Generates a random invalid QR payload (not a valid encrypted payload) */
const arbInvalidQRPayload = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter((s) => {
    // Filter out strings that could accidentally be valid iv:encrypted format
    const parts = s.split(':');
    if (parts.length !== 2) return true;
    const [ivHex, encHex] = parts;
    // Must NOT look like valid hex with correct IV length
    if (/^[0-9a-f]{32}$/.test(ivHex) && /^[0-9a-f]+$/.test(encHex) && encHex.length > 0) {
      return false;
    }
    return true;
  });

// --- Test Helpers ---

/**
 * Create a valid encrypted QR payload using the same algorithm as guest.service.ts
 * Format: iv_hex:encrypted_hex
 * Plaintext: guest_id|event_id|timestamp|nonce
 */
function createValidQRPayload(
  guestId: string,
  eventId: string,
  encryptionKey: string = TEST_ENCRYPTION_KEY
): string {
  const nonce = randomBytes(16).toString('hex');
  const plaintext = `${guestId}|${eventId}|${Date.now()}|${nonce}`;

  const iv = randomBytes(16);
  const key = Buffer.from(encryptionKey, 'hex');
  const cipher = createCipheriv('aes-256-cbc', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Creates an in-memory Redis mock that simulates atomic SET NX behavior.
 */
function createInMemoryRedis(): RedisClient & { store: Map<string, string> } {
  const store = new Map<string, string>();

  return {
    store,
    set: async (key: string, value: string, _mode: 'EX', _ttl: number, _flag: 'NX') => {
      if (store.has(key)) {
        return null;
      }
      store.set(key, value);
      return 'OK';
    },
    get: async (key: string) => {
      return store.get(key) ?? null;
    },
  };
}

/**
 * Creates an in-memory repository that tracks check-in records.
 */
function createInMemoryRepository(
  guest: GuestInfo
): CheckInRepository & { checkIns: CheckInRecord[] } {
  const checkIns: CheckInRecord[] = [];

  return {
    checkIns,
    findGuestById: async (guestId: string) => {
      return guestId === guest.id ? guest : null;
    },
    findGuestByIdAndEvent: async (guestId: string, eventId: string) => {
      return guestId === guest.id && eventId === guest.event_id ? guest : null;
    },
    findQRCodeByPayload: async () => null,
    findCheckInByGuestId: async (guestId: string) => {
      return checkIns.find((c) => c.guest_id === guestId) ?? null;
    },
    createCheckIn: async (data) => {
      const record: CheckInRecord = {
        id: data.id,
        guest_id: data.guest_id,
        scanner_device_id: data.scanner_device_id,
        method: data.method,
        checked_in_at: data.checked_in_at,
      };
      checkIns.push(record);
      return record;
    },
    searchGuestsByName: async () => [],
    createGoShowGuest: async (data) => ({
      id: data.id,
      event_id: data.event_id,
      name: data.name,
      group: GuestGroup.FRIEND,
    }),
    findEventById: async (eventId: string) => {
      return eventId === guest.event_id
        ? { id: eventId, tenant_id: 'tenant-001' }
        : null;
    },
  };
}

// --- Property Tests ---

describe('Property 10: Scanner Verification Status Mapping', () => {
  /**
   * **Validates: Requirements 7.2**
   *
   * For any valid guest with a valid QR payload for the correct event who has NOT
   * been checked in, scanning returns status GREEN with the guest's name and group populated.
   */
  it('valid QR + not checked-in → GREEN with guest name and group', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbGuestId,
        arbEventId,
        arbGuestName,
        arbGuestGroup,
        async (guestId, eventId, guestName, guestGroup) => {
          const guest: GuestInfo = {
            id: guestId,
            event_id: eventId,
            name: guestName,
            group: guestGroup,
          };

          const redis = createInMemoryRedis();
          const repository = createInMemoryRepository(guest);
          const service = new CheckInService({
            repository,
            redis,
            encryptionKey: TEST_ENCRYPTION_KEY,
          });

          const qrPayload = createValidQRPayload(guestId, eventId);
          const result = await service.verifyQRScan('tenant-001', qrPayload, eventId);

          // Property: status is GREEN
          expect(result.status).toBe(VerificationStatus.GREEN);
          // Property: guest_name matches
          expect(result.guest_name).toBe(guestName);
          // Property: guest_group matches
          expect(result.guest_group).toBe(guestGroup);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 7.3**
   *
   * For any random string that is NOT a valid encrypted QR payload,
   * scanning returns status RED with guest_name=null and guest_group=null.
   */
  it('invalid/malformed QR → RED with null guest info', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbInvalidQRPayload,
        arbEventId,
        async (invalidPayload, eventId) => {
          // Create a dummy guest so the repository/event lookup works
          const guest: GuestInfo = {
            id: 'dummy-guest-id',
            event_id: eventId,
            name: 'Dummy',
            group: GuestGroup.FRIEND,
          };

          const redis = createInMemoryRedis();
          const repository = createInMemoryRepository(guest);
          const service = new CheckInService({
            repository,
            redis,
            encryptionKey: TEST_ENCRYPTION_KEY,
          });

          const result = await service.verifyQRScan('tenant-001', invalidPayload, eventId);

          // Property: status is RED
          expect(result.status).toBe(VerificationStatus.RED);
          // Property: guest_name is null
          expect(result.guest_name).toBeNull();
          // Property: guest_group is null
          expect(result.guest_group).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 7.3**
   *
   * For any valid guest with a valid QR payload encrypted for event A,
   * scanning at event B returns status RED (event mismatch).
   */
  it('valid QR format but wrong event → RED', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbGuestId,
        arbEventId,
        arbEventId,
        arbGuestName,
        arbGuestGroup,
        async (guestId, eventA, eventB, guestName, guestGroup) => {
          // Ensure events are different
          fc.pre(eventA !== eventB);

          const guest: GuestInfo = {
            id: guestId,
            event_id: eventA,
            name: guestName,
            group: guestGroup,
          };

          const redis = createInMemoryRedis();
          const repository = createInMemoryRepository(guest);
          const service = new CheckInService({
            repository,
            redis,
            encryptionKey: TEST_ENCRYPTION_KEY,
          });

          // QR is encrypted with eventA
          const qrPayload = createValidQRPayload(guestId, eventA);

          // But we scan at eventB
          const result = await service.verifyQRScan('tenant-001', qrPayload, eventB);

          // Property: status is RED (event mismatch)
          expect(result.status).toBe(VerificationStatus.RED);
          // Property: guest_name is null for wrong event
          expect(result.guest_name).toBeNull();
          // Property: guest_group is null for wrong event
          expect(result.guest_group).toBeNull();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 7.4**
   *
   * For any valid guest who has already been checked in (first scan was GREEN),
   * subsequent scans return status YELLOW with the guest's name, group, and
   * the original check-in timestamp.
   */
  it('valid QR + already checked-in → YELLOW with guest name and timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbGuestId,
        arbEventId,
        arbGuestName,
        arbGuestGroup,
        async (guestId, eventId, guestName, guestGroup) => {
          const guest: GuestInfo = {
            id: guestId,
            event_id: eventId,
            name: guestName,
            group: guestGroup,
          };

          const redis = createInMemoryRedis();
          const repository = createInMemoryRepository(guest);
          const service = new CheckInService({
            repository,
            redis,
            encryptionKey: TEST_ENCRYPTION_KEY,
          });

          const qrPayload = createValidQRPayload(guestId, eventId);

          // First scan: should be GREEN
          const firstResult = await service.verifyQRScan('tenant-001', qrPayload, eventId);
          expect(firstResult.status).toBe(VerificationStatus.GREEN);

          // Second scan: should be YELLOW
          const secondResult = await service.verifyQRScan('tenant-001', qrPayload, eventId);

          // Property: status is YELLOW
          expect(secondResult.status).toBe(VerificationStatus.YELLOW);
          // Property: guest_name is populated
          expect(secondResult.guest_name).toBe(guestName);
          // Property: guest_group is populated
          expect(secondResult.guest_group).toBe(guestGroup);
          // Property: checked_in_at is populated (original timestamp)
          expect(secondResult.checked_in_at).not.toBeNull();
          expect(secondResult.checked_in_at).toBeInstanceOf(Date);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 7.2, 7.3, 7.4**
   *
   * For any QR scan attempt (valid, invalid, or duplicate), the result status
   * is always exactly one of GREEN, RED, or YELLOW — never anything else.
   */
  it('exactly one status per scan: always GREEN, RED, or YELLOW', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbGuestId,
        arbEventId,
        arbGuestName,
        arbGuestGroup,
        fc.boolean(),
        async (guestId, eventId, guestName, guestGroup, useValidQR) => {
          const guest: GuestInfo = {
            id: guestId,
            event_id: eventId,
            name: guestName,
            group: guestGroup,
          };

          const redis = createInMemoryRedis();
          const repository = createInMemoryRepository(guest);
          const service = new CheckInService({
            repository,
            redis,
            encryptionKey: TEST_ENCRYPTION_KEY,
          });

          let result;
          if (useValidQR) {
            const qrPayload = createValidQRPayload(guestId, eventId);
            result = await service.verifyQRScan('tenant-001', qrPayload, eventId);
          } else {
            // Use an invalid payload
            result = await service.verifyQRScan('tenant-001', 'invalid-qr-data', eventId);
          }

          // Property: status is exactly one of the three valid values
          const validStatuses = [
            VerificationStatus.GREEN,
            VerificationStatus.RED,
            VerificationStatus.YELLOW,
          ];
          expect(validStatuses).toContain(result.status);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 7.2**
   *
   * For any scan that returns GREEN, guest_name is non-null and guest_group is non-null.
   */
  it('GREEN always includes guest name and group', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbGuestId,
        arbEventId,
        arbGuestName,
        arbGuestGroup,
        async (guestId, eventId, guestName, guestGroup) => {
          const guest: GuestInfo = {
            id: guestId,
            event_id: eventId,
            name: guestName,
            group: guestGroup,
          };

          const redis = createInMemoryRedis();
          const repository = createInMemoryRepository(guest);
          const service = new CheckInService({
            repository,
            redis,
            encryptionKey: TEST_ENCRYPTION_KEY,
          });

          const qrPayload = createValidQRPayload(guestId, eventId);
          const result = await service.verifyQRScan('tenant-001', qrPayload, eventId);

          // Only check if result is GREEN (which it should be for first scan)
          if (result.status === VerificationStatus.GREEN) {
            // Property: guest_name is non-null
            expect(result.guest_name).not.toBeNull();
            expect(result.guest_name!.length).toBeGreaterThan(0);
            // Property: guest_group is non-null
            expect(result.guest_group).not.toBeNull();
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 7.3**
   *
   * For any scan of an invalid or not-found QR that returns RED,
   * guest_name is null and guest_group is null.
   */
  it('RED always has null guest info for invalid/not-found QR', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbInvalidQRPayload,
        arbEventId,
        async (invalidPayload, eventId) => {
          const guest: GuestInfo = {
            id: 'dummy-guest-id',
            event_id: eventId,
            name: 'Dummy',
            group: GuestGroup.FRIEND,
          };

          const redis = createInMemoryRedis();
          const repository = createInMemoryRepository(guest);
          const service = new CheckInService({
            repository,
            redis,
            encryptionKey: TEST_ENCRYPTION_KEY,
          });

          const result = await service.verifyQRScan('tenant-001', invalidPayload, eventId);

          // Only check if result is RED
          if (result.status === VerificationStatus.RED) {
            // Property: guest_name is null
            expect(result.guest_name).toBeNull();
            // Property: guest_group is null
            expect(result.guest_group).toBeNull();
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
