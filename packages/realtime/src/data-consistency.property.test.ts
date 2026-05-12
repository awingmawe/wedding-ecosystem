import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { StatsService, StatsRepository, StatsBroadcaster } from './stats';
import type { StatsUpdatedPayload } from './index';

// --- Arbitraries ---

/** Generates a valid event ID (alphanumeric, reasonable length) */
const arbEventId = fc.stringMatching(/^[a-z0-9-]{4,30}$/);

/** Generates non-negative integer counts representing DB state */
const arbDbCounts = fc.record({
  guests: fc.nat({ max: 2000 }),
  rsvp: fc.nat({ max: 2000 }),
  checkIns: fc.nat({ max: 2000 }),
  goShow: fc.nat({ max: 500 }),
});

/** Generates a sequence of DB states to simulate changing check-in counts */
const arbCheckInSequence = fc.array(fc.nat({ max: 2000 }), {
  minLength: 1,
  maxLength: 20,
});

// --- Helpers ---

function createMockRepository(counts: {
  guests: number;
  rsvp: number;
  checkIns: number;
  goShow: number;
}): StatsRepository {
  return {
    countGuestsByEvent: vi.fn().mockResolvedValue(counts.guests),
    countRsvpByEvent: vi.fn().mockResolvedValue(counts.rsvp),
    countCheckInsByEvent: vi.fn().mockResolvedValue(counts.checkIns),
    countGoShowByEvent: vi.fn().mockResolvedValue(counts.goShow),
  };
}

function createMockBroadcaster(): StatsBroadcaster & {
  broadcastStats: ReturnType<typeof vi.fn>;
} {
  return {
    broadcastStats: vi.fn(),
  };
}

// --- Property Tests ---

/**
 * **Validates: Requirements 9.7**
 *
 * Property 16: Real-time Data Consistency
 *
 * For any sequence of check-in events processed by the system, the total_checked_in
 * value broadcast to the dashboard SHALL always equal the actual count of check-in
 * records in the database at the time of broadcast.
 */
describe('Property 16: Real-time Data Consistency', () => {
  it('total_checked_in in broadcast always equals the DB countCheckInsByEvent value', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEventId,
        arbDbCounts,
        async (eventId, counts) => {
          const repository = createMockRepository(counts);
          const broadcaster = createMockBroadcaster();
          const service = new StatsService({ repository, broadcaster });

          await service.calculateAndBroadcastStats(eventId);

          // The broadcast payload's total_checked_in must equal the DB count
          expect(broadcaster.broadcastStats).toHaveBeenCalledTimes(1);
          const broadcastPayload = broadcaster.broadcastStats.mock
            .calls[0][1] as StatsUpdatedPayload;
          expect(broadcastPayload.total_checked_in).toBe(counts.checkIns);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for any arbitrary DB state, broadcast reflects exact DB counts (not derived/incremental values)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEventId,
        arbDbCounts,
        async (eventId, counts) => {
          const repository = createMockRepository(counts);
          const broadcaster = createMockBroadcaster();
          const service = new StatsService({ repository, broadcaster });

          await service.calculateAndBroadcastStats(eventId);

          const broadcastPayload = broadcaster.broadcastStats.mock
            .calls[0][1] as StatsUpdatedPayload;

          // All fields must exactly match the DB counts
          expect(broadcastPayload.event_id).toBe(eventId);
          expect(broadcastPayload.total_guests).toBe(counts.guests);
          expect(broadcastPayload.total_rsvp).toBe(counts.rsvp);
          expect(broadcastPayload.total_checked_in).toBe(counts.checkIns);
          expect(broadcastPayload.total_go_show).toBe(counts.goShow);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('broadcast payload and returned value from calculateAndBroadcastStats are identical (no stale data)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEventId,
        arbDbCounts,
        async (eventId, counts) => {
          const repository = createMockRepository(counts);
          const broadcaster = createMockBroadcaster();
          const service = new StatsService({ repository, broadcaster });

          const returnedPayload =
            await service.calculateAndBroadcastStats(eventId);

          const broadcastPayload = broadcaster.broadcastStats.mock
            .calls[0][1] as StatsUpdatedPayload;

          // The returned value and the broadcast payload must be identical
          expect(returnedPayload).toEqual(broadcastPayload);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('for any sequence of check-in operations, each broadcast reflects the current DB state', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEventId,
        arbCheckInSequence,
        async (eventId, checkInCounts) => {
          const broadcaster = createMockBroadcaster();

          // Create a repository that returns different check-in counts on each call
          let callIndex = 0;
          const repository: StatsRepository = {
            countGuestsByEvent: vi.fn().mockResolvedValue(100),
            countRsvpByEvent: vi.fn().mockResolvedValue(80),
            countCheckInsByEvent: vi.fn().mockImplementation(async () => {
              return checkInCounts[callIndex++];
            }),
            countGoShowByEvent: vi.fn().mockResolvedValue(5),
          };

          const service = new StatsService({ repository, broadcaster });

          // Simulate a sequence of stats calculations (as if check-ins are happening)
          for (let i = 0; i < checkInCounts.length; i++) {
            callIndex = i;
            const result = await service.calculateAndBroadcastStats(eventId);

            // Each broadcast must reflect the current DB count at that moment
            expect(result.total_checked_in).toBe(checkInCounts[i]);

            const broadcastCall = broadcaster.broadcastStats.mock.calls[i];
            const broadcastPayload = broadcastCall[1] as StatsUpdatedPayload;
            expect(broadcastPayload.total_checked_in).toBe(checkInCounts[i]);
          }

          // Total number of broadcasts must equal the number of operations
          expect(broadcaster.broadcastStats).toHaveBeenCalledTimes(
            checkInCounts.length
          );
        }
      ),
      { numRuns: 50 }
    );
  });
});
