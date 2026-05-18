import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCipheriv, randomBytes } from 'crypto';
import {
  CheckInService,
  CheckInRepository,
  RedisClient,
  CheckInBroadcaster,
  GuestInfo,
  CheckInRecord,
  GuestSearchResult,
  CHECKIN_CONSTANTS,
  isServiceError,
} from './checkin.service';
import {
  CheckInMethod,
  ErrorCode,
  GuestGroup,
  GuestType,
  VerificationStatus,
} from '@wedding/shared';

// --- Test Helpers ---

const TEST_ENCRYPTION_KEY =
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

function createMockRepository(): CheckInRepository {
  return {
    findGuestById: vi.fn(),
    findGuestByIdAndEvent: vi.fn(),
    findQRCodeByPayload: vi.fn(),
    findCheckInByGuestId: vi.fn(),
    createCheckIn: vi.fn(),
    searchGuestsByName: vi.fn(),
    createGoShowGuest: vi.fn(),
    findEventById: vi.fn(),
  };
}

function createMockRedis(): RedisClient {
  return {
    set: vi.fn(),
    get: vi.fn(),
  };
}

function createMockBroadcaster(): CheckInBroadcaster {
  return {
    broadcast: vi.fn(),
  };
}

function createMockGuest(overrides: Partial<GuestInfo> = {}): GuestInfo {
  return {
    id: 'guest-001',
    event_id: 'event-001',
    name: 'John Doe',
    group: GuestGroup.FRIEND,
    ...overrides,
  };
}

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

// --- Tests ---

