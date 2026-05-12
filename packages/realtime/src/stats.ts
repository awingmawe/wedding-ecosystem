import type { StatsUpdatedPayload } from './index';

// --- Repository interface (dependency injection) ---

/**
 * Repository interface for querying event statistics from the database.
 * Implementations should query actual DB counts to ensure consistency (Req 9.7).
 */
export interface StatsRepository {
  /** Count total guests registered for an event */
  countGuestsByEvent(eventId: string): Promise<number>;

  /** Count total RSVP submissions for an event (non-decline) */
  countRsvpByEvent(eventId: string): Promise<number>;

  /** Count total check-in records for an event */
  countCheckInsByEvent(eventId: string): Promise<number>;

  /** Count total Go-Show guests for an event */
  countGoShowByEvent(eventId: string): Promise<number>;
}

// --- Broadcaster interface ---

/**
 * Interface for broadcasting stats updates via WebSocket.
 */
export interface StatsBroadcaster {
  broadcastStats(eventId: string, payload: StatsUpdatedPayload): void;
}

// --- Stats Service ---

/**
 * Real-time statistics aggregation service.
 *
 * Calculates event statistics by querying actual DB counts (not incremental counters)
 * to ensure data consistency (Req 9.7: dashboard.total_checked_in always equals
 * actual DB count on every broadcast).
 *
 * This service should be called after every check-in, RSVP, and go-show event
 * to broadcast updated stats to connected dashboard clients (Req 9.6).
 *
 * Validates: Requirements 9.6, 9.7
 */
export class StatsService {
  private readonly repository: StatsRepository;
  private readonly broadcaster: StatsBroadcaster;

  constructor(config: {
    repository: StatsRepository;
    broadcaster: StatsBroadcaster;
  }) {
    this.repository = config.repository;
    this.broadcaster = config.broadcaster;
  }

  /**
   * Calculate current event statistics from the database and broadcast to
   * all connected dashboard clients.
   *
   * Stats are derived from actual DB counts (not incremental counters) to
   * guarantee consistency (Req 9.7).
   *
   * @param eventId - The event ID to calculate and broadcast stats for
   * @returns The calculated stats payload
   */
  async calculateAndBroadcastStats(
    eventId: string
  ): Promise<StatsUpdatedPayload> {
    // Query actual DB counts for consistency (Req 9.7)
    const [totalGuests, totalRsvp, totalCheckedIn, totalGoShow] =
      await Promise.all([
        this.repository.countGuestsByEvent(eventId),
        this.repository.countRsvpByEvent(eventId),
        this.repository.countCheckInsByEvent(eventId),
        this.repository.countGoShowByEvent(eventId),
      ]);

    const payload: StatsUpdatedPayload = {
      event_id: eventId,
      total_guests: totalGuests,
      total_rsvp: totalRsvp,
      total_checked_in: totalCheckedIn,
      total_go_show: totalGoShow,
    };

    // Broadcast to all connected dashboard clients (Req 9.6 - < 500ms)
    this.broadcaster.broadcastStats(eventId, payload);

    return payload;
  }

  /**
   * Calculate current event statistics without broadcasting.
   * Useful for initial dashboard load or API responses.
   *
   * @param eventId - The event ID to calculate stats for
   * @returns The calculated stats payload
   */
  async calculateStats(eventId: string): Promise<StatsUpdatedPayload> {
    const [totalGuests, totalRsvp, totalCheckedIn, totalGoShow] =
      await Promise.all([
        this.repository.countGuestsByEvent(eventId),
        this.repository.countRsvpByEvent(eventId),
        this.repository.countCheckInsByEvent(eventId),
        this.repository.countGoShowByEvent(eventId),
      ]);

    return {
      event_id: eventId,
      total_guests: totalGuests,
      total_rsvp: totalRsvp,
      total_checked_in: totalCheckedIn,
      total_go_show: totalGoShow,
    };
  }
}
