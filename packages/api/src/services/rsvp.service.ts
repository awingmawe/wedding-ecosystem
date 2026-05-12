import { AttendanceType, ErrorCode } from '@wedding/shared';
import type { CreateRsvpInput } from '@wedding/shared';

// --- Types ---

export interface RsvpRecord {
  id: string;
  guest_id: string;
  attendance: AttendanceType;
  guest_count: number;
  submitted_at: Date;
}

export interface GuestForRsvp {
  id: string;
  event_id: string;
  tenant_id: string;
  name: string;
  plus_one_count: number;
}

export interface RsvpServiceError {
  code: ErrorCode;
  message: string;
}

export interface RsvpBroadcastPayload {
  event_type: 'rsvp_updated';
  event_id: string;
  guest_id: string;
  guest_name: string;
  attendance: AttendanceType;
  guest_count: number;
}

// --- Repository interface (dependency injection) ---

export interface RsvpRepository {
  findGuestById(guestId: string, tenantId: string): Promise<GuestForRsvp | null>;

  findRsvpByGuestId(guestId: string): Promise<RsvpRecord | null>;

  createRsvp(data: {
    id: string;
    guest_id: string;
    attendance: AttendanceType;
    guest_count: number;
  }): Promise<RsvpRecord>;

  updateRsvp(
    rsvpId: string,
    data: {
      attendance: AttendanceType;
      guest_count: number;
    }
  ): Promise<RsvpRecord>;
}

// --- WebSocket broadcaster interface ---

export interface RsvpBroadcaster {
  broadcast(eventId: string, payload: RsvpBroadcastPayload): void;
}

// --- RSVP Service ---

export class RsvpService {
  private readonly repository: RsvpRepository;
  private readonly broadcaster: RsvpBroadcaster;

  constructor(config: { repository: RsvpRepository; broadcaster: RsvpBroadcaster }) {
    this.repository = config.repository;
    this.broadcaster = config.broadcaster;
  }

  /**
   * Submit or update RSVP for a guest (Req 4.1, 4.7)
   * - Validates attendance choice (Req 4.2)
   * - Validates guest_count: min 1, max plus_one_count + 1 (Req 4.4)
   * - If declined, guest_count is set to 0 (Req 4.3)
   * - Upserts: updates existing RSVP instead of creating new (Req 4.7)
   * - Broadcasts via WebSocket on success (Req 4.6)
   */
  async submitRsvp(
    guestId: string,
    tenantId: string,
    input: CreateRsvpInput
  ): Promise<RsvpRecord | RsvpServiceError> {
    // Verify guest exists and belongs to tenant
    const guest = await this.repository.findGuestById(guestId, tenantId);
    if (!guest) {
      return {
        code: ErrorCode.GUEST_NOT_FOUND,
        message: 'Tamu tidak ditemukan',
      };
    }

    // Determine guest_count based on attendance (Req 4.3)
    const guestCount = input.attendance === AttendanceType.DECLINE ? 0 : input.guest_count;

    // Validate guest_count for non-decline (Req 4.4, 4.5)
    if (input.attendance !== AttendanceType.DECLINE) {
      const maxAllowed = guest.plus_one_count + 1;
      if (guestCount < 1) {
        return {
          code: ErrorCode.RSVP_GUEST_COUNT_EXCEEDED,
          message: 'Jumlah tamu minimal 1',
        };
      }
      if (guestCount > maxAllowed) {
        return {
          code: ErrorCode.RSVP_GUEST_COUNT_EXCEEDED,
          message: `Jumlah tamu melebihi batas. Maksimum ${maxAllowed} tamu diizinkan`,
        };
      }
    }

    // Check for existing RSVP (Req 4.7 - upsert logic)
    const existingRsvp = await this.repository.findRsvpByGuestId(guestId);

    let rsvp: RsvpRecord;

    if (existingRsvp) {
      // Update existing RSVP (Req 4.7)
      rsvp = await this.repository.updateRsvp(existingRsvp.id, {
        attendance: input.attendance,
        guest_count: guestCount,
      });
    } else {
      // Create new RSVP
      const { randomUUID } = await import('crypto');
      rsvp = await this.repository.createRsvp({
        id: randomUUID(),
        guest_id: guestId,
        attendance: input.attendance,
        guest_count: guestCount,
      });
    }

    // Broadcast via WebSocket (Req 4.6 - < 500ms)
    this.broadcaster.broadcast(guest.event_id, {
      event_type: 'rsvp_updated',
      event_id: guest.event_id,
      guest_id: guest.id,
      guest_name: guest.name,
      attendance: input.attendance,
      guest_count: guestCount,
    });

    return rsvp;
  }

  /**
   * Get RSVP for a guest
   */
  async getRsvp(
    guestId: string,
    tenantId: string
  ): Promise<RsvpRecord | null | RsvpServiceError> {
    // Verify guest exists and belongs to tenant
    const guest = await this.repository.findGuestById(guestId, tenantId);
    if (!guest) {
      return {
        code: ErrorCode.GUEST_NOT_FOUND,
        message: 'Tamu tidak ditemukan',
      };
    }

    return this.repository.findRsvpByGuestId(guestId);
  }
}

// --- Type guard ---

/**
 * Type guard to check if a result is an RsvpServiceError
 */
export function isRsvpError(
  result: RsvpRecord | null | RsvpServiceError
): result is RsvpServiceError {
  return result !== null && typeof result === 'object' && 'code' in result && 'message' in result && !('id' in result);
}