describe('CheckInService', () => {
  let service: CheckInService;
  let repository: CheckInRepository;
  let redis: RedisClient;
  let broadcaster: CheckInBroadcaster;

  beforeEach(() => {
    repository = createMockRepository();
    redis = createMockRedis();
    broadcaster = createMockBroadcaster();
    vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001', tenant_id: 'tenant-001' });
    service = new CheckInService({
      repository,
      redis,
      encryptionKey: TEST_ENCRYPTION_KEY,
      broadcaster,
    });
  });

  describe('constructor', () => {
    it('should throw if encryption key is not 32 bytes', () => {
      expect(
        () =>
          new CheckInService({
            repository,
            redis,
            encryptionKey: 'short_key',
          })
      ).toThrow('Encryption key must be 32 bytes (64 hex characters) for AES-256');
    });

    it('should create service with valid 32-byte key', () => {
      expect(
        () =>
          new CheckInService({
            repository,
            redis,
            encryptionKey: TEST_ENCRYPTION_KEY,
          })
      ).not.toThrow();
    });
  });

  describe('verifyQRScan', () => {
    describe('GREEN - valid QR, first check-in (Req 7.2)', () => {
      it('should return GREEN with guest name and group on first check-in', async () => {
        const qrPayload = createValidQRPayload('guest-001', 'event-001');
        const mockGuest = createMockGuest();

        vi.mocked(repository.findGuestById).mockResolvedValue(mockGuest);
        vi.mocked(redis.set).mockResolvedValue('OK'); // SET NX succeeds
        vi.mocked(repository.createCheckIn).mockResolvedValue({
          id: 'checkin-001',
          guest_id: 'guest-001',
          scanner_device_id: null,
          method: CheckInMethod.QR_SCAN,
          checked_in_at: new Date(),
        });

        const result = await service.verifyQRScan('tenant-001', qrPayload, 'event-001');

        expect(result.status).toBe(VerificationStatus.GREEN);
        expect(result.guest_name).toBe('John Doe');
        expect(result.guest_group).toBe(GuestGroup.FRIEND);
        expect(result.message).toBe('Check-in berhasil');
        expect(result.checked_in_at).toBeInstanceOf(Date);
      });

      it('should create a check-in record in the database', async () => {
        const qrPayload = createValidQRPayload('guest-001', 'event-001');
        const mockGuest = createMockGuest();

        vi.mocked(repository.findGuestById).mockResolvedValue(mockGuest);
        vi.mocked(redis.set).mockResolvedValue('OK');
        vi.mocked(repository.createCheckIn).mockResolvedValue({
          id: 'checkin-001',
          guest_id: 'guest-001',
          scanner_device_id: 'scanner-001',
          method: CheckInMethod.QR_SCAN,
          checked_in_at: new Date(),
        });

        await service.verifyQRScan('tenant-001', qrPayload, 'event-001', 'scanner-001');

        expect(repository.createCheckIn).toHaveBeenCalledWith(
          expect.objectContaining({
            guest_id: 'guest-001',
            scanner_device_id: 'scanner-001',
            method: CheckInMethod.QR_SCAN,
          })
        );
      });

      it('should use Redis SET NX for atomic duplicate detection', async () => {
        const qrPayload = createValidQRPayload('guest-001', 'event-001');
        const mockGuest = createMockGuest();

        vi.mocked(repository.findGuestById).mockResolvedValue(mockGuest);
        vi.mocked(redis.set).mockResolvedValue('OK');
        vi.mocked(repository.createCheckIn).mockResolvedValue({
          id: 'checkin-001',
          guest_id: 'guest-001',
          scanner_device_id: null,
          method: CheckInMethod.QR_SCAN,
          checked_in_at: new Date(),
        });

        await service.verifyQRScan('tenant-001', qrPayload, 'event-001');

        expect(redis.set).toHaveBeenCalledWith(
          'checkin:guest-001',
          expect.any(String),
          'EX',
          CHECKIN_CONSTANTS.CHECKIN_KEY_TTL_SECONDS,
          'NX'
        );
      });
    });

    describe('RED - invalid/not found/wrong event (Req 7.3)', () => {
      it('should return RED when QR payload cannot be decrypted', async () => {
        const result = await service.verifyQRScan('tenant-001', 'invalid-payload', 'event-001');

        expect(result.status).toBe(VerificationStatus.RED);
        expect(result.guest_name).toBeNull();
        expect(result.guest_group).toBeNull();
        expect(result.message).toBe('QR code tidak valid');
        expect(result.checked_in_at).toBeNull();
      });

      it('should return RED when QR payload has wrong format (no colon)', async () => {
        const result = await service.verifyQRScan('tenant-001', 'nocolonseparator', 'event-001');

        expect(result.status).toBe(VerificationStatus.RED);
        expect(result.message).toBe('QR code tidak valid');
      });

      it('should return RED when QR payload has invalid hex', async () => {
        const result = await service.verifyQRScan('tenant-001', 'zzzz:xxxx', 'event-001');

        expect(result.status).toBe(VerificationStatus.RED);
        expect(result.message).toBe('QR code tidak valid');
      });

      it('should return RED when QR belongs to a different event (Req 7.3)', async () => {
        // Create QR for event-002 but scan at event-001
        const qrPayload = createValidQRPayload('guest-001', 'event-002');

        const result = await service.verifyQRScan('tenant-001', qrPayload, 'event-001');

        expect(result.status).toBe(VerificationStatus.RED);
        expect(result.message).toBe('QR code bukan untuk event ini');
        expect(result.guest_name).toBeNull();
      });

      it('should return RED when guest not found in database', async () => {
        const qrPayload = createValidQRPayload('nonexistent-guest', 'event-001');

        vi.mocked(repository.findGuestById).mockResolvedValue(null);

        const result = await service.verifyQRScan('tenant-001', qrPayload, 'event-001');

        expect(result.status).toBe(VerificationStatus.RED);
        expect(result.message).toBe('Tamu tidak ditemukan');
        expect(result.guest_name).toBeNull();
      });

      it('should return RED when QR payload has corrupted encryption', async () => {
        // Valid format but wrong encryption key
        const wrongKey =
          'b1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
        const qrPayload = createValidQRPayload('guest-001', 'event-001', wrongKey);

        const result = await service.verifyQRScan('tenant-001', qrPayload, 'event-001');

        expect(result.status).toBe(VerificationStatus.RED);
        expect(result.message).toBe('QR code tidak valid');
      });
    });

    describe('YELLOW - already checked-in (Req 7.4)', () => {
      it('should return YELLOW with guest name and previous check-in timestamp', async () => {
        const qrPayload = createValidQRPayload('guest-001', 'event-001');
        const mockGuest = createMockGuest();
        const previousTimestamp = '2024-06-15T10:30:00.000Z';

        vi.mocked(repository.findGuestById).mockResolvedValue(mockGuest);
        vi.mocked(redis.set).mockResolvedValue(null); // SET NX fails (key exists)
        vi.mocked(redis.get).mockResolvedValue(previousTimestamp);

        const result = await service.verifyQRScan('tenant-001', qrPayload, 'event-001');

        expect(result.status).toBe(VerificationStatus.YELLOW);
        expect(result.guest_name).toBe('John Doe');
        expect(result.guest_group).toBe(GuestGroup.FRIEND);
        expect(result.message).toBe('Tamu sudah check-in sebelumnya');
        expect(result.checked_in_at).toEqual(new Date(previousTimestamp));
      });

      it('should NOT create a new check-in record (idempotency, Req 7.8)', async () => {
        const qrPayload = createValidQRPayload('guest-001', 'event-001');
        const mockGuest = createMockGuest();

        vi.mocked(repository.findGuestById).mockResolvedValue(mockGuest);
        vi.mocked(redis.set).mockResolvedValue(null); // Already checked in
        vi.mocked(redis.get).mockResolvedValue('2024-06-15T10:30:00.000Z');

        await service.verifyQRScan('tenant-001', qrPayload, 'event-001');

        // Should NOT create a new check-in record
        expect(repository.createCheckIn).not.toHaveBeenCalled();
      });

      it('should handle concurrent scans - second device gets YELLOW (Req 7.5)', async () => {
        const qrPayload = createValidQRPayload('guest-001', 'event-001');
        const mockGuest = createMockGuest();

        vi.mocked(repository.findGuestById).mockResolvedValue(mockGuest);

        // First scan succeeds
        vi.mocked(redis.set).mockResolvedValueOnce('OK');
        vi.mocked(repository.createCheckIn).mockResolvedValue({
          id: 'checkin-001',
          guest_id: 'guest-001',
          scanner_device_id: 'scanner-001',
          method: CheckInMethod.QR_SCAN,
          checked_in_at: new Date(),
        });

        const result1 = await service.verifyQRScan(
          'tenant-001',
          qrPayload,
          'event-001',
          'scanner-001'
        );
        expect(result1.status).toBe(VerificationStatus.GREEN);

        // Second scan fails (SET NX returns null)
        vi.mocked(redis.set).mockResolvedValueOnce(null);
        vi.mocked(redis.get).mockResolvedValue(new Date().toISOString());

        const result2 = await service.verifyQRScan(
          'tenant-001',
          qrPayload,
          'event-001',
          'scanner-002'
        );
        expect(result2.status).toBe(VerificationStatus.YELLOW);
      });
    });

    describe('idempotency (Req 7.8)', () => {
      it('should only create one check-in record regardless of attempts', async () => {
        const qrPayload = createValidQRPayload('guest-001', 'event-001');
        const mockGuest = createMockGuest();

        vi.mocked(repository.findGuestById).mockResolvedValue(mockGuest);
        vi.mocked(repository.createCheckIn).mockResolvedValue({
          id: 'checkin-001',
          guest_id: 'guest-001',
          scanner_device_id: null,
          method: CheckInMethod.QR_SCAN,
          checked_in_at: new Date(),
        });

        // First attempt: SET NX succeeds
        vi.mocked(redis.set).mockResolvedValueOnce('OK');
        await service.verifyQRScan('tenant-001', qrPayload, 'event-001');

        // Second attempt: SET NX fails
        vi.mocked(redis.set).mockResolvedValueOnce(null);
        vi.mocked(redis.get).mockResolvedValue(new Date().toISOString());
        await service.verifyQRScan('tenant-001', qrPayload, 'event-001');

        // Third attempt: SET NX fails
        vi.mocked(redis.set).mockResolvedValueOnce(null);
        await service.verifyQRScan('tenant-001', qrPayload, 'event-001');

        // Only one createCheckIn call should have been made
        expect(repository.createCheckIn).toHaveBeenCalledTimes(1);
      });
    });

    describe('scanner device tracking', () => {
      it('should pass scanner_device_id to check-in record', async () => {
        const qrPayload = createValidQRPayload('guest-001', 'event-001');
        const mockGuest = createMockGuest();

        vi.mocked(repository.findGuestById).mockResolvedValue(mockGuest);
        vi.mocked(redis.set).mockResolvedValue('OK');
        vi.mocked(repository.createCheckIn).mockResolvedValue({
          id: 'checkin-001',
          guest_id: 'guest-001',
          scanner_device_id: 'device-abc',
          method: CheckInMethod.QR_SCAN,
          checked_in_at: new Date(),
        });

        await service.verifyQRScan('tenant-001', qrPayload, 'event-001', 'device-abc');

        expect(repository.createCheckIn).toHaveBeenCalledWith(
          expect.objectContaining({
            scanner_device_id: 'device-abc',
          })
        );
      });

      it('should handle null scanner_device_id', async () => {
        const qrPayload = createValidQRPayload('guest-001', 'event-001');
        const mockGuest = createMockGuest();

        vi.mocked(repository.findGuestById).mockResolvedValue(mockGuest);
        vi.mocked(redis.set).mockResolvedValue('OK');
        vi.mocked(repository.createCheckIn).mockResolvedValue({
          id: 'checkin-001',
          guest_id: 'guest-001',
          scanner_device_id: null,
          method: CheckInMethod.QR_SCAN,
          checked_in_at: new Date(),
        });

        await service.verifyQRScan('tenant-001', qrPayload, 'event-001');

        expect(repository.createCheckIn).toHaveBeenCalledWith(
          expect.objectContaining({
            scanner_device_id: null,
          })
        );
      });
    });
  });

  describe('decryptQRPayload', () => {
    it('should decrypt a valid payload and return guest_id and event_id', () => {
      const qrPayload = createValidQRPayload('guest-123', 'event-456');

      const result = service.decryptQRPayload(qrPayload);

      expect(result).not.toBeNull();
      expect(result!.guestId).toBe('guest-123');
      expect(result!.eventId).toBe('event-456');
    });

    it('should return null for empty string', () => {
      const result = service.decryptQRPayload('');
      expect(result).toBeNull();
    });

    it('should return null for payload without colon separator', () => {
      const result = service.decryptQRPayload('noseparator');
      expect(result).toBeNull();
    });

    it('should return null for payload with multiple colons', () => {
      const result = service.decryptQRPayload('a:b:c');
      expect(result).toBeNull();
    });

    it('should return null for non-hex IV', () => {
      const result = service.decryptQRPayload('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz:abcdef');
      expect(result).toBeNull();
    });

    it('should return null for IV with wrong length', () => {
      const result = service.decryptQRPayload('abcdef:123456');
      expect(result).toBeNull();
    });

    it('should return null for corrupted encrypted data', () => {
      // Valid IV length but garbage encrypted data
      const fakeIv = randomBytes(16).toString('hex');
      const result = service.decryptQRPayload(`${fakeIv}:deadbeef`);
      expect(result).toBeNull();
    });

    it('should return null when decrypted with wrong key', () => {
      const wrongKey =
        'b1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
      const qrPayload = createValidQRPayload('guest-001', 'event-001', wrongKey);

      const result = service.decryptQRPayload(qrPayload);
      expect(result).toBeNull();
    });
  });

  describe('searchGuests (Req 8.1)', () => {
    it('should return search results for valid query (min 3 chars)', async () => {
      const mockResults: GuestSearchResult[] = [
        { id: 'guest-001', name: 'John Doe', group: GuestGroup.FRIEND, type: GuestType.INVITED, is_checked_in: false, checked_in_at: null },
        { id: 'guest-002', name: 'Johnny Walker', group: GuestGroup.FAMILY, type: GuestType.INVITED, is_checked_in: false, checked_in_at: null },
      ];

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001', tenant_id: 'tenant-001' });
      vi.mocked(repository.searchGuestsByName).mockResolvedValue(mockResults);

      const result = await service.searchGuests('tenant-001', 'event-001', 'Joh');

      expect(isServiceError(result)).toBe(false);
      if (!isServiceError(result)) {
        expect(result).toHaveLength(2);
        expect(result[0].name).toBe('John Doe');
        expect(result[1].name).toBe('Johnny Walker');
      }
    });

    it('should reject query with less than 3 characters', async () => {
      const result = await service.searchGuests('tenant-001', 'event-001', 'Jo');

      expect(isServiceError(result)).toBe(true);
      if (isServiceError(result)) {
        expect(result.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(result.message).toContain('3');
      }
    });

    it('should return error if event not found', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue(null);

      const result = await service.searchGuests('tenant-001', 'nonexistent-event', 'John');

      expect(isServiceError(result)).toBe(true);
      if (isServiceError(result)) {
        expect(result.code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('should pass max 10 results limit to repository', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001', tenant_id: 'tenant-001' });
      vi.mocked(repository.searchGuestsByName).mockResolvedValue([]);

      await service.searchGuests('tenant-001', 'event-001', 'John');

      expect(repository.searchGuestsByName).toHaveBeenCalledWith(
        'event-001',
        'John',
        CHECKIN_CONSTANTS.MAX_SEARCH_RESULTS
      );
    });

    it('should include check-in status in results (Req 8.4)', async () => {
      const mockResults: GuestSearchResult[] = [
        { id: 'guest-001', name: 'John Doe', group: GuestGroup.FRIEND, type: GuestType.INVITED, is_checked_in: false, checked_in_at: null },
        { id: 'guest-002', name: 'Jane Doe', group: GuestGroup.FAMILY, type: GuestType.INVITED, is_checked_in: true, checked_in_at: new Date('2024-06-15T09:30:00Z') },
      ];

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001', tenant_id: 'tenant-001' });
      vi.mocked(repository.searchGuestsByName).mockResolvedValue(mockResults);

      const result = await service.searchGuests('tenant-001', 'event-001', 'Doe');

      expect(isServiceError(result)).toBe(false);
      if (!isServiceError(result)) {
        expect(result[0].is_checked_in).toBe(false);
        expect(result[0].checked_in_at).toBeNull();
        expect(result[1].is_checked_in).toBe(true);
        expect(result[1].checked_in_at).toEqual(new Date('2024-06-15T09:30:00Z'));
      }
    });

    it('should return empty array when no guests match', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001', tenant_id: 'tenant-001' });
      vi.mocked(repository.searchGuestsByName).mockResolvedValue([]);

      const result = await service.searchGuests('tenant-001', 'event-001', 'XYZ');

      expect(isServiceError(result)).toBe(false);
      if (!isServiceError(result)) {
        expect(result).toHaveLength(0);
      }
    });
  });

  describe('manualCheckIn (Req 8.2)', () => {
    it('should check-in a guest with method="manual"', async () => {
      const mockGuest = createMockGuest();
      const mockCheckIn: CheckInRecord = {
        id: 'checkin-001',
        guest_id: 'guest-001',
        scanner_device_id: null,
        method: CheckInMethod.MANUAL,
        checked_in_at: new Date('2024-06-15T10:00:00Z'),
      };

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001', tenant_id: 'tenant-001' });
      vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
      vi.mocked(repository.findCheckInByGuestId).mockResolvedValue(null);
      vi.mocked(repository.createCheckIn).mockResolvedValue(mockCheckIn);

      const result = await service.manualCheckIn('tenant-001', 'guest-001', 'event-001');

      expect(isServiceError(result)).toBe(false);
      if (!isServiceError(result)) {
        expect(result.guest.id).toBe('guest-001');
        expect(result.check_in.method).toBe(CheckInMethod.MANUAL);
      }
    });

    it('should reject check-in if guest already checked-in (Req 8.4)', async () => {
      const mockGuest = createMockGuest();
      const existingCheckIn: CheckInRecord = {
        id: 'checkin-001',
        guest_id: 'guest-001',
        scanner_device_id: null,
        method: CheckInMethod.QR_SCAN,
        checked_in_at: new Date('2024-06-15T09:00:00Z'),
      };

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001', tenant_id: 'tenant-001' });
      vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
      vi.mocked(repository.findCheckInByGuestId).mockResolvedValue(existingCheckIn);

      const result = await service.manualCheckIn('tenant-001', 'guest-001', 'event-001');

      expect(isServiceError(result)).toBe(true);
      if (isServiceError(result)) {
        expect(result.code).toBe(ErrorCode.ALREADY_CHECKED_IN);
      }
    });

    it('should return error if guest not found', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001', tenant_id: 'tenant-001' });
      vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(null);

      const result = await service.manualCheckIn('tenant-001', 'nonexistent', 'event-001');

      expect(isServiceError(result)).toBe(true);
      if (isServiceError(result)) {
        expect(result.code).toBe(ErrorCode.GUEST_NOT_FOUND);
      }
    });

    it('should return error if event not found', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue(null);

      const result = await service.manualCheckIn('tenant-001', 'guest-001', 'nonexistent-event');

      expect(isServiceError(result)).toBe(true);
      if (isServiceError(result)) {
        expect(result.code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('should broadcast guest_checked_in event via WebSocket (Req 8.8)', async () => {
      const mockGuest = createMockGuest();
      const mockCheckIn: CheckInRecord = {
        id: 'checkin-001',
        guest_id: 'guest-001',
        scanner_device_id: null,
        method: CheckInMethod.MANUAL,
        checked_in_at: new Date('2024-06-15T10:00:00Z'),
      };

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001', tenant_id: 'tenant-001' });
      vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
      vi.mocked(repository.findCheckInByGuestId).mockResolvedValue(null);
      vi.mocked(repository.createCheckIn).mockResolvedValue(mockCheckIn);

      await service.manualCheckIn('tenant-001', 'guest-001', 'event-001');

      expect(broadcaster.broadcast).toHaveBeenCalledWith('event-001', {
        event_type: 'guest_checked_in',
        event_id: 'event-001',
        guest_id: 'guest-001',
        guest_name: 'John Doe',
        guest_group: GuestGroup.FRIEND,
        guest_type: GuestType.INVITED,
        method: CheckInMethod.MANUAL,
        checked_in_at: mockCheckIn.checked_in_at,
      });
    });

    it('should NOT broadcast when check-in fails (already checked-in)', async () => {
      const mockGuest = createMockGuest();
      const existingCheckIn: CheckInRecord = {
        id: 'checkin-001',
        guest_id: 'guest-001',
        scanner_device_id: null,
        method: CheckInMethod.QR_SCAN,
        checked_in_at: new Date(),
      };

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001', tenant_id: 'tenant-001' });
      vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
      vi.mocked(repository.findCheckInByGuestId).mockResolvedValue(existingCheckIn);

      await service.manualCheckIn('tenant-001', 'guest-001', 'event-001');

      expect(broadcaster.broadcast).not.toHaveBeenCalled();
    });

    it('should pass scanner_device_id when provided', async () => {
      const mockGuest = createMockGuest();
      const mockCheckIn: CheckInRecord = {
        id: 'checkin-001',
        guest_id: 'guest-001',
        scanner_device_id: 'scanner-001',
        method: CheckInMethod.MANUAL,
        checked_in_at: new Date('2024-06-15T10:00:00Z'),
      };

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001', tenant_id: 'tenant-001' });
      vi.mocked(repository.findGuestByIdAndEvent).mockResolvedValue(mockGuest);
      vi.mocked(repository.findCheckInByGuestId).mockResolvedValue(null);
      vi.mocked(repository.createCheckIn).mockResolvedValue(mockCheckIn);

      await service.manualCheckIn('tenant-001', 'guest-001', 'event-001', 'scanner-001');

      expect(repository.createCheckIn).toHaveBeenCalledWith(
        expect.objectContaining({
          scanner_device_id: 'scanner-001',
          method: CheckInMethod.MANUAL,
        })
      );
    });
  });

  describe('registerGoShow (Req 8.5, 8.6)', () => {
    it('should create go-show guest with type="go_show" and immediate check-in', async () => {
      const mockGuest: GuestInfo = {
        id: 'guest-new',
        event_id: 'event-001',
        name: 'Walk-in Guest',
        group: GuestGroup.FRIEND,
      };
      const mockCheckIn: CheckInRecord = {
        id: 'checkin-001',
        guest_id: 'guest-new',
        scanner_device_id: null,
        method: CheckInMethod.GO_SHOW,
        checked_in_at: new Date('2024-06-15T10:00:00Z'),
      };

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001', tenant_id: 'tenant-001' });
      vi.mocked(repository.createGoShowGuest).mockResolvedValue(mockGuest);
      vi.mocked(repository.createCheckIn).mockResolvedValue(mockCheckIn);

      const result = await service.registerGoShow('tenant-001', 'Walk-in Guest', 'event-001');

      expect(isServiceError(result)).toBe(false);
      if (!isServiceError(result)) {
        expect(result.guest.name).toBe('Walk-in Guest');
        expect(result.check_in.method).toBe(CheckInMethod.GO_SHOW);
      }
    });

    it('should create guest with type="go_show" (Req 8.5)', async () => {
      const mockGuest: GuestInfo = {
        id: 'guest-new',
        event_id: 'event-001',
        name: 'New Guest',
        group: GuestGroup.FRIEND,
      };
      const mockCheckIn: CheckInRecord = {
        id: 'checkin-001',
        guest_id: 'guest-new',
        scanner_device_id: null,
        method: CheckInMethod.GO_SHOW,
        checked_in_at: new Date(),
      };

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001', tenant_id: 'tenant-001' });
      vi.mocked(repository.createGoShowGuest).mockResolvedValue(mockGuest);
      vi.mocked(repository.createCheckIn).mockResolvedValue(mockCheckIn);

      await service.registerGoShow('tenant-001', 'New Guest', 'event-001');

      expect(repository.createGoShowGuest).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: 'event-001',
          tenant_id: 'tenant-001',
          name: 'New Guest',
          type: GuestType.GO_SHOW,
        })
      );
    });

    it('should create check-in with method="go_show" (Req 8.6)', async () => {
      const mockGuest: GuestInfo = {
        id: 'guest-new',
        event_id: 'event-001',
        name: 'New Guest',
        group: GuestGroup.FRIEND,
      };
      const mockCheckIn: CheckInRecord = {
        id: 'checkin-001',
        guest_id: 'guest-new',
        scanner_device_id: null,
        method: CheckInMethod.GO_SHOW,
        checked_in_at: new Date(),
      };

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001', tenant_id: 'tenant-001' });
      vi.mocked(repository.createGoShowGuest).mockResolvedValue(mockGuest);
      vi.mocked(repository.createCheckIn).mockResolvedValue(mockCheckIn);

      await service.registerGoShow('tenant-001', 'New Guest', 'event-001');

      expect(repository.createCheckIn).toHaveBeenCalledWith(
        expect.objectContaining({
          method: CheckInMethod.GO_SHOW,
          scanner_device_id: null,
        })
      );
      // Verify the guest_id passed to createCheckIn matches what was passed to createGoShowGuest
      const createGoShowCall = vi.mocked(repository.createGoShowGuest).mock.calls[0][0];
      const createCheckInCall = vi.mocked(repository.createCheckIn).mock.calls[0][0];
      expect(createCheckInCall.guest_id).toBe(createGoShowCall.id);
    });

    it('should broadcast go_show_added event via WebSocket (Req 8.8)', async () => {
      const mockGuest: GuestInfo = {
        id: 'guest-new',
        event_id: 'event-001',
        name: 'Walk-in Guest',
        group: GuestGroup.FRIEND,
      };
      const mockCheckIn: CheckInRecord = {
        id: 'checkin-001',
        guest_id: 'guest-new',
        scanner_device_id: null,
        method: CheckInMethod.GO_SHOW,
        checked_in_at: new Date('2024-06-15T10:00:00Z'),
      };

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001', tenant_id: 'tenant-001' });
      vi.mocked(repository.createGoShowGuest).mockResolvedValue(mockGuest);
      vi.mocked(repository.createCheckIn).mockResolvedValue(mockCheckIn);

      await service.registerGoShow('tenant-001', 'Walk-in Guest', 'event-001');

      expect(broadcaster.broadcast).toHaveBeenCalledWith('event-001', {
        event_type: 'go_show_added',
        event_id: 'event-001',
        guest_id: 'guest-new',
        guest_name: 'Walk-in Guest',
        guest_group: GuestGroup.FRIEND,
        guest_type: GuestType.GO_SHOW,
        method: CheckInMethod.GO_SHOW,
        checked_in_at: mockCheckIn.checked_in_at,
      });
    });

    it('should return error if name is empty', async () => {
      const result = await service.registerGoShow('tenant-001', '', 'event-001');

      expect(isServiceError(result)).toBe(true);
      if (isServiceError(result)) {
        expect(result.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(result.message).toContain('Nama');
      }
    });

    it('should return error if name is only whitespace', async () => {
      const result = await service.registerGoShow('tenant-001', '   ', 'event-001');

      expect(isServiceError(result)).toBe(true);
      if (isServiceError(result)) {
        expect(result.code).toBe(ErrorCode.VALIDATION_FAILED);
      }
    });

    it('should return error if event not found', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue(null);

      const result = await service.registerGoShow('tenant-001', 'Walk-in Guest', 'nonexistent-event');

      expect(isServiceError(result)).toBe(true);
      if (isServiceError(result)) {
        expect(result.code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('should trim whitespace from guest name', async () => {
      const mockGuest: GuestInfo = {
        id: 'guest-new',
        event_id: 'event-001',
        name: 'Walk-in Guest',
        group: GuestGroup.FRIEND,
      };
      const mockCheckIn: CheckInRecord = {
        id: 'checkin-001',
        guest_id: 'guest-new',
        scanner_device_id: null,
        method: CheckInMethod.GO_SHOW,
        checked_in_at: new Date(),
      };

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001', tenant_id: 'tenant-001' });
      vi.mocked(repository.createGoShowGuest).mockResolvedValue(mockGuest);
      vi.mocked(repository.createCheckIn).mockResolvedValue(mockCheckIn);

      await service.registerGoShow('tenant-001', '  Walk-in Guest  ', 'event-001');

      expect(repository.createGoShowGuest).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Walk-in Guest',
        })
      );
    });

    it('should pass scanner_device_id when provided', async () => {
      const mockGuest: GuestInfo = {
        id: 'guest-new',
        event_id: 'event-001',
        name: 'New Guest',
        group: GuestGroup.FRIEND,
      };
      const mockCheckIn: CheckInRecord = {
        id: 'checkin-001',
        guest_id: 'guest-new',
        scanner_device_id: 'scanner-001',
        method: CheckInMethod.GO_SHOW,
        checked_in_at: new Date(),
      };

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001', tenant_id: 'tenant-001' });
      vi.mocked(repository.createGoShowGuest).mockResolvedValue(mockGuest);
      vi.mocked(repository.createCheckIn).mockResolvedValue(mockCheckIn);

      await service.registerGoShow('tenant-001', 'New Guest', 'event-001', 'scanner-001');

      expect(repository.createCheckIn).toHaveBeenCalledWith(
        expect.objectContaining({
          scanner_device_id: 'scanner-001',
          method: CheckInMethod.GO_SHOW,
        })
      );
    });
  });

  describe('isServiceError type guard', () => {
    it('should return true for error objects', () => {
      expect(
        isServiceError({ code: ErrorCode.GUEST_NOT_FOUND, message: 'Not found' })
      ).toBe(true);
    });

    it('should return false for search results (array)', () => {
      const results: GuestSearchResult[] = [
        { id: 'guest-001', name: 'John', group: GuestGroup.FRIEND, type: GuestType.INVITED, is_checked_in: false, checked_in_at: null },
      ];
      expect(isServiceError(results)).toBe(false);
    });

    it('should return false for manual check-in result', () => {
      expect(
        isServiceError({
          guest: createMockGuest(),
          check_in: { id: 'c1', guest_id: 'g1', scanner_device_id: null, method: CheckInMethod.MANUAL, checked_in_at: new Date() },
        })
      ).toBe(false);
    });

    it('should return false for go-show result', () => {
      expect(
        isServiceError({
          guest: createMockGuest(),
          check_in: { id: 'c1', guest_id: 'g1', scanner_device_id: null, method: CheckInMethod.GO_SHOW, checked_in_at: new Date() },
        })
      ).toBe(false);
    });
  });
});
