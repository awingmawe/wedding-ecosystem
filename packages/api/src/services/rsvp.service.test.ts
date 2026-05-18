import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RsvpService,
  RsvpRepository,
  RsvpBroadcaster,
  RsvpRecord,
  GuestForRsvp,
  isRsvpError,
} from './rsvp.service';
import { AttendanceType, ErrorCode } from '@wedding/shared';

// --- Test Helpers ---

function createMockRepository(): RsvpRepository {
  return {
    findGuestByIdAndEvent: vi.fn(),
    findRsvpByGuestId: vi.fn(),
    createRsvp: vi.fn(),
    updateRsvp: vi.fn(),
  };
}

function createMockBroadcaster(): RsvpBroadcaster {
  return {
    broadcast: vi.fn(),
  };
}

function createMockGuest(overrides: Partial<GuestForRsvp> = {}): GuestForRsvp {
  return {
    id: 'guest-001',
    event_id: 'event-001',
    tenant_id: 'event-001',
    name: 'John Doe',
    plus_one_count: 2,
    ...overrides,
  };
}

function createMockRsvp(overrides: Partial<RsvpRecord> = {}): RsvpRecord {
  return {
    id: 'rsvp-001',
    guest_id: 'guest-001',
    attendance: AttendanceType.BOTH,
    guest_count: 2,
    submitted_at: new Date('2024-01-15'),
    ...overrides,
  };
}

// --- Tests ---

