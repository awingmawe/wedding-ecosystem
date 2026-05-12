import { createDecipheriv, randomUUID } from 'crypto';
import {
  CheckInMethod,
  ErrorCode,
  GuestGroup,
  GuestType,
  VerificationStatus,
} from '@wedding/shared';
import type { ScanVerificationResult } from '@wedding/shared';

// --- Constants ---

const AES_ALGORITHM = 'aes-256-cbc';
const CHECKIN_KEY_PREFIX = 'checkin:';
/** TTL for check-in keys in Redis (24 hours) */
const CHECKIN_KEY_TTL_SECONDS = 86400;
/** Minimum characters for guest search (Req 8.1) */
const MIN_SEARCH_CHARS = 3;
/** Maximum search results returned (Req 8.1) */
const MAX_SEARCH_RESULTS = 10;

// --- Types ---

export interface CheckInRecord {
  id: string;
  guest_id: string;
  scanner_device_id: string | null;
  method: CheckInMethod;
  checked_in_at: Date;
}

export interface GuestInfo {
  id: string;
  event_id: string;
  name: string;
  group: GuestGroup;
}

export interface QRCodeInfo {
  guest_id: string;
  is_active: boolean;
}

export interface GuestSearchResult {
  id: string;
  name: string;
  group: GuestGroup;
  type: GuestType;
  is_checked_in: boolean;
  checked_in_at: Date | null;
}

export interface ManualCheckInResult {
  guest: GuestInfo;
  check_in: CheckInRecord;
}

export interface GoShowResult {
  guest: GuestInfo;
  check_in: CheckInRecord;
}

export interface CheckInServiceError {
  code: ErrorCode;
  message: string;
}

export interface CheckInBroadcastPayload {
  event_type: 'guest_checked_in' | 'go_show_added';
  event_id: string;
  guest_id: string;
  guest_name: string;
  guest_group: GuestGroup;
  guest_type: GuestType;
  method: CheckInMethod;
  checked_in_at: Date;
}

// --- Repository interface (dependency injection) ---

export interface CheckInRepository {
  findGuestById(guestId: string): Promise<GuestInfo | null>;
  findGuestByIdAndEvent(guestId: string, eventId: string): Promise<GuestInfo | null>;
  findQRCodeByPayload(payload: string): Promise<QRCodeInfo | null>;
  findCheckInByGuestId(guestId: string): Promise<CheckInRecord | null>;
  createCheckIn(data: {
    id: string;
    guest_id: string;
    scanner_device_id: string | null;
    method: CheckInMethod;
    checked_in_at: Date;
  }): Promise<CheckInRecord>;
  searchGuestsByName(
    eventId: string,
    query: string,
    limit: number
  ): Promise<GuestSearchResult[]>;
  createGoShowGuest(data: {
    id: string;
    event_id: string;
    tenant_id: string;
    name: string;
    type: GuestType;
  }): Promise<GuestInfo>;
  findEventById(eventId: string): Promise<{ id: string; tenant_id: string } | null>;
}

// --- Redis client interface (dependency injection) ---

export interface RedisClient {
  /**
   * SET key value NX EX ttl — atomic set-if-not-exists with expiry.
   * Returns 'OK' if the key was set, null if it already existed.
   */
  set(
    key: string,
    value: string,
    mode: 'EX',
    ttl: number,
    flag: 'NX'
  ): Promise<string | null>;

  /**
   * GET key — retrieve value for a key.
   */
  get(key: string): Promise<string | null>;
}

// --- WebSocket broadcaster interface ---

export interface CheckInBroadcaster {
  broadcast(eventId: string, payload: CheckInBroadcastPayload): void;
}

// --- Check-in Service ---

export class CheckInService {
  private readonly repository: CheckInRepository;
  private readonly redis: RedisClient;
  private readonly encryptionKey: Buffer;
  private readonly broadcaster: CheckInBroadcaster | null;

  constructor(config: {
    repository: CheckInRepository;
    redis: RedisClient;
    encryptionKey: string;
    broadcaster?: CheckInBroadcaster;
  }) {
    this.repository = config.repository;
    this.redis = config.redis;
    this.broadcaster = config.broadcaster ?? null;
    this.encryptionKey = Buffer.from(config.encryptionKey, 'hex');
    if (this.encryptionKey.length !== 32) {
      throw new Error(
        'Encryption key must be 32 bytes (64 hex characters) for AES-256'
      );
    }
  }

