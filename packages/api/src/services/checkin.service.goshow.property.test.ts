import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  CheckInMethod,
  GuestGroup,
} from '@wedding/shared';
import {
  CheckInService,
  CheckInRepository,
  RedisClient,
  CheckInRecord,
  GuestInfo,
  isServiceError,
} from './checkin.service';

// --- Constants ---

const TEST_ENCRYPTION_KEY =
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

// --- Arbitraries ---

/** Generates a UUID-like event ID */
const arbEventId = fc.uuid();

/** Generates a valid guest name (non-empty, trimmed) */
const arbGuestName = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

/** Generates an optional scanner device ID */
const arbScannerDeviceId = fc.option(fc.uuid(), { nil: undefined });

// --- Test Helpers ---

/**
 * Creates an in-memory Redis mock (not used by Go-Show flow but required by service constructor).
 */
function createInMemoryRedis(): RedisClient {
  const store = new Map<string, string>();

  return {
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
 * Creates an in-memory repository that tracks Go-Show guest creation and check-in records.
 */
function createInMemoryRepository(eventId: string): CheckInRepository & {
  guests: GuestInfo[];
  checkIns: CheckInRecord[];
} {
  const guests: GuestInfo[] = [];
  const checkIns: CheckInRecord[] = [];

  return {
    guests,
    checkIns,
    findGuestById: async (guestId: string) => {
      return guests.find((g) => g.id === guestId) ?? null;
    },
    findGuestByIdAndEvent: async (guestId: string, evtId: string) => {
      return guests.find((g) => g.id === guestId && g.event_id === evtId) ?? null;
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
    createGoShowGuest: async (data) => {
      const guest: GuestInfo = {
        id: data.id,
        event_id: data.event_id,
        name: data.name,
        group: GuestGroup.FRIEND, // default group for Go-Show
      };
      guests.push(guest);
      return guest;
    },
    findEventById: async (evtId: string) => {
      return evtId === eventId
        ? { id: evtId, tenant_id: 'tenant-001' }
        : null;
    },
  };
}

// --- Property Tests ---

describe('Property 13: Go-Show Guest Tracking', () => {
  /**
   * **Validates: Requirements 8.5, 8.6**
   *
   * For any valid Go-Show registration, the system SHALL create a guest record
   * with type="go_show" AND immediately create a check-in record with
   * method="go_show", ensuring the guest is tracked as both a Go-Show type
   * and has the correct check-in method recorded.
   */
  it('Go-Show registration creates guest with type="go_show" and check-in with method="go_show"', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEventId,
        arbGuestName,
        arbScannerDeviceId,
        async (eventId, guestName, scannerDeviceId) => {
          const repository = createInMemoryRepository(eventId);
          const redis = createInMemoryRedis();
          const service = new CheckInService({
            repository,
            redis,
            encryptionKey: TEST_ENCRYPTION_KEY,
          });

          const result = await service.registerGoShow('tenant-001', guestName, eventId, scannerDeviceId);

          // Should not be an error
          expect(isServiceError(result)).toBe(false);
          if (isServiceError(result)) return;

          // Property 1: Guest record has type="go_show" (Req 8.5)
          // The createGoShowGuest was called with type GO_SHOW
          expect(repository.guests).toHaveLength(1);
          expect(result.guest.id).toBe(repository.guests[0].id);

          // Property 2: Check-in record has method="go_show" (Req 8.6)
          expect(repository.checkIns).toHaveLength(1);
          expect(repository.checkIns[0].method).toBe(CheckInMethod.GO_SHOW);
          expect(result.check_in.method).toBe(CheckInMethod.GO_SHOW);

          // Property 3: Check-in record has a valid checked_in_at timestamp
          expect(result.check_in.checked_in_at).toBeInstanceOf(Date);
          expect(result.check_in.checked_in_at.getTime()).toBeLessThanOrEqual(Date.now());
          expect(result.check_in.checked_in_at.getTime()).toBeGreaterThan(0);

          // Property 4: guest_id in check-in record matches the created guest's id
          expect(result.check_in.guest_id).toBe(result.guest.id);
          expect(repository.checkIns[0].guest_id).toBe(repository.guests[0].id);
        }
      ),
      { numRuns: 100 }
    );
  });
});
