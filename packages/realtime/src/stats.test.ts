import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StatsService, StatsRepository, StatsBroadcaster } from './stats';
import type { StatsUpdatedPayload } from './index';

// --- Mock Repository ---

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

// --- Mock Broadcaster ---

function createMockBroadcaster(): StatsBroadcaster & {
  broadcastStats: ReturnType<typeof vi.fn>;
} {
  return {
    broadcastStats: vi.fn(),
  };
}

describe('StatsService', () => {
  let repository: StatsRepository;
  let broadcaster: ReturnType<typeof createMockBroadcaster>;
  let service: StatsService;

  const eventId = 'event-123';

  beforeEach(() => {
    repository = createMockRepository({
      guests: 100,
      rsvp: 75,
      checkIns: 50,
      goShow: 5,
    });
    broadcaster = createMockBroadcaster();
    service = new StatsService({ repository, broadcaster });
  });

  describe('calculateAndBroadcastStats', () => {
    it('should query all stats from the database', async () => {
      await service.calculateAndBroadcastStats(eventId);

      expect(repository.countGuestsByEvent).toHaveBeenCalledWith(eventId);
      expect(repository.countRsvpByEvent).toHaveBeenCalledWith(eventId);
      expect(repository.countCheckInsByEvent).toHaveBeenCalledWith(eventId);
      expect(repository.countGoShowByEvent).toHaveBeenCalledWith(eventId);
    });

    it('should broadcast stats with correct payload (Req 9.6)', async () => {
      await service.calculateAndBroadcastStats(eventId);

      expect(broadcaster.broadcastStats).toHaveBeenCalledWith(eventId, {
        event_id: eventId,
        total_guests: 100,
        total_rsvp: 75,
        total_checked_in: 50,
        total_go_show: 5,
      });
    });

    it('should return the calculated stats payload', async () => {
      const result = await service.calculateAndBroadcastStats(eventId);

      expect(result).toEqual({
        event_id: eventId,
        total_guests: 100,
        total_rsvp: 75,
        total_checked_in: 50,
        total_go_show: 5,
      });
    });

    it('should ensure total_checked_in equals actual DB count (Req 9.7)', async () => {
      // Simulate a specific DB count for check-ins
      const dbCheckInCount = 42;
      const repo = createMockRepository({
        guests: 200,
        rsvp: 150,
        checkIns: dbCheckInCount,
        goShow: 10,
      });
      const svc = new StatsService({ repository: repo, broadcaster });

      const result = await svc.calculateAndBroadcastStats(eventId);

      // total_checked_in must always equal the actual DB count
      expect(result.total_checked_in).toBe(dbCheckInCount);

      // Verify the broadcast also contains the correct DB count
      const broadcastCall = broadcaster.broadcastStats.mock.calls[0];
      const broadcastPayload = broadcastCall[1] as StatsUpdatedPayload;
      expect(broadcastPayload.total_checked_in).toBe(dbCheckInCount);
    });

    it('should handle zero counts correctly', async () => {
      const repo = createMockRepository({
        guests: 0,
        rsvp: 0,
        checkIns: 0,
        goShow: 0,
      });
      const svc = new StatsService({ repository: repo, broadcaster });

      const result = await svc.calculateAndBroadcastStats(eventId);

      expect(result).toEqual({
        event_id: eventId,
        total_guests: 0,
        total_rsvp: 0,
        total_checked_in: 0,
        total_go_show: 0,
      });
      expect(broadcaster.broadcastStats).toHaveBeenCalledWith(eventId, result);
    });

    it('should query all counts in parallel for performance', async () => {
      // Track call order to verify parallel execution
      const callOrder: string[] = [];
      const repo: StatsRepository = {
        countGuestsByEvent: vi.fn().mockImplementation(async () => {
          callOrder.push('guests');
          return 100;
        }),
        countRsvpByEvent: vi.fn().mockImplementation(async () => {
          callOrder.push('rsvp');
          return 75;
        }),
        countCheckInsByEvent: vi.fn().mockImplementation(async () => {
          callOrder.push('checkIns');
          return 50;
        }),
        countGoShowByEvent: vi.fn().mockImplementation(async () => {
          callOrder.push('goShow');
          return 5;
        }),
      };
      const svc = new StatsService({ repository: repo, broadcaster });

      await svc.calculateAndBroadcastStats(eventId);

      // All four queries should have been called
      expect(callOrder).toHaveLength(4);
      expect(callOrder).toContain('guests');
      expect(callOrder).toContain('rsvp');
      expect(callOrder).toContain('checkIns');
      expect(callOrder).toContain('goShow');
    });

    it('should use the correct event_id in the payload', async () => {
      const specificEventId = 'wedding-event-abc-456';
      await service.calculateAndBroadcastStats(specificEventId);

      expect(repository.countGuestsByEvent).toHaveBeenCalledWith(specificEventId);
      expect(broadcaster.broadcastStats).toHaveBeenCalledWith(
        specificEventId,
        expect.objectContaining({ event_id: specificEventId })
      );
    });
  });

  describe('calculateStats', () => {
    it('should return stats without broadcasting', async () => {
      const result = await service.calculateStats(eventId);

      expect(result).toEqual({
        event_id: eventId,
        total_guests: 100,
        total_rsvp: 75,
        total_checked_in: 50,
        total_go_show: 5,
      });
      // Should NOT broadcast
      expect(broadcaster.broadcastStats).not.toHaveBeenCalled();
    });

    it('should query actual DB counts (Req 9.7)', async () => {
      await service.calculateStats(eventId);

      expect(repository.countGuestsByEvent).toHaveBeenCalledWith(eventId);
      expect(repository.countRsvpByEvent).toHaveBeenCalledWith(eventId);
      expect(repository.countCheckInsByEvent).toHaveBeenCalledWith(eventId);
      expect(repository.countGoShowByEvent).toHaveBeenCalledWith(eventId);
    });
  });

  describe('data consistency (Req 9.7)', () => {
    it('should always derive total_checked_in from DB count, not incremental', async () => {
      // Simulate multiple broadcasts with changing DB state
      const changingRepo: StatsRepository = {
        countGuestsByEvent: vi.fn().mockResolvedValue(200),
        countRsvpByEvent: vi.fn().mockResolvedValue(150),
        countCheckInsByEvent: vi
          .fn()
          .mockResolvedValueOnce(10)
          .mockResolvedValueOnce(11)
          .mockResolvedValueOnce(12),
        countGoShowByEvent: vi.fn().mockResolvedValue(3),
      };
      const svc = new StatsService({ repository: changingRepo, broadcaster });

      // First broadcast
      const result1 = await svc.calculateAndBroadcastStats(eventId);
      expect(result1.total_checked_in).toBe(10);

      // Second broadcast (after a new check-in)
      const result2 = await svc.calculateAndBroadcastStats(eventId);
      expect(result2.total_checked_in).toBe(11);

      // Third broadcast (after another check-in)
      const result3 = await svc.calculateAndBroadcastStats(eventId);
      expect(result3.total_checked_in).toBe(12);

      // Each broadcast should have queried the DB fresh
      expect(changingRepo.countCheckInsByEvent).toHaveBeenCalledTimes(3);
    });

    it('should broadcast the same value it returns (no stale data)', async () => {
      const result = await service.calculateAndBroadcastStats(eventId);

      const broadcastCall = broadcaster.broadcastStats.mock.calls[0];
      const broadcastPayload = broadcastCall[1] as StatsUpdatedPayload;

      expect(broadcastPayload).toEqual(result);
    });
  });
});