  /**
   * Verify a QR code scan and process check-in.
   *
   * Flow:
   * 1. Decrypt QR payload to extract guest_id and event_id
   * 2. Validate guest exists and belongs to the specified event
   * 3. Use Redis SET NX for atomic duplicate detection (< 200ms)
   * 4. If first check-in: create DB record, return GREEN
   * 5. If already checked-in: return YELLOW with timestamp
   * 6. If invalid: return RED with error
   *
   * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.8, 12.5
   */
  async verifyQRScan(
    qrPayload: string,
    eventId: string,
    scannerDeviceId: string | null = null
  ): Promise<ScanVerificationResult> {
    // Step 1: Decrypt QR payload
    const decryptResult = this.decryptQRPayload(qrPayload);
    if (!decryptResult) {
      return {
        status: VerificationStatus.RED,
        guest_name: null,
        guest_group: null,
        message: 'QR code tidak valid',
        checked_in_at: null,
      };
    }

    const { guestId, eventId: qrEventId } = decryptResult;

    // Step 2: Validate event matches (Req 7.3 - wrong event)
    if (qrEventId !== eventId) {
      return {
        status: VerificationStatus.RED,
        guest_name: null,
        guest_group: null,
        message: 'QR code bukan untuk event ini',
        checked_in_at: null,
      };
    }

    // Step 3: Validate guest exists in database
    const guest = await this.repository.findGuestById(guestId);
    if (!guest) {
      return {
        status: VerificationStatus.RED,
        guest_name: null,
        guest_group: null,
        message: 'Tamu tidak ditemukan',
        checked_in_at: null,
      };
    }

    // Step 4: Atomic duplicate detection using Redis SET NX (Req 7.5, 7.8, 12.5)
    const redisKey = `${CHECKIN_KEY_PREFIX}${guestId}`;
    const now = new Date();
    const timestamp = now.toISOString();

    // SET NX: only succeeds if key doesn't exist (atomic operation)
    const setResult = await this.redis.set(
      redisKey,
      timestamp,
      'EX',
      CHECKIN_KEY_TTL_SECONDS,
      'NX'
    );

    if (setResult === null) {
      // Key already exists — guest was already checked in (YELLOW)
      const previousTimestamp = await this.redis.get(redisKey);
      const checkedInAt = previousTimestamp ? new Date(previousTimestamp) : null;

      return {
        status: VerificationStatus.YELLOW,
        guest_name: guest.name,
        guest_group: guest.group,
        message: 'Tamu sudah check-in sebelumnya',
        checked_in_at: checkedInAt,
      };
    }

    // Step 5: First check-in — create DB record (GREEN)
    const checkInId = crypto.randomUUID();
    await this.repository.createCheckIn({
      id: checkInId,
      guest_id: guestId,
      scanner_device_id: scannerDeviceId,
      method: CheckInMethod.QR_SCAN,
      checked_in_at: now,
    });

    return {
      status: VerificationStatus.GREEN,
      guest_name: guest.name,
      guest_group: guest.group,
      message: 'Check-in berhasil',
      checked_in_at: now,
    };
  }