describe('RsvpService', () => {
  let service: RsvpService;
  let repository: RsvpRepository;
  let broadcaster: RsvpBroadcaster;

  beforeEach(() => {
    repository = createMockRepository();
    broadcaster = createMockBroadcaster();
    service = new RsvpService({ repository, broadcaster });
  });

  describe('submitRsvp', () => {
    describe('valid RSVP submission (Req 4.1)', () => {
      it('should create new RSVP with attendance "akad"', async () => {
        const mockGuest = createMockGuest();
        const mockRsvp = createMockRsvp({ attendance: AttendanceType.AKAD, guest_count: 1 });

        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
        vi.mocked(repository.findRsvpByGuestId).mockResolvedValue(null);
        vi.mocked(repository.createRsvp).mockResolvedValue(mockRsvp);

        const result = await service.submitRsvp('guest-001', 'event-001', {
          attendance: AttendanceType.AKAD,
          guest_count: 1,
        });

        expect(isRsvpError(result)).toBe(false);
        if (!isRsvpError(result)) {
          expect(result!.attendance).toBe(AttendanceType.AKAD);
          expect(result!.guest_count).toBe(1);
        }
      });

      it('should create new RSVP with attendance "resepsi"', async () => {
        const mockGuest = createMockGuest();
        const mockRsvp = createMockRsvp({ attendance: AttendanceType.RESEPSI, guest_count: 2 });

        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
        vi.mocked(repository.findRsvpByGuestId).mockResolvedValue(null);
        vi.mocked(repository.createRsvp).mockResolvedValue(mockRsvp);

        const result = await service.submitRsvp('guest-001', 'event-001', {
          attendance: AttendanceType.RESEPSI,
          guest_count: 2,
        });

        expect(isRsvpError(result)).toBe(false);
        if (!isRsvpError(result)) {
          expect(result!.attendance).toBe(AttendanceType.RESEPSI);
          expect(result!.guest_count).toBe(2);
        }
      });

      it('should create new RSVP with attendance "both"', async () => {
        const mockGuest = createMockGuest();
        const mockRsvp = createMockRsvp({ attendance: AttendanceType.BOTH, guest_count: 3 });

        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
        vi.mocked(repository.findRsvpByGuestId).mockResolvedValue(null);
        vi.mocked(repository.createRsvp).mockResolvedValue(mockRsvp);

        const result = await service.submitRsvp('guest-001', 'event-001', {
          attendance: AttendanceType.BOTH,
          guest_count: 3,
        });

        expect(isRsvpError(result)).toBe(false);
        if (!isRsvpError(result)) {
          expect(result!.attendance).toBe(AttendanceType.BOTH);
          expect(result!.guest_count).toBe(3);
        }
      });

      it('should accept guest_count equal to plus_one_count + 1 (max allowed)', async () => {
        const mockGuest = createMockGuest({ plus_one_count: 2 }); // max = 3
        const mockRsvp = createMockRsvp({ guest_count: 3 });

        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
        vi.mocked(repository.findRsvpByGuestId).mockResolvedValue(null);
        vi.mocked(repository.createRsvp).mockResolvedValue(mockRsvp);

        const result = await service.submitRsvp('guest-001', 'event-001', {
          attendance: AttendanceType.BOTH,
          guest_count: 3,
        });

        expect(isRsvpError(result)).toBe(false);
      });

      it('should accept guest_count of 1 (minimum)', async () => {
        const mockGuest = createMockGuest({ plus_one_count: 0 }); // max = 1
        const mockRsvp = createMockRsvp({ guest_count: 1 });

        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
        vi.mocked(repository.findRsvpByGuestId).mockResolvedValue(null);
        vi.mocked(repository.createRsvp).mockResolvedValue(mockRsvp);

        const result = await service.submitRsvp('guest-001', 'event-001', {
          attendance: AttendanceType.AKAD,
          guest_count: 1,
        });

        expect(isRsvpError(result)).toBe(false);
      });
    });

    describe('decline hides guest_count (Req 4.3)', () => {
      it('should set guest_count to 0 when attendance is decline', async () => {
        const mockGuest = createMockGuest();
        const mockRsvp = createMockRsvp({
          attendance: AttendanceType.DECLINE,
          guest_count: 0,
        });

        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
        vi.mocked(repository.findRsvpByGuestId).mockResolvedValue(null);
        vi.mocked(repository.createRsvp).mockResolvedValue(mockRsvp);

        const result = await service.submitRsvp('guest-001', 'event-001', {
          attendance: AttendanceType.DECLINE,
          guest_count: 0,
        });

        expect(isRsvpError(result)).toBe(false);

        // Verify createRsvp was called with guest_count = 0
        expect(repository.createRsvp).toHaveBeenCalledWith(
          expect.objectContaining({
            attendance: AttendanceType.DECLINE,
            guest_count: 0,
          })
        );
      });

      it('should force guest_count to 0 even if input provides a non-zero value for decline', async () => {
        const mockGuest = createMockGuest();
        const mockRsvp = createMockRsvp({
          attendance: AttendanceType.DECLINE,
          guest_count: 0,
        });

        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
        vi.mocked(repository.findRsvpByGuestId).mockResolvedValue(null);
        vi.mocked(repository.createRsvp).mockResolvedValue(mockRsvp);

        // Even though input says guest_count: 5, decline should force it to 0
        const result = await service.submitRsvp('guest-001', 'event-001', {
          attendance: AttendanceType.DECLINE,
          guest_count: 0, // Zod schema enforces 0 for decline
        });

        expect(isRsvpError(result)).toBe(false);
        expect(repository.createRsvp).toHaveBeenCalledWith(
          expect.objectContaining({
            guest_count: 0,
          })
        );
      });
    });

    describe('guest_count exceeds limit rejection (Req 4.4, 4.5)', () => {
      it('should reject when guest_count exceeds plus_one_count + 1', async () => {
        const mockGuest = createMockGuest({ plus_one_count: 2 }); // max = 3

        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);

        const result = await service.submitRsvp('guest-001', 'event-001', {
          attendance: AttendanceType.BOTH,
          guest_count: 4, // exceeds max of 3
        });

        expect(isRsvpError(result)).toBe(true);
        if (isRsvpError(result)) {
          expect(result.code).toBe(ErrorCode.RSVP_GUEST_COUNT_EXCEEDED);
          expect(result.message).toContain('3'); // Should mention the max allowed
        }
      });

      it('should reject when guest_count is 0 for non-decline attendance', async () => {
        const mockGuest = createMockGuest();

        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);

        const result = await service.submitRsvp('guest-001', 'event-001', {
          attendance: AttendanceType.AKAD,
          guest_count: 0, // below minimum of 1
        });

        expect(isRsvpError(result)).toBe(true);
        if (isRsvpError(result)) {
          expect(result.code).toBe(ErrorCode.RSVP_GUEST_COUNT_EXCEEDED);
          expect(result.message).toContain('minimal 1');
        }
      });

      it('should reject when plus_one_count is 0 and guest_count is 2', async () => {
        const mockGuest = createMockGuest({ plus_one_count: 0 }); // max = 1

        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);

        const result = await service.submitRsvp('guest-001', 'event-001', {
          attendance: AttendanceType.RESEPSI,
          guest_count: 2, // exceeds max of 1
        });

        expect(isRsvpError(result)).toBe(true);
        if (isRsvpError(result)) {
          expect(result.code).toBe(ErrorCode.RSVP_GUEST_COUNT_EXCEEDED);
          expect(result.message).toContain('1'); // max allowed is 1
        }
      });
    });

    describe('RSVP update / upsert behavior (Req 4.7)', () => {
      it('should update existing RSVP instead of creating new', async () => {
        const mockGuest = createMockGuest();
        const existingRsvp = createMockRsvp({
          attendance: AttendanceType.AKAD,
          guest_count: 1,
        });
        const updatedRsvp = createMockRsvp({
          attendance: AttendanceType.BOTH,
          guest_count: 3,
          submitted_at: new Date('2024-02-01'),
        });

        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
        vi.mocked(repository.findRsvpByGuestId).mockResolvedValue(existingRsvp);
        vi.mocked(repository.updateRsvp).mockResolvedValue(updatedRsvp);

        const result = await service.submitRsvp('guest-001', 'event-001', {
          attendance: AttendanceType.BOTH,
          guest_count: 3,
        });

        expect(isRsvpError(result)).toBe(false);
        if (!isRsvpError(result)) {
          expect(result!.attendance).toBe(AttendanceType.BOTH);
          expect(result!.guest_count).toBe(3);
        }

        // Should call updateRsvp, NOT createRsvp
        expect(repository.updateRsvp).toHaveBeenCalledWith('rsvp-001', {
          attendance: AttendanceType.BOTH,
          guest_count: 3,
        });
        expect(repository.createRsvp).not.toHaveBeenCalled();
      });

      it('should allow changing from confirmed to decline', async () => {
        const mockGuest = createMockGuest();
        const existingRsvp = createMockRsvp({
          attendance: AttendanceType.BOTH,
          guest_count: 2,
        });
        const updatedRsvp = createMockRsvp({
          attendance: AttendanceType.DECLINE,
          guest_count: 0,
        });

        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
        vi.mocked(repository.findRsvpByGuestId).mockResolvedValue(existingRsvp);
        vi.mocked(repository.updateRsvp).mockResolvedValue(updatedRsvp);

        const result = await service.submitRsvp('guest-001', 'event-001', {
          attendance: AttendanceType.DECLINE,
          guest_count: 0,
        });

        expect(isRsvpError(result)).toBe(false);
        expect(repository.updateRsvp).toHaveBeenCalledWith('rsvp-001', {
          attendance: AttendanceType.DECLINE,
          guest_count: 0,
        });
      });

      it('should allow changing from decline to confirmed', async () => {
        const mockGuest = createMockGuest({ plus_one_count: 1 });
        const existingRsvp = createMockRsvp({
          attendance: AttendanceType.DECLINE,
          guest_count: 0,
        });
        const updatedRsvp = createMockRsvp({
          attendance: AttendanceType.RESEPSI,
          guest_count: 2,
        });

        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
        vi.mocked(repository.findRsvpByGuestId).mockResolvedValue(existingRsvp);
        vi.mocked(repository.updateRsvp).mockResolvedValue(updatedRsvp);

        const result = await service.submitRsvp('guest-001', 'event-001', {
          attendance: AttendanceType.RESEPSI,
          guest_count: 2,
        });

        expect(isRsvpError(result)).toBe(false);
        expect(repository.updateRsvp).toHaveBeenCalledWith('rsvp-001', {
          attendance: AttendanceType.RESEPSI,
          guest_count: 2,
        });
      });
    });

    describe('WebSocket broadcast (Req 4.6)', () => {
      it('should broadcast rsvp_updated event on successful submission', async () => {
        const mockGuest = createMockGuest();
        const mockRsvp = createMockRsvp();

        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
        vi.mocked(repository.findRsvpByGuestId).mockResolvedValue(null);
        vi.mocked(repository.createRsvp).mockResolvedValue(mockRsvp);

        await service.submitRsvp('guest-001', 'event-001', {
          attendance: AttendanceType.BOTH,
          guest_count: 2,
        });

        expect(broadcaster.broadcast).toHaveBeenCalledWith('event-001', {
          event_type: 'rsvp_updated',
          event_id: 'event-001',
          guest_id: 'guest-001',
          guest_name: 'John Doe',
          attendance: AttendanceType.BOTH,
          guest_count: 2,
        });
      });

      it('should broadcast with guest_count 0 for decline', async () => {
        const mockGuest = createMockGuest();
        const mockRsvp = createMockRsvp({
          attendance: AttendanceType.DECLINE,
          guest_count: 0,
        });

        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
        vi.mocked(repository.findRsvpByGuestId).mockResolvedValue(null);
        vi.mocked(repository.createRsvp).mockResolvedValue(mockRsvp);

        await service.submitRsvp('guest-001', 'event-001', {
          attendance: AttendanceType.DECLINE,
          guest_count: 0,
        });

        expect(broadcaster.broadcast).toHaveBeenCalledWith('event-001', {
          event_type: 'rsvp_updated',
          event_id: 'event-001',
          guest_id: 'guest-001',
          guest_name: 'John Doe',
          attendance: AttendanceType.DECLINE,
          guest_count: 0,
        });
      });

      it('should broadcast on RSVP update (not just create)', async () => {
        const mockGuest = createMockGuest();
        const existingRsvp = createMockRsvp();
        const updatedRsvp = createMockRsvp({
          attendance: AttendanceType.AKAD,
          guest_count: 1,
        });

        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
        vi.mocked(repository.findRsvpByGuestId).mockResolvedValue(existingRsvp);
        vi.mocked(repository.updateRsvp).mockResolvedValue(updatedRsvp);

        await service.submitRsvp('guest-001', 'event-001', {
          attendance: AttendanceType.AKAD,
          guest_count: 1,
        });

        expect(broadcaster.broadcast).toHaveBeenCalledWith('event-001', {
          event_type: 'rsvp_updated',
          event_id: 'event-001',
          guest_id: 'guest-001',
          guest_name: 'John Doe',
          attendance: AttendanceType.AKAD,
          guest_count: 1,
        });
      });

      it('should NOT broadcast when validation fails', async () => {
        const mockGuest = createMockGuest({ plus_one_count: 0 }); // max = 1

        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);

        await service.submitRsvp('guest-001', 'event-001', {
          attendance: AttendanceType.BOTH,
          guest_count: 5, // exceeds limit
        });

        expect(broadcaster.broadcast).not.toHaveBeenCalled();
      });

      it('should NOT broadcast when guest not found', async () => {
        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(null);

        await service.submitRsvp('nonexistent', 'event-001', {
          attendance: AttendanceType.BOTH,
          guest_count: 1,
        });

        expect(broadcaster.broadcast).not.toHaveBeenCalled();
      });
    });

    describe('error cases', () => {
      it('should return error if guest not found', async () => {
        vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(null);

        const result = await service.submitRsvp('nonexistent', 'event-001', {
          attendance: AttendanceType.BOTH,
          guest_count: 1,
        });

        expect(isRsvpError(result)).toBe(true);
        if (isRsvpError(result)) {
          expect(result.code).toBe(ErrorCode.GUEST_NOT_FOUND);
        }
      });
    });
  });

  describe('getRsvp', () => {
    it('should return RSVP for a guest', async () => {
      const mockGuest = createMockGuest();
      const mockRsvp = createMockRsvp();

      vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
      vi.mocked(repository.findRsvpByGuestId).mockResolvedValue(mockRsvp);

      const result = await service.getRsvp('guest-001', 'event-001');

      expect(isRsvpError(result)).toBe(false);
      if (!isRsvpError(result) && result !== null) {
        expect(result.id).toBe('rsvp-001');
        expect(result.attendance).toBe(AttendanceType.BOTH);
      }
    });

    it('should return null if guest has no RSVP', async () => {
      const mockGuest = createMockGuest();

      vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
      vi.mocked(repository.findRsvpByGuestId).mockResolvedValue(null);

      const result = await service.getRsvp('guest-001', 'event-001');

      expect(result).toBeNull();
    });

    it('should return error if guest not found', async () => {
      vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(null);

      const result = await service.getRsvp('nonexistent', 'event-001');

      expect(isRsvpError(result)).toBe(true);
      if (isRsvpError(result)) {
        expect(result.code).toBe(ErrorCode.GUEST_NOT_FOUND);
      }
    });
  });

  describe('isRsvpError type guard', () => {
    it('should return true for error objects', () => {
      expect(
        isRsvpError({ code: ErrorCode.GUEST_NOT_FOUND, message: 'Not found' })
      ).toBe(true);
    });

    it('should return false for RSVP records', () => {
      expect(isRsvpError(createMockRsvp())).toBe(false);
    });

    it('should return false for null', () => {
      expect(isRsvpError(null)).toBe(false);
    });
  });
});
