import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { AttendanceType, ErrorCode } from '@wedding/shared';
import {
  RsvpService,
  RsvpRepository,
  RsvpBroadcaster,
  RsvpRecord,
  GuestForRsvp,
  isRsvpError,
} from './rsvp.service';

// --- Arbitraries ---

/** Generates a non-decline attendance type */
const arbNonDeclineAttendance = fc.constantFrom(
  AttendanceType.AKAD,
  AttendanceType.RESEPSI,
  AttendanceType.BOTH
);

/** Generates any valid attendance type */
const arbAnyAttendance = fc.constantFrom(
  AttendanceType.AKAD,
  AttendanceType.RESEPSI,
  AttendanceType.BOTH,
  AttendanceType.DECLINE
);

/** Generates a plus_one_count (0 to 10, representing realistic wedding scenarios) */
const arbPlusOneCount = fc.integer({ min: 0, max: 10 });

/** Generates a UUID-like guest ID */
const arbGuestId = fc.uuid();

/** Generates a UUID-like tenant ID */
const arbTenantId = fc.uuid();

// --- Test Helpers ---

function createMockRepository(guest: GuestForRsvp | null): RsvpRepository {
  return {
    findGuestById: async () => guest,
    findRsvpByGuestId: async () => null,
    createRsvp: async (data) => ({
      id: 'rsvp-' + Math.random().toString(36).slice(2),
      guest_id: data.guest_id,
      attendance: data.attendance,
      guest_count: data.guest_count,
      submitted_at: new Date(),
    }),
    updateRsvp: async (_id, data) => ({
      id: _id,
      guest_id: guest?.id ?? '',
      attendance: data.attendance,
      guest_count: data.guest_count,
      submitted_at: new Date(),
    }),
  };
}

function createMockBroadcaster(): RsvpBroadcaster {
  return {
    broadcast: () => {},
  };
}

function createGuestForRsvp(
  guestId: string,
  tenantId: string,
  plusOneCount: number
): GuestForRsvp {
  return {
    id: guestId,
    event_id: 'event-' + guestId.slice(0, 8),
    tenant_id: tenantId,
    name: 'Test Guest',
    plus_one_count: plusOneCount,
  };
}

function createRsvpService(guest: GuestForRsvp | null): RsvpService {
  return new RsvpService({
    repository: createMockRepository(guest),
    broadcaster: createMockBroadcaster(),
  });
}

// --- Property Tests ---

describe('Property 6: RSVP Guest Count Validation', () => {
  /**
   * **Validates: Requirements 4.3, 4.4**
   *
   * For any non-decline attendance with valid guest_count (1 <= count <= plus_one_count + 1),
   * the submission SHALL be accepted.
   */
  it('accepts non-decline attendance with valid guest_count (1 <= count <= plus_one_count + 1)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbGuestId,
        arbTenantId,
        arbPlusOneCount,
        arbNonDeclineAttendance,
        async (guestId, tenantId, plusOneCount, attendance) => {
          const maxAllowed = plusOneCount + 1;
          // Generate a valid guest_count within the allowed range
          const guestCount = fc.sample(fc.integer({ min: 1, max: maxAllowed }), 1)[0];

          const guest = createGuestForRsvp(guestId, tenantId, plusOneCount);
          const service = createRsvpService(guest);

          const result = await service.submitRsvp(guestId, tenantId, {
            attendance,
            guest_count: guestCount,
          });

          // Should be accepted (not an error)
          expect(isRsvpError(result)).toBe(false);
          if (!isRsvpError(result)) {
            expect(result.guest_count).toBe(guestCount);
            expect(result.attendance).toBe(attendance);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 4.3, 4.4**
   *
   * For any non-decline attendance with guest_count exceeding plus_one_count + 1,
   * the submission SHALL be rejected with RSVP_GUEST_COUNT_EXCEEDED error.
   */
  it('rejects non-decline attendance with guest_count exceeding plus_one_count + 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbGuestId,
        arbTenantId,
        arbPlusOneCount,
        arbNonDeclineAttendance,
        fc.integer({ min: 1, max: 100 }),
        async (guestId, tenantId, plusOneCount, attendance, excess) => {
          const maxAllowed = plusOneCount + 1;
          const invalidGuestCount = maxAllowed + excess; // Always exceeds the limit

          const guest = createGuestForRsvp(guestId, tenantId, plusOneCount);
          const service = createRsvpService(guest);

          const result = await service.submitRsvp(guestId, tenantId, {
            attendance,
            guest_count: invalidGuestCount,
          });

          // Should be rejected
          expect(isRsvpError(result)).toBe(true);
          if (isRsvpError(result)) {
            expect(result.code).toBe(ErrorCode.RSVP_GUEST_COUNT_EXCEEDED);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 4.3, 4.4**
   *
   * For any non-decline attendance with guest_count < 1 (i.e., 0 or negative),
   * the submission SHALL be rejected with RSVP_GUEST_COUNT_EXCEEDED error.
   */
  it('rejects non-decline attendance with guest_count less than 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbGuestId,
        arbTenantId,
        arbPlusOneCount,
        arbNonDeclineAttendance,
        fc.integer({ min: -100, max: 0 }),
        async (guestId, tenantId, plusOneCount, attendance, invalidGuestCount) => {
          const guest = createGuestForRsvp(guestId, tenantId, plusOneCount);
          const service = createRsvpService(guest);

          const result = await service.submitRsvp(guestId, tenantId, {
            attendance,
            guest_count: invalidGuestCount,
          });

          // Should be rejected
          expect(isRsvpError(result)).toBe(true);
          if (isRsvpError(result)) {
            expect(result.code).toBe(ErrorCode.RSVP_GUEST_COUNT_EXCEEDED);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 4.3, 4.4**
   *
   * For any decline attendance, guest_count SHALL always be set to 0
   * regardless of the input guest_count value.
   */
  it('forces guest_count to 0 for decline attendance regardless of input', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbGuestId,
        arbTenantId,
        arbPlusOneCount,
        fc.integer({ min: 0, max: 100 }),
        async (guestId, tenantId, plusOneCount, inputGuestCount) => {
          const guest = createGuestForRsvp(guestId, tenantId, plusOneCount);
          const service = createRsvpService(guest);

          const result = await service.submitRsvp(guestId, tenantId, {
            attendance: AttendanceType.DECLINE,
            guest_count: inputGuestCount,
          });

          // Should be accepted (decline is always valid)
          expect(isRsvpError(result)).toBe(false);
          if (!isRsvpError(result)) {
            // guest_count must always be 0 for decline
            expect(result.guest_count).toBe(0);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
