import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createCipheriv, randomBytes } from 'crypto';
import {
  CheckInMethod,
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
const arbGuestName = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

/** Generates a number of check-in attempts (2 to 10) */
const arbAttemptCount = fc.integer({ min: 2, max: 10 });

/** Generates a scanner device ID */
const arbScannerDeviceId = fc.uuid();

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
 * This accurately models the real Redis behavior for concurrent access.
 */
function createInMemoryRedis(): RedisClient & { store: Map<string, string> } {
  const store = new Map<string, string>();

  return {
    store,
    set: async (key: string, value: string, _mode: 'EX', _ttl: number, _flag: 'NX') => {
      // Simulate SET NX: only set if key doesn't exist
      if (store.has(key)) {
        return null; // Key already exists
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
 * This allows us to verify the actual number of records created.
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

describe('Property 11: Check-in Idempotency', () => {
  /**
   * **Validates: Requirements 7.5, 7.8**
   *
   * For any guest, regardless of how many QR scan check-in attempts are made,
   * the system SHALL maintain exactly one check-in record per guest.
   * The first attempt returns GREEN, all subsequent attempts return YELLOW.
   */
  it('multiple QR scan attempts for the same guest always result in exactly one check-in record', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbGuestId,
        arbEventId,
        arbGuestName,
        arbGuestGroup,
        arbAttemptCount,
        async (guestId, eventId, guestName, guestGroup, attemptCount) => {
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

          // Perform multiple check-in attempts sequentially
          const results = [];
          for (let i = 0; i < attemptCount; i++) {
            const result = await service.verifyQRScan('tenant-001', qrPayload, eventId);
            results.push(result);
          }

          // Property: exactly one check-in record exists
          const guestCheckIns = repository.checkIns.filter(
            (c) => c.guest_id === guestId
          );
          expect(guestCheckIns).toHaveLength(1);

          // Property: first attempt returns GREEN
          expect(results[0].status).toBe(VerificationStatus.GREEN);

          // Property: all subsequent attempts return YELLOW
          for (let i = 1; i < results.length; i++) {
            expect(results[i].status).toBe(VerificationStatus.YELLOW);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 7.5, 7.8**
   *
   * For any guest, concurrent check-in attempts from 2 scanner devices
   * SHALL still produce only one check-in record. One device gets GREEN,
   * the other gets YELLOW.
   */
  it('concurrent check-in attempts from 2 scanner devices produce only one record', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbGuestId,
        arbEventId,
        arbGuestName,
        arbGuestGroup,
        arbScannerDeviceId,
        arbScannerDeviceId,
        async (guestId, eventId, guestName, guestGroup, scanner1Id, scanner2Id) => {
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

          // Simulate concurrent scans from 2 devices
          const [result1, result2] = await Promise.all([
            service.verifyQRScan('tenant-001', qrPayload, eventId, scanner1Id),
            service.verifyQRScan('tenant-001', qrPayload, eventId, scanner2Id),
          ]);

          // Property: exactly one check-in record exists
          const guestCheckIns = repository.checkIns.filter(
            (c) => c.guest_id === guestId
          );
          expect(guestCheckIns).toHaveLength(1);

          // Property: exactly one GREEN and one YELLOW
          const statuses = [result1.status, result2.status].sort();
          expect(statuses).toEqual(
            [VerificationStatus.GREEN, VerificationStatus.YELLOW].sort()
          );
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 7.5, 7.8**
   *
   * For any guest, mixing QR scan and manual check-in methods SHALL still
   * maintain exactly one check-in record. The manual check-in after a QR scan
   * SHALL be rejected (ALREADY_CHECKED_IN).
   */
  it('mixed QR scan and manual check-in attempts maintain exactly one record per guest', async () => {
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

          // First: QR scan check-in (should succeed with GREEN)
          const qrResult = await service.verifyQRScan('tenant-001', qrPayload, eventId);
          expect(qrResult.status).toBe(VerificationStatus.GREEN);

          // Second: manual check-in attempt (should be rejected)
          const manualResult = await service.manualCheckIn('tenant-001', guestId, eventId);

          // Property: manual check-in is rejected because guest is already checked in
          expect('code' in manualResult).toBe(true);

          // Property: still exactly one check-in record
          const guestCheckIns = repository.checkIns.filter(
            (c) => c.guest_id === guestId
          );
          expect(guestCheckIns).toHaveLength(1);

          // Property: the single record has method QR_SCAN (first successful method)
          expect(guestCheckIns[0].method).toBe(CheckInMethod.QR_SCAN);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 7.5, 7.8**
   *
   * For any guest, the check-in record count SHALL never exceed 1
   * regardless of the total number of attempts across all methods and devices.
   */
  it('check-in record count never exceeds 1 regardless of attempt count and method mix', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbGuestId,
        arbEventId,
        arbGuestName,
        arbGuestGroup,
        fc.integer({ min: 3, max: 8 }),
        async (guestId, eventId, guestName, guestGroup, totalAttempts) => {
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

          // Mix of QR scans and manual check-in attempts
          for (let i = 0; i < totalAttempts; i++) {
            if (i % 2 === 0) {
              await service.verifyQRScan('tenant-001', qrPayload, eventId, `scanner-${i}`);
            } else {
              await service.manualCheckIn('tenant-001', guestId, eventId, `scanner-${i}`);
            }
          }

          // Property: check-in record count NEVER exceeds 1
          const guestCheckIns = repository.checkIns.filter(
            (c) => c.guest_id === guestId
          );
          expect(guestCheckIns.length).toBeLessThanOrEqual(1);
          expect(guestCheckIns.length).toBe(1); // Exactly 1 (first attempt always succeeds)
        }
      ),
      { numRuns: 50 }
    );
  });
});