  /**
   * Search guests by name for manual check-in (Req 8.1)
   * - Partial match (ILIKE '%query%')
   * - Minimum 3 characters input
   * - Maximum 10 results with check-in status
   */
  async searchGuests(
    eventId: string,
    query: string
  ): Promise<GuestSearchResult[] | CheckInServiceError> {
    // Validate minimum search length (Req 8.1)
    if (query.length < MIN_SEARCH_CHARS) {
      return {
        code: ErrorCode.VALIDATION_FAILED,
        message: `Kata kunci pencarian minimal ${MIN_SEARCH_CHARS} karakter`,
      };
    }

    // Verify event exists
    const event = await this.repository.findEventById(eventId);
    if (!event) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Event tidak ditemukan',
      };
    }

    // Search with partial match, max 10 results (Req 8.1)
    const results = await this.repository.searchGuestsByName(
      eventId,
      query,
      MAX_SEARCH_RESULTS
    );

    return results;
  }

  /**
   * Manual check-in for a found guest (Req 8.2)
   * - One-click check-in
   * - Validates guest exists and not already checked-in (Req 8.4)
   * - Creates check-in record with method="manual"
   * - Broadcasts via WebSocket (Req 8.8)
   */
  async manualCheckIn(
    guestId: string,
    eventId: string,
    scannerDeviceId?: string | null
  ): Promise<ManualCheckInResult | CheckInServiceError> {
    // Verify event exists
    const event = await this.repository.findEventById(eventId);
    if (!event) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Event tidak ditemukan',
      };
    }

    // Verify guest exists in this event
    const guest = await this.repository.findGuestByIdAndEvent(guestId, eventId);
    if (!guest) {
      return {
        code: ErrorCode.GUEST_NOT_FOUND,
        message: 'Tamu tidak ditemukan',
      };
    }

    // Check if already checked-in (Req 8.4)
    const existingCheckIn = await this.repository.findCheckInByGuestId(guestId);
    if (existingCheckIn) {
      return {
        code: ErrorCode.ALREADY_CHECKED_IN,
        message: 'Tamu sudah check-in sebelumnya',
      };
    }

    // Create check-in record with method="manual" (Req 8.2)
    const now = new Date();
    const checkIn = await this.repository.createCheckIn({
      id: randomUUID(),
      guest_id: guestId,
      scanner_device_id: scannerDeviceId ?? null,
      method: CheckInMethod.MANUAL,
      checked_in_at: now,
    });

    // Broadcast via WebSocket (Req 8.8 - < 500ms)
    if (this.broadcaster) {
      this.broadcaster.broadcast(eventId, {
        event_type: 'guest_checked_in',
        event_id: eventId,
        guest_id: guest.id,
        guest_name: guest.name,
        guest_group: guest.group,
        guest_type: GuestType.INVITED,
        method: CheckInMethod.MANUAL,
        checked_in_at: checkIn.checked_in_at,
      });
    }

    return { guest, check_in: checkIn };
  }

  /**
   * Register a Go-Show guest (Req 8.5, 8.6)
   * - Creates new guest record with type="go_show"
   * - Immediately creates check-in record with method="go_show"
   * - Broadcasts via WebSocket (Req 8.8)
   */
  async registerGoShow(
    name: string,
    eventId: string,
    scannerDeviceId?: string | null
  ): Promise<GoShowResult | CheckInServiceError> {
    // Validate name is not empty
    if (!name || name.trim().length === 0) {
      return {
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Nama tamu tidak boleh kosong',
      };
    }

    // Verify event exists
    const event = await this.repository.findEventById(eventId);
    if (!event) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Event tidak ditemukan',
      };
    }

    // Create guest record with type="go_show" (Req 8.5)
    const guestId = randomUUID();
    const guest = await this.repository.createGoShowGuest({
      id: guestId,
      event_id: eventId,
      tenant_id: event.tenant_id,
      name: name.trim(),
      type: GuestType.GO_SHOW,
    });

    // Immediately create check-in record with method="go_show" (Req 8.6)
    const now = new Date();
    const checkIn = await this.repository.createCheckIn({
      id: randomUUID(),
      guest_id: guestId,
      scanner_device_id: scannerDeviceId ?? null,
      method: CheckInMethod.GO_SHOW,
      checked_in_at: now,
    });

    // Broadcast via WebSocket (Req 8.8 - < 500ms)
    if (this.broadcaster) {
      this.broadcaster.broadcast(eventId, {
        event_type: 'go_show_added',
        event_id: eventId,
        guest_id: guest.id,
        guest_name: guest.name,
        guest_group: guest.group,
        guest_type: GuestType.GO_SHOW,
        method: CheckInMethod.GO_SHOW,
        checked_in_at: checkIn.checked_in_at,
      });
    }

    return { guest, check_in: checkIn };
  }

  /**
   * Decrypt a QR payload to extract guest_id and event_id.
   * Payload format: iv_hex:encrypted_hex
   * Plaintext format: guest_id|event_id|timestamp|nonce
   *
   * Returns null if decryption fails (invalid QR).
   */
  decryptQRPayload(
    payload: string
  ): { guestId: string; eventId: string } | null {
    try {
      const parts = payload.split(':');
      if (parts.length !== 2) {
        return null;
      }

      const [ivHex, encryptedHex] = parts;

      // Validate hex format
      if (!/^[0-9a-f]+$/.test(ivHex) || !/^[0-9a-f]+$/.test(encryptedHex)) {
        return null;
      }

      // IV must be 16 bytes (32 hex chars)
      if (ivHex.length !== 32) {
        return null;
      }

      const iv = Buffer.from(ivHex, 'hex');
      const decipher = createDecipheriv(AES_ALGORITHM, this.encryptionKey, iv);

      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Parse plaintext: guest_id|event_id|timestamp|nonce
      const segments = decrypted.split('|');
      if (segments.length < 2) {
        return null;
      }

      const [guestId, eventId] = segments;
      if (!guestId || !eventId) {
        return null;
      }

      return { guestId, eventId };
    } catch {
      // Decryption failure — invalid QR
      return null;
    }
  }
}

// --- Type guards ---

export function isCheckInError(
  result: ScanVerificationResult
): boolean {
  return result.status === VerificationStatus.RED;
}

/**
 * Type guard for manual check-in / Go-Show / search errors
 */
export function isServiceError(
  result:
    | GuestSearchResult[]
    | ManualCheckInResult
    | GoShowResult
    | CheckInServiceError
): result is CheckInServiceError {
  return (
    typeof result === 'object' &&
    !Array.isArray(result) &&
    'code' in result &&
    'message' in result &&
    !('guest' in result)
  );
}

// --- Exported constants for testing ---

export const CHECKIN_CONSTANTS = {
  AES_ALGORITHM,
  CHECKIN_KEY_PREFIX,
  CHECKIN_KEY_TTL_SECONDS,
  MIN_SEARCH_CHARS,
  MAX_SEARCH_RESULTS,
} as const;
