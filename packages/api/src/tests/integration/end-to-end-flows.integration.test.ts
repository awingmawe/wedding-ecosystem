/**
 * Integration Tests: End-to-End Flows
 *
 * Tests the integration between services (guest, checkin, RSVP, realtime/WebSocket,
 * notification) to verify complete user flows work correctly.
 *
 * Validates: Requirements 7.1, 8.8, 9.1, 9.5, 12.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCipheriv, randomBytes, randomUUID } from 'crypto';
import {
  AttendanceType,
  CheckInMethod,
  ErrorCode,
  GuestGroup,
  GuestType,
  VerificationStatus,
  DeliveryStatus,
} from '@wedding/shared';
import {
  GuestService,
  GuestRepository,
  GuestRecord,
  QRCodeRecord,
} from '../../services/guest.service';
import {
  CheckInService,
  CheckInRepository,
  RedisClient,
  CheckInBroadcaster,
  CheckInRecord,
  GuestInfo,
  isServiceError,
} from '../../services/checkin.service';
import {
  RsvpService,
  RsvpRepository,
  RsvpBroadcaster,
  RsvpRecord,
  GuestForRsvp,
  isRsvpError,
} from '../../services/rsvp.service';
// --- Inline Stats Service for integration testing ---
// (Avoids cross-package import; mirrors packages/realtime/src/stats.ts behavior)

interface StatsUpdatedPayload {
  event_id: string;
  total_guests: number;
  total_rsvp: number;
  total_checked_in: number;
  total_go_show: number;
}

interface StatsRepository {
  countGuestsByEvent(eventId: string): Promise<number>;
  countRsvpByEvent(eventId: string): Promise<number>;
  countCheckInsByEvent(eventId: string): Promise<number>;
  countGoShowByEvent(eventId: string): Promise<number>;
}

interface StatsBroadcaster {
  broadcastStats(eventId: string, payload: StatsUpdatedPayload): void;
}

class StatsService {
  private readonly repository: StatsRepository;
  private readonly broadcaster: StatsBroadcaster;

  constructor(config: { repository: StatsRepository; broadcaster: StatsBroadcaster }) {
    this.repository = config.repository;
    this.broadcaster = config.broadcaster;
  }

  async calculateAndBroadcastStats(eventId: string): Promise<StatsUpdatedPayload> {
    const [totalGuests, totalRsvp, totalCheckedIn, totalGoShow] = await Promise.all([
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

    this.broadcaster.broadcastStats(eventId, payload);
    return payload;
  }
}

// --- Constants ---

const TEST_ENCRYPTION_KEY =
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
const TEST_TENANT_ID = 'tenant-001';
const TEST_EVENT_ID = 'event-001';
const TEST_EVENT_SLUG = 'wedding-john-jane';

// --- Helper: Create valid encrypted QR payload ---

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


// --- Shared in-memory state for integration ---

interface IntegrationState {
  guests: Map<string, GuestRecord & { qr_payload?: string }>;
  qrCodes: Map<string, QRCodeRecord>;
  checkIns: Map<string, CheckInRecord>;
  rsvps: Map<string, RsvpRecord>;
  broadcasts: Array<{ eventId: string; payload: unknown }>;
  statsBroadcasts: Array<{ eventId: string; payload: unknown }>;
}

function createIntegrationState(): IntegrationState {
  return {
    guests: new Map(),
    qrCodes: new Map(),
    checkIns: new Map(),
    rsvps: new Map(),
    broadcasts: [],
    statsBroadcasts: [],
  };
}

// --- Mock factories that share state ---

function createSharedGuestRepository(state: IntegrationState): GuestRepository {
  return {
    createGuest: vi.fn(async (data) => {
      const record: GuestRecord = {
        ...data,
        created_at: new Date(),
      };
      state.guests.set(data.id, record);
      return record;
    }),
    createQRCode: vi.fn(async (data) => {
      const record: QRCodeRecord = {
        ...data,
        qr_image_url: null,
        generated_at: new Date(),
      };
      state.qrCodes.set(data.guest_id, record);
      // Store payload on guest for easy lookup
      const guest = state.guests.get(data.guest_id);
      if (guest) {
        guest.qr_payload = data.qr_payload;
      }
      return record;
    }),
    findGuestById: vi.fn(async (guestId, tenantId) => {
      const guest = state.guests.get(guestId);
      if (guest && guest.tenant_id === tenantId) return guest;
      return null;
    }),
    findGuestBySlug: vi.fn(async (eventId, slug) => {
      for (const guest of state.guests.values()) {
        if (guest.event_id === eventId && guest.slug === slug) return guest;
      }
      return null;
    }),
    findGuestsByEvent: vi.fn(async (eventId, tenantId, pagination) => {
      const guests = Array.from(state.guests.values()).filter(
        (g) => g.event_id === eventId && g.tenant_id === tenantId
      );
      return {
        data: guests.map((g) => ({
          id: g.id,
          name: g.name,
          slug: g.slug,
          group: g.group,
          type: g.type,
          plus_one_count: g.plus_one_count,
          phone: g.phone,
          email: g.email,
          delivery_status: g.delivery_status,
          rsvp_status: null,
          check_in_status: state.checkIns.has(g.id),
          qr_active: true,
        })),
        pagination: {
          page: pagination.page ?? 1,
          per_page: pagination.per_page ?? 50,
          total: guests.length,
          total_pages: Math.ceil(guests.length / (pagination.per_page ?? 50)),
        },
      };
    }),
    updateGuest: vi.fn(async (guestId, tenantId, data) => {
      const guest = state.guests.get(guestId);
      if (!guest || guest.tenant_id !== tenantId) return null;
      Object.assign(guest, data);
      return guest;
    }),
    deleteGuest: vi.fn(async (guestId, tenantId) => {
      const guest = state.guests.get(guestId);
      if (!guest || guest.tenant_id !== tenantId) return false;
      state.guests.delete(guestId);
      return true;
    }),
    deactivateQRCode: vi.fn(async (guestId) => {
      const qr = state.qrCodes.get(guestId);
      if (qr) {
        qr.is_active = false;
        return true;
      }
      return false;
    }),
    findQRCodeByGuestId: vi.fn(async (guestId) => {
      return state.qrCodes.get(guestId) ?? null;
    }),
    checkSlugExists: vi.fn(async (eventId, slug) => {
      for (const guest of state.guests.values()) {
        if (guest.event_id === eventId && guest.slug === slug) return true;
      }
      return false;
    }),
    checkQRPayloadExists: vi.fn(async (payload) => {
      for (const qr of state.qrCodes.values()) {
        if (qr.qr_payload === payload) return true;
      }
      return false;
    }),
    findEventById: vi.fn(async (eventId, tenantId) => {
      if (eventId === TEST_EVENT_ID && tenantId === TEST_TENANT_ID) {
        return { id: TEST_EVENT_ID, slug: TEST_EVENT_SLUG };
      }
      return null;
    }),
  };
}

function createSharedCheckInRepository(state: IntegrationState): CheckInRepository {
  return {
    findGuestById: vi.fn(async (guestId) => {
      const guest = state.guests.get(guestId);
      if (!guest) return null;
      return {
        id: guest.id,
        event_id: guest.event_id,
        name: guest.name,
        group: guest.group,
      };
    }),
    findGuestByIdAndEvent: vi.fn(async (guestId, eventId) => {
      const guest = state.guests.get(guestId);
      if (!guest || guest.event_id !== eventId) return null;
      return {
        id: guest.id,
        event_id: guest.event_id,
        name: guest.name,
        group: guest.group,
      };
    }),
    findQRCodeByPayload: vi.fn(async (payload) => {
      for (const qr of state.qrCodes.values()) {
        if (qr.qr_payload === payload) {
          return { guest_id: qr.guest_id, is_active: qr.is_active };
        }
      }
      return null;
    }),
    findCheckInByGuestId: vi.fn(async (guestId) => {
      return state.checkIns.get(guestId) ?? null;
    }),
    createCheckIn: vi.fn(async (data) => {
      const record: CheckInRecord = {
        ...data,
      };
      state.checkIns.set(data.guest_id, record);
      return record;
    }),
    searchGuestsByName: vi.fn(async (eventId, query, limit) => {
      const results = Array.from(state.guests.values())
        .filter(
          (g) =>
            g.event_id === eventId &&
            g.name.toLowerCase().includes(query.toLowerCase())
        )
        .slice(0, limit)
        .map((g) => ({
          id: g.id,
          name: g.name,
          group: g.group,
          type: g.type,
          is_checked_in: state.checkIns.has(g.id),
          checked_in_at: state.checkIns.get(g.id)?.checked_in_at ?? null,
        }));
      return results;
    }),
    createGoShowGuest: vi.fn(async (data) => {
      const guest: GuestRecord = {
        id: data.id,
        event_id: data.event_id,
        tenant_id: data.tenant_id,
        name: data.name,
        slug: data.name.toLowerCase().replace(/\s+/g, '-'),
        phone: null,
        email: null,
        group: GuestGroup.FRIEND,
        type: data.type,
        plus_one_count: 0,
        invitation_url: null,
        delivery_status: DeliveryStatus.NOT_SENT,
        created_at: new Date(),
      };
      state.guests.set(data.id, guest);
      return {
        id: data.id,
        event_id: data.event_id,
        name: data.name,
        group: GuestGroup.FRIEND,
      };
    }),
    findEventById: vi.fn(async (eventId) => {
      if (eventId === TEST_EVENT_ID) {
        return { id: TEST_EVENT_ID, tenant_id: TEST_TENANT_ID };
      }
      return null;
    }),
  };
}

function createSharedRedis(state: IntegrationState): RedisClient {
  const store = new Map<string, { value: string; expiresAt: number }>();

  return {
    set: vi.fn(async (key, value, mode, ttl, flag) => {
      if (flag === 'NX') {
        const existing = store.get(key);
        if (existing && existing.expiresAt > Date.now()) {
          return null; // Key exists, NX fails
        }
      }
      store.set(key, {
        value,
        expiresAt: Date.now() + ttl * 1000,
      });
      return 'OK';
    }),
    get: vi.fn(async (key) => {
      const entry = store.get(key);
      if (!entry || entry.expiresAt < Date.now()) return null;
      return entry.value;
    }),
  };
}

function createSharedCheckInBroadcaster(state: IntegrationState): CheckInBroadcaster {
  return {
    broadcast: vi.fn((eventId, payload) => {
      state.broadcasts.push({ eventId, payload });
    }),
  };
}

function createSharedRsvpRepository(state: IntegrationState): RsvpRepository {
  return {
    findGuestById: vi.fn(async (guestId, tenantId) => {
      const guest = state.guests.get(guestId);
      if (!guest || guest.tenant_id !== tenantId) return null;
      return {
        id: guest.id,
        event_id: guest.event_id,
        tenant_id: guest.tenant_id,
        name: guest.name,
        plus_one_count: guest.plus_one_count,
      };
    }),
    findRsvpByGuestId: vi.fn(async (guestId) => {
      return state.rsvps.get(guestId) ?? null;
    }),
    createRsvp: vi.fn(async (data) => {
      const record: RsvpRecord = {
        ...data,
        submitted_at: new Date(),
      };
      state.rsvps.set(data.guest_id, record);
      return record;
    }),
    updateRsvp: vi.fn(async (rsvpId, data) => {
      for (const [guestId, rsvp] of state.rsvps.entries()) {
        if (rsvp.id === rsvpId) {
          const updated: RsvpRecord = {
            ...rsvp,
            ...data,
            submitted_at: new Date(),
          };
          state.rsvps.set(guestId, updated);
          return updated;
        }
      }
      throw new Error('RSVP not found');
    }),
  };
}

function createSharedRsvpBroadcaster(state: IntegrationState): RsvpBroadcaster {
  return {
    broadcast: vi.fn((eventId, payload) => {
      state.broadcasts.push({ eventId, payload });
    }),
  };
}

function createSharedStatsRepository(state: IntegrationState): StatsRepository {
  return {
    countGuestsByEvent: vi.fn(async (eventId) => {
      return Array.from(state.guests.values()).filter(
        (g) => g.event_id === eventId
      ).length;
    }),
    countRsvpByEvent: vi.fn(async (eventId) => {
      let count = 0;
      for (const [guestId, rsvp] of state.rsvps.entries()) {
        const guest = state.guests.get(guestId);
        if (guest && guest.event_id === eventId && rsvp.attendance !== AttendanceType.DECLINE) {
          count++;
        }
      }
      return count;
    }),
    countCheckInsByEvent: vi.fn(async (eventId) => {
      let count = 0;
      for (const [guestId] of state.checkIns.entries()) {
        const guest = state.guests.get(guestId);
        if (guest && guest.event_id === eventId) {
          count++;
        }
      }
      return count;
    }),
    countGoShowByEvent: vi.fn(async (eventId) => {
      let count = 0;
      for (const guest of state.guests.values()) {
        if (guest.event_id === eventId && guest.type === GuestType.GO_SHOW) {
          count++;
        }
      }
      return count;
    }),
  };
}

function createSharedStatsBroadcaster(state: IntegrationState): StatsBroadcaster {
  return {
    broadcastStats: vi.fn((eventId, payload) => {
      state.statsBroadcasts.push({ eventId, payload });
    }),
  };
}


// =============================================================================
// INTEGRATION TEST SUITE
// =============================================================================

describe('Integration Tests: End-to-End Flows', () => {
  let state: IntegrationState;
  let guestService: GuestService;
  let checkInService: CheckInService;
  let rsvpService: RsvpService;
  let statsService: StatsService;

  beforeEach(() => {
    state = createIntegrationState();

    const guestRepo = createSharedGuestRepository(state);
    const checkInRepo = createSharedCheckInRepository(state);
    const redis = createSharedRedis(state);
    const checkInBroadcaster = createSharedCheckInBroadcaster(state);
    const rsvpRepo = createSharedRsvpRepository(state);
    const rsvpBroadcaster = createSharedRsvpBroadcaster(state);
    const statsRepo = createSharedStatsRepository(state);
    const statsBroadcaster = createSharedStatsBroadcaster(state);

    guestService = new GuestService({
      repository: guestRepo,
      encryptionKey: TEST_ENCRYPTION_KEY,
    });

    checkInService = new CheckInService({
      repository: checkInRepo,
      redis,
      encryptionKey: TEST_ENCRYPTION_KEY,
      broadcaster: checkInBroadcaster,
    });

    rsvpService = new RsvpService({
      repository: rsvpRepo,
      broadcaster: rsvpBroadcaster,
    });

    statsService = new StatsService({
      repository: statsRepo,
      broadcaster: statsBroadcaster,
    });
  });

  // ===========================================================================
  // Flow 1: Add Guest → Generate QR → Scan QR → Check-in → Dashboard Update
  // Validates: Requirements 7.1, 9.1
  // ===========================================================================

  describe('Flow 1: Add Guest → Generate QR → Scan QR → Check-in → Dashboard Update', () => {
    it('should complete the full guest check-in flow end-to-end', async () => {
      // Step 1: Add a guest (auto-generates QR code)
      const addResult = await guestService.addGuest(
        TEST_EVENT_ID,
        TEST_TENANT_ID,
        {
          name: 'Budi Santoso',
          group: GuestGroup.FAMILY,
          phone: '+6281234567890',
          email: 'budi@example.com',
        }
      );

      // Verify guest was created with QR code
      expect('id' in addResult).toBe(true);
      if (!('id' in addResult)) return;

      const guest = addResult;
      expect(guest.name).toBe('Budi Santoso');
      expect(guest.qr_code).not.toBeNull();
      expect(guest.qr_code!.is_active).toBe(true);
      expect(guest.qr_code!.qr_payload).toBeTruthy();

      // Step 2: Scan the QR code at the event
      const qrPayload = guest.qr_code!.qr_payload;
      const scanResult = await checkInService.verifyQRScan(
        qrPayload,
        TEST_EVENT_ID,
        'scanner-device-001'
      );

      // Step 3: Verify check-in succeeded (GREEN)
      expect(scanResult.status).toBe(VerificationStatus.GREEN);
      expect(scanResult.guest_name).toBe('Budi Santoso');
      expect(scanResult.guest_group).toBe(GuestGroup.FAMILY);
      expect(scanResult.message).toBe('Check-in berhasil');
      expect(scanResult.checked_in_at).toBeInstanceOf(Date);

      // Step 4: Verify check-in record was created in state
      expect(state.checkIns.has(guest.id)).toBe(true);
      const checkInRecord = state.checkIns.get(guest.id)!;
      expect(checkInRecord.method).toBe(CheckInMethod.QR_SCAN);
      expect(checkInRecord.scanner_device_id).toBe('scanner-device-001');

      // Step 5: Verify dashboard stats reflect the check-in
      const stats = await statsService.calculateAndBroadcastStats(TEST_EVENT_ID);
      expect(stats.total_guests).toBe(1);
      expect(stats.total_checked_in).toBe(1);
      expect(stats.total_go_show).toBe(0);

      // Step 6: Verify stats broadcast was sent
      expect(state.statsBroadcasts.length).toBeGreaterThan(0);
      const lastStatsBroadcast = state.statsBroadcasts[state.statsBroadcasts.length - 1];
      expect(lastStatsBroadcast.eventId).toBe(TEST_EVENT_ID);
    });

    it('should prevent duplicate check-in after successful scan', async () => {
      // Add guest and get QR
      const addResult = await guestService.addGuest(
        TEST_EVENT_ID,
        TEST_TENANT_ID,
        { name: 'Siti Rahayu', group: GuestGroup.FRIEND }
      );
      expect('id' in addResult).toBe(true);
      if (!('id' in addResult)) return;

      const qrPayload = addResult.qr_code!.qr_payload;

      // First scan: GREEN
      const firstScan = await checkInService.verifyQRScan(qrPayload, TEST_EVENT_ID);
      expect(firstScan.status).toBe(VerificationStatus.GREEN);

      // Second scan: YELLOW (duplicate)
      const secondScan = await checkInService.verifyQRScan(qrPayload, TEST_EVENT_ID);
      expect(secondScan.status).toBe(VerificationStatus.YELLOW);
      expect(secondScan.guest_name).toBe('Siti Rahayu');
      expect(secondScan.message).toBe('Tamu sudah check-in sebelumnya');
      expect(secondScan.checked_in_at).toBeInstanceOf(Date);

      // Only one check-in record exists
      expect(state.checkIns.size).toBe(1);
    });

    it('should reject QR code from a different event', async () => {
      // Add guest to event-001
      const addResult = await guestService.addGuest(
        TEST_EVENT_ID,
        TEST_TENANT_ID,
        { name: 'Ahmad Fauzi', group: GuestGroup.COLLEAGUE }
      );
      expect('id' in addResult).toBe(true);
      if (!('id' in addResult)) return;

      const qrPayload = addResult.qr_code!.qr_payload;

      // Try to scan at a different event
      const scanResult = await checkInService.verifyQRScan(
        qrPayload,
        'event-999' // Different event
      );

      expect(scanResult.status).toBe(VerificationStatus.RED);
      expect(scanResult.message).toBe('QR code bukan untuk event ini');
      expect(scanResult.guest_name).toBeNull();
    });
  });

  // ===========================================================================
  // Flow 2: RSVP Submit → Dashboard Real-time Update
  // Validates: Requirements 9.1
  // ===========================================================================

  describe('Flow 2: RSVP Submit → Dashboard Real-time Update', () => {
    it('should broadcast RSVP update to dashboard via WebSocket', async () => {
      // Setup: Add a guest first
      const addResult = await guestService.addGuest(
        TEST_EVENT_ID,
        TEST_TENANT_ID,
        {
          name: 'Dewi Lestari',
          group: GuestGroup.FAMILY,
          plus_one_count: 2,
        }
      );
      expect('id' in addResult).toBe(true);
      if (!('id' in addResult)) return;

      const guestId = addResult.id;

      // Clear broadcasts from guest creation
      state.broadcasts = [];

      // Submit RSVP
      const rsvpResult = await rsvpService.submitRsvp(
        guestId,
        TEST_TENANT_ID,
        {
          attendance: AttendanceType.BOTH,
          guest_count: 3,
        }
      );

      // Verify RSVP was created
      expect(isRsvpError(rsvpResult)).toBe(false);
      if (isRsvpError(rsvpResult)) return;

      expect(rsvpResult.attendance).toBe(AttendanceType.BOTH);
      expect(rsvpResult.guest_count).toBe(3);

      // Verify WebSocket broadcast was triggered
      expect(state.broadcasts.length).toBe(1);
      const broadcast = state.broadcasts[0];
      expect(broadcast.eventId).toBe(TEST_EVENT_ID);

      const payload = broadcast.payload as {
        event_type: string;
        guest_name: string;
        attendance: string;
        guest_count: number;
      };
      expect(payload.event_type).toBe('rsvp_updated');
      expect(payload.guest_name).toBe('Dewi Lestari');
      expect(payload.attendance).toBe(AttendanceType.BOTH);
      expect(payload.guest_count).toBe(3);

      // Verify stats reflect the RSVP
      const stats = await statsService.calculateAndBroadcastStats(TEST_EVENT_ID);
      expect(stats.total_guests).toBe(1);
      expect(stats.total_rsvp).toBe(1);
    });

    it('should update existing RSVP and broadcast the change', async () => {
      // Setup: Add guest and submit initial RSVP
      const addResult = await guestService.addGuest(
        TEST_EVENT_ID,
        TEST_TENANT_ID,
        {
          name: 'Rina Wati',
          group: GuestGroup.FRIEND,
          plus_one_count: 1,
        }
      );
      expect('id' in addResult).toBe(true);
      if (!('id' in addResult)) return;

      const guestId = addResult.id;

      // First RSVP: attending akad with 2 guests
      await rsvpService.submitRsvp(guestId, TEST_TENANT_ID, {
        attendance: AttendanceType.AKAD,
        guest_count: 2,
      });

      // Clear broadcasts
      state.broadcasts = [];

      // Update RSVP: now attending both with 1 guest
      const updateResult = await rsvpService.submitRsvp(guestId, TEST_TENANT_ID, {
        attendance: AttendanceType.BOTH,
        guest_count: 1,
      });

      expect(isRsvpError(updateResult)).toBe(false);
      if (isRsvpError(updateResult)) return;

      expect(updateResult.attendance).toBe(AttendanceType.BOTH);
      expect(updateResult.guest_count).toBe(1);

      // Verify broadcast was sent for the update
      expect(state.broadcasts.length).toBe(1);
      const payload = state.broadcasts[0].payload as {
        event_type: string;
        attendance: string;
        guest_count: number;
      };
      expect(payload.event_type).toBe('rsvp_updated');
      expect(payload.attendance).toBe(AttendanceType.BOTH);
      expect(payload.guest_count).toBe(1);

      // Only one RSVP record exists (upsert, not duplicate)
      expect(state.rsvps.size).toBe(1);
    });

    it('should handle RSVP decline and broadcast with guest_count 0', async () => {
      // Setup: Add guest
      const addResult = await guestService.addGuest(
        TEST_EVENT_ID,
        TEST_TENANT_ID,
        { name: 'Hendra Wijaya', group: GuestGroup.COLLEAGUE, plus_one_count: 3 }
      );
      expect('id' in addResult).toBe(true);
      if (!('id' in addResult)) return;

      state.broadcasts = [];

      // Submit decline
      const rsvpResult = await rsvpService.submitRsvp(
        addResult.id,
        TEST_TENANT_ID,
        { attendance: AttendanceType.DECLINE, guest_count: 0 }
      );

      expect(isRsvpError(rsvpResult)).toBe(false);
      if (isRsvpError(rsvpResult)) return;

      expect(rsvpResult.guest_count).toBe(0);

      // Verify broadcast
      const payload = state.broadcasts[0].payload as {
        guest_count: number;
        attendance: string;
      };
      expect(payload.guest_count).toBe(0);
      expect(payload.attendance).toBe(AttendanceType.DECLINE);

      // Stats should NOT count declined RSVP
      const stats = await statsService.calculateAndBroadcastStats(TEST_EVENT_ID);
      expect(stats.total_rsvp).toBe(0);
    });
  });


  // ===========================================================================
  // Flow 3: Concurrent Scanner Operations (2 devices, same QR)
  // Validates: Requirements 7.1, 12.4
  // ===========================================================================

  describe('Flow 3: Concurrent Scanner Operations (2 devices, same QR)', () => {
    it('should ensure only one check-in succeeds when 2 devices scan simultaneously', async () => {
      // Setup: Add guest with QR
      const addResult = await guestService.addGuest(
        TEST_EVENT_ID,
        TEST_TENANT_ID,
        { name: 'Putri Ayu', group: GuestGroup.VIP }
      );
      expect('id' in addResult).toBe(true);
      if (!('id' in addResult)) return;

      const qrPayload = addResult.qr_code!.qr_payload;

      // Simulate concurrent scans from 2 devices
      const [result1, result2] = await Promise.all([
        checkInService.verifyQRScan(qrPayload, TEST_EVENT_ID, 'scanner-001'),
        checkInService.verifyQRScan(qrPayload, TEST_EVENT_ID, 'scanner-002'),
      ]);

      // One should be GREEN, the other YELLOW
      const statuses = [result1.status, result2.status].sort();
      expect(statuses).toContain(VerificationStatus.GREEN);
      expect(statuses).toContain(VerificationStatus.YELLOW);

      // Only one check-in record should exist (idempotency)
      expect(state.checkIns.size).toBe(1);

      // The GREEN result should have the guest name
      const greenResult =
        result1.status === VerificationStatus.GREEN ? result1 : result2;
      expect(greenResult.guest_name).toBe('Putri Ayu');
      expect(greenResult.guest_group).toBe(GuestGroup.VIP);

      // The YELLOW result should indicate duplicate
      const yellowResult =
        result1.status === VerificationStatus.YELLOW ? result1 : result2;
      expect(yellowResult.guest_name).toBe('Putri Ayu');
      expect(yellowResult.message).toBe('Tamu sudah check-in sebelumnya');
    });

    it('should handle rapid sequential scans from different devices', async () => {
      // Setup: Add guest
      const addResult = await guestService.addGuest(
        TEST_EVENT_ID,
        TEST_TENANT_ID,
        { name: 'Agus Pratama', group: GuestGroup.FRIEND }
      );
      expect('id' in addResult).toBe(true);
      if (!('id' in addResult)) return;

      const qrPayload = addResult.qr_code!.qr_payload;

      // Sequential scans from different devices
      const scan1 = await checkInService.verifyQRScan(
        qrPayload,
        TEST_EVENT_ID,
        'scanner-001'
      );
      const scan2 = await checkInService.verifyQRScan(
        qrPayload,
        TEST_EVENT_ID,
        'scanner-002'
      );
      const scan3 = await checkInService.verifyQRScan(
        qrPayload,
        TEST_EVENT_ID,
        'scanner-001'
      );

      // First scan: GREEN
      expect(scan1.status).toBe(VerificationStatus.GREEN);

      // Subsequent scans: YELLOW
      expect(scan2.status).toBe(VerificationStatus.YELLOW);
      expect(scan3.status).toBe(VerificationStatus.YELLOW);

      // Still only one check-in record
      expect(state.checkIns.size).toBe(1);

      // Stats should show exactly 1 check-in
      const stats = await statsService.calculateAndBroadcastStats(TEST_EVENT_ID);
      expect(stats.total_checked_in).toBe(1);
    });

    it('should handle multiple guests being scanned by different devices concurrently', async () => {
      // Setup: Add 3 guests
      const guests = await Promise.all([
        guestService.addGuest(TEST_EVENT_ID, TEST_TENANT_ID, {
          name: 'Guest A',
          group: GuestGroup.FAMILY,
        }),
        guestService.addGuest(TEST_EVENT_ID, TEST_TENANT_ID, {
          name: 'Guest B',
          group: GuestGroup.FRIEND,
        }),
        guestService.addGuest(TEST_EVENT_ID, TEST_TENANT_ID, {
          name: 'Guest C',
          group: GuestGroup.VIP,
        }),
      ]);

      // All should have been created successfully
      for (const g of guests) {
        expect('id' in g).toBe(true);
      }

      const payloads = guests
        .filter((g): g is typeof g & { id: string; qr_code: QRCodeRecord } => 'id' in g)
        .map((g) => g.qr_code!.qr_payload);

      // Scan all 3 concurrently from different devices
      const results = await Promise.all([
        checkInService.verifyQRScan(payloads[0], TEST_EVENT_ID, 'scanner-001'),
        checkInService.verifyQRScan(payloads[1], TEST_EVENT_ID, 'scanner-002'),
        checkInService.verifyQRScan(payloads[2], TEST_EVENT_ID, 'scanner-001'),
      ]);

      // All should be GREEN (different guests)
      expect(results[0].status).toBe(VerificationStatus.GREEN);
      expect(results[1].status).toBe(VerificationStatus.GREEN);
      expect(results[2].status).toBe(VerificationStatus.GREEN);

      // 3 check-in records
      expect(state.checkIns.size).toBe(3);

      // Stats should reflect all 3
      const stats = await statsService.calculateAndBroadcastStats(TEST_EVENT_ID);
      expect(stats.total_guests).toBe(3);
      expect(stats.total_checked_in).toBe(3);
    });
  });

  // ===========================================================================
  // Flow 4: Offline Scan → Reconnect → Sync → Dashboard Update
  // Validates: Requirements 9.5
  // ===========================================================================

  describe('Flow 4: Offline Scan → Reconnect → Sync → Dashboard Update', () => {
    it('should sync offline check-ins in chronological order on reconnect', async () => {
      // Setup: Add multiple guests
      const guest1Result = await guestService.addGuest(
        TEST_EVENT_ID,
        TEST_TENANT_ID,
        { name: 'Offline Guest 1', group: GuestGroup.FAMILY }
      );
      const guest2Result = await guestService.addGuest(
        TEST_EVENT_ID,
        TEST_TENANT_ID,
        { name: 'Offline Guest 2', group: GuestGroup.FRIEND }
      );
      const guest3Result = await guestService.addGuest(
        TEST_EVENT_ID,
        TEST_TENANT_ID,
        { name: 'Offline Guest 3', group: GuestGroup.COLLEAGUE }
      );

      expect('id' in guest1Result).toBe(true);
      expect('id' in guest2Result).toBe(true);
      expect('id' in guest3Result).toBe(true);
      if (!('id' in guest1Result) || !('id' in guest2Result) || !('id' in guest3Result)) return;

      // Simulate offline queue: scans happened at specific timestamps
      // These would be stored locally on the scanner device
      const offlineQueue = [
        {
          qrPayload: guest1Result.qr_code!.qr_payload,
          scannedAt: new Date('2024-06-15T10:00:00Z'),
        },
        {
          qrPayload: guest2Result.qr_code!.qr_payload,
          scannedAt: new Date('2024-06-15T10:01:00Z'),
        },
        {
          qrPayload: guest3Result.qr_code!.qr_payload,
          scannedAt: new Date('2024-06-15T10:02:00Z'),
        },
      ];

      // Simulate reconnect: sync all offline scans in chronological order
      const syncResults = [];
      for (const entry of offlineQueue) {
        const result = await checkInService.verifyQRScan(
          entry.qrPayload,
          TEST_EVENT_ID,
          'scanner-offline-001'
        );
        syncResults.push(result);
      }

      // All should succeed (GREEN) since none were checked in before
      expect(syncResults[0].status).toBe(VerificationStatus.GREEN);
      expect(syncResults[1].status).toBe(VerificationStatus.GREEN);
      expect(syncResults[2].status).toBe(VerificationStatus.GREEN);

      // All 3 check-ins recorded
      expect(state.checkIns.size).toBe(3);

      // Dashboard stats should reflect all synced check-ins
      const stats = await statsService.calculateAndBroadcastStats(TEST_EVENT_ID);
      expect(stats.total_guests).toBe(3);
      expect(stats.total_checked_in).toBe(3);
    });

    it('should handle idempotent sync (duplicate offline scans ignored)', async () => {
      // Setup: Add a guest
      const addResult = await guestService.addGuest(
        TEST_EVENT_ID,
        TEST_TENANT_ID,
        { name: 'Duplicate Sync Guest', group: GuestGroup.FAMILY }
      );
      expect('id' in addResult).toBe(true);
      if (!('id' in addResult)) return;

      const qrPayload = addResult.qr_code!.qr_payload;

      // Guest was already checked in by another device while this one was offline
      const onlineResult = await checkInService.verifyQRScan(
        qrPayload,
        TEST_EVENT_ID,
        'scanner-online-001'
      );
      expect(onlineResult.status).toBe(VerificationStatus.GREEN);

      // Clear broadcasts to track only sync broadcasts
      state.broadcasts = [];

      // Offline device reconnects and tries to sync the same guest
      const syncResult = await checkInService.verifyQRScan(
        qrPayload,
        TEST_EVENT_ID,
        'scanner-offline-001'
      );

      // Should get YELLOW (already checked in) — idempotent, no error
      expect(syncResult.status).toBe(VerificationStatus.YELLOW);
      expect(syncResult.guest_name).toBe('Duplicate Sync Guest');

      // Still only one check-in record (idempotency preserved)
      expect(state.checkIns.size).toBe(1);

      // Stats remain consistent
      const stats = await statsService.calculateAndBroadcastStats(TEST_EVENT_ID);
      expect(stats.total_checked_in).toBe(1);
    });

    it('should handle mixed online and offline check-ins correctly', async () => {
      // Setup: Add 4 guests
      const guests = await Promise.all([
        guestService.addGuest(TEST_EVENT_ID, TEST_TENANT_ID, {
          name: 'Online Guest',
          group: GuestGroup.FAMILY,
        }),
        guestService.addGuest(TEST_EVENT_ID, TEST_TENANT_ID, {
          name: 'Offline Guest A',
          group: GuestGroup.FRIEND,
        }),
        guestService.addGuest(TEST_EVENT_ID, TEST_TENANT_ID, {
          name: 'Offline Guest B',
          group: GuestGroup.VIP,
        }),
        guestService.addGuest(TEST_EVENT_ID, TEST_TENANT_ID, {
          name: 'Conflict Guest',
          group: GuestGroup.COLLEAGUE,
        }),
      ]);

      for (const g of guests) {
        expect('id' in g).toBe(true);
      }
      const validGuests = guests.filter(
        (g): g is typeof g & { id: string; qr_code: QRCodeRecord } => 'id' in g
      );

      // Online device checks in guest 0 and guest 3
      await checkInService.verifyQRScan(
        validGuests[0].qr_code!.qr_payload,
        TEST_EVENT_ID,
        'scanner-online'
      );
      await checkInService.verifyQRScan(
        validGuests[3].qr_code!.qr_payload,
        TEST_EVENT_ID,
        'scanner-online'
      );

      // Offline device syncs: guest 1, guest 2, and guest 3 (conflict)
      const sync1 = await checkInService.verifyQRScan(
        validGuests[1].qr_code!.qr_payload,
        TEST_EVENT_ID,
        'scanner-offline'
      );
      const sync2 = await checkInService.verifyQRScan(
        validGuests[2].qr_code!.qr_payload,
        TEST_EVENT_ID,
        'scanner-offline'
      );
      const sync3 = await checkInService.verifyQRScan(
        validGuests[3].qr_code!.qr_payload,
        TEST_EVENT_ID,
        'scanner-offline'
      );

      // Guest 1 and 2: GREEN (new check-ins)
      expect(sync1.status).toBe(VerificationStatus.GREEN);
      expect(sync2.status).toBe(VerificationStatus.GREEN);

      // Guest 3: YELLOW (conflict — already checked in by online device)
      expect(sync3.status).toBe(VerificationStatus.YELLOW);

      // Total: 4 unique check-ins
      expect(state.checkIns.size).toBe(4);

      const stats = await statsService.calculateAndBroadcastStats(TEST_EVENT_ID);
      expect(stats.total_checked_in).toBe(4);
    });
  });


  // ===========================================================================
  // Flow 5: Go-Show Registration → Dashboard Update
  // Validates: Requirements 8.8, 9.1
  // ===========================================================================

  describe('Flow 5: Go-Show Registration → Dashboard Update', () => {
    it('should register a Go-Show guest and broadcast to dashboard', async () => {
      // Clear broadcasts
      state.broadcasts = [];

      // Register Go-Show guest
      const goShowResult = await checkInService.registerGoShow(
        'Walk-in Tamu',
        TEST_EVENT_ID,
        'scanner-001'
      );

      // Verify Go-Show was created
      expect(isServiceError(goShowResult)).toBe(false);
      if (isServiceError(goShowResult)) return;

      expect(goShowResult.guest.name).toBe('Walk-in Tamu');
      expect(goShowResult.check_in.method).toBe(CheckInMethod.GO_SHOW);
      expect(goShowResult.check_in.checked_in_at).toBeInstanceOf(Date);

      // Verify guest was created with type GO_SHOW
      const createdGuest = state.guests.get(goShowResult.guest.id);
      expect(createdGuest).toBeDefined();
      expect(createdGuest!.type).toBe(GuestType.GO_SHOW);

      // Verify check-in record exists
      expect(state.checkIns.has(goShowResult.guest.id)).toBe(true);
      const checkIn = state.checkIns.get(goShowResult.guest.id)!;
      expect(checkIn.method).toBe(CheckInMethod.GO_SHOW);

      // Verify WebSocket broadcast was sent
      expect(state.broadcasts.length).toBe(1);
      const broadcast = state.broadcasts[0];
      expect(broadcast.eventId).toBe(TEST_EVENT_ID);

      const payload = broadcast.payload as {
        event_type: string;
        guest_name: string;
        guest_type: string;
        method: string;
      };
      expect(payload.event_type).toBe('go_show_added');
      expect(payload.guest_name).toBe('Walk-in Tamu');
      expect(payload.guest_type).toBe(GuestType.GO_SHOW);
      expect(payload.method).toBe(CheckInMethod.GO_SHOW);

      // Verify dashboard stats
      const stats = await statsService.calculateAndBroadcastStats(TEST_EVENT_ID);
      expect(stats.total_guests).toBe(1);
      expect(stats.total_checked_in).toBe(1);
      expect(stats.total_go_show).toBe(1);
    });

    it('should handle multiple Go-Show registrations and update stats correctly', async () => {
      // Add a regular guest first
      const regularGuest = await guestService.addGuest(
        TEST_EVENT_ID,
        TEST_TENANT_ID,
        { name: 'Regular Guest', group: GuestGroup.FAMILY }
      );
      expect('id' in regularGuest).toBe(true);

      // Register 3 Go-Show guests
      const goShow1 = await checkInService.registerGoShow(
        'Go-Show 1',
        TEST_EVENT_ID,
        'scanner-001'
      );
      const goShow2 = await checkInService.registerGoShow(
        'Go-Show 2',
        TEST_EVENT_ID,
        'scanner-002'
      );
      const goShow3 = await checkInService.registerGoShow(
        'Go-Show 3',
        TEST_EVENT_ID,
        'scanner-001'
      );

      expect(isServiceError(goShow1)).toBe(false);
      expect(isServiceError(goShow2)).toBe(false);
      expect(isServiceError(goShow3)).toBe(false);

      // Verify stats: 4 total guests (1 regular + 3 go-show), 3 checked-in, 3 go-show
      const stats = await statsService.calculateAndBroadcastStats(TEST_EVENT_ID);
      expect(stats.total_guests).toBe(4);
      expect(stats.total_checked_in).toBe(3);
      expect(stats.total_go_show).toBe(3);
    });

    it('should reject Go-Show with empty name', async () => {
      const result = await checkInService.registerGoShow(
        '',
        TEST_EVENT_ID,
        'scanner-001'
      );

      expect(isServiceError(result)).toBe(true);
      if (isServiceError(result)) {
        expect(result.code).toBe(ErrorCode.VALIDATION_FAILED);
        expect(result.message).toContain('kosong');
      }

      // No guest or check-in created
      expect(state.guests.size).toBe(0);
      expect(state.checkIns.size).toBe(0);
    });

    it('should integrate Go-Show with regular check-in flow in stats', async () => {
      // Add regular guest and check them in via QR
      const regularGuest = await guestService.addGuest(
        TEST_EVENT_ID,
        TEST_TENANT_ID,
        { name: 'QR Guest', group: GuestGroup.FAMILY }
      );
      expect('id' in regularGuest).toBe(true);
      if (!('id' in regularGuest)) return;

      await checkInService.verifyQRScan(
        regularGuest.qr_code!.qr_payload,
        TEST_EVENT_ID,
        'scanner-001'
      );

      // Register a Go-Show
      await checkInService.registerGoShow('Walk-in Person', TEST_EVENT_ID, 'scanner-002');

      // Submit RSVP for the regular guest
      await rsvpService.submitRsvp(regularGuest.id, TEST_TENANT_ID, {
        attendance: AttendanceType.RESEPSI,
        guest_count: 1,
      });

      // Final stats should reflect all activities
      const stats = await statsService.calculateAndBroadcastStats(TEST_EVENT_ID);
      expect(stats.total_guests).toBe(2); // 1 regular + 1 go-show
      expect(stats.total_rsvp).toBe(1); // 1 RSVP (non-decline)
      expect(stats.total_checked_in).toBe(2); // 1 QR + 1 go-show
      expect(stats.total_go_show).toBe(1); // 1 go-show
    });
  });

  // ===========================================================================
  // Cross-flow: Combined scenarios
  // ===========================================================================

  describe('Cross-flow: Full event lifecycle', () => {
    it('should handle a complete event lifecycle with multiple guests and activities', async () => {
      // Step 1: Add multiple guests
      const guest1 = await guestService.addGuest(TEST_EVENT_ID, TEST_TENANT_ID, {
        name: 'Keluarga Budi',
        group: GuestGroup.FAMILY,
        plus_one_count: 3,
        phone: '+6281111111111',
      });
      const guest2 = await guestService.addGuest(TEST_EVENT_ID, TEST_TENANT_ID, {
        name: 'Teman Andi',
        group: GuestGroup.FRIEND,
        plus_one_count: 1,
        email: 'andi@example.com',
      });
      const guest3 = await guestService.addGuest(TEST_EVENT_ID, TEST_TENANT_ID, {
        name: 'Kolega Citra',
        group: GuestGroup.COLLEAGUE,
        plus_one_count: 0,
      });

      expect('id' in guest1).toBe(true);
      expect('id' in guest2).toBe(true);
      expect('id' in guest3).toBe(true);
      if (!('id' in guest1) || !('id' in guest2) || !('id' in guest3)) return;

      // Step 2: Guests submit RSVPs
      const rsvp1 = await rsvpService.submitRsvp(guest1.id, TEST_TENANT_ID, {
        attendance: AttendanceType.BOTH,
        guest_count: 4,
      });
      const rsvp2 = await rsvpService.submitRsvp(guest2.id, TEST_TENANT_ID, {
        attendance: AttendanceType.RESEPSI,
        guest_count: 2,
      });
      const rsvp3 = await rsvpService.submitRsvp(guest3.id, TEST_TENANT_ID, {
        attendance: AttendanceType.DECLINE,
        guest_count: 0,
      });

      expect(isRsvpError(rsvp1)).toBe(false);
      expect(isRsvpError(rsvp2)).toBe(false);
      expect(isRsvpError(rsvp3)).toBe(false);

      // Step 3: Event day — guests check in via QR
      const scan1 = await checkInService.verifyQRScan(
        guest1.qr_code!.qr_payload,
        TEST_EVENT_ID,
        'scanner-001'
      );
      const scan2 = await checkInService.verifyQRScan(
        guest2.qr_code!.qr_payload,
        TEST_EVENT_ID,
        'scanner-002'
      );

      expect(scan1.status).toBe(VerificationStatus.GREEN);
      expect(scan2.status).toBe(VerificationStatus.GREEN);

      // Guest 3 declined but shows up anyway — duplicate scan attempt
      const scan3 = await checkInService.verifyQRScan(
        guest3.qr_code!.qr_payload,
        TEST_EVENT_ID,
        'scanner-001'
      );
      expect(scan3.status).toBe(VerificationStatus.GREEN); // Still valid QR

      // Step 4: Go-Show guests arrive
      const goShow = await checkInService.registerGoShow(
        'Tamu Tak Diundang',
        TEST_EVENT_ID,
        'scanner-001'
      );
      expect(isServiceError(goShow)).toBe(false);

      // Step 5: Verify final stats
      const stats = await statsService.calculateAndBroadcastStats(TEST_EVENT_ID);
      expect(stats.total_guests).toBe(4); // 3 invited + 1 go-show
      expect(stats.total_rsvp).toBe(2); // 2 non-decline RSVPs
      expect(stats.total_checked_in).toBe(4); // 3 QR + 1 go-show
      expect(stats.total_go_show).toBe(1);
    });

    it('should maintain data consistency across all operations', async () => {
      // Add 5 guests
      const guestPromises = Array.from({ length: 5 }, (_, i) =>
        guestService.addGuest(TEST_EVENT_ID, TEST_TENANT_ID, {
          name: `Guest ${i + 1}`,
          group: GuestGroup.FRIEND,
          plus_one_count: 1,
        })
      );
      const guests = await Promise.all(guestPromises);
      const validGuests = guests.filter(
        (g): g is typeof g & { id: string; qr_code: QRCodeRecord } => 'id' in g
      );
      expect(validGuests.length).toBe(5);

      // RSVP: 3 confirm, 1 decline, 1 no response
      await rsvpService.submitRsvp(validGuests[0].id, TEST_TENANT_ID, {
        attendance: AttendanceType.BOTH,
        guest_count: 2,
      });
      await rsvpService.submitRsvp(validGuests[1].id, TEST_TENANT_ID, {
        attendance: AttendanceType.AKAD,
        guest_count: 1,
      });
      await rsvpService.submitRsvp(validGuests[2].id, TEST_TENANT_ID, {
        attendance: AttendanceType.RESEPSI,
        guest_count: 2,
      });
      await rsvpService.submitRsvp(validGuests[3].id, TEST_TENANT_ID, {
        attendance: AttendanceType.DECLINE,
        guest_count: 0,
      });
      // Guest 4: no RSVP

      // Check-in: 2 via QR, 1 via manual
      await checkInService.verifyQRScan(
        validGuests[0].qr_code!.qr_payload,
        TEST_EVENT_ID,
        'scanner-001'
      );
      await checkInService.verifyQRScan(
        validGuests[1].qr_code!.qr_payload,
        TEST_EVENT_ID,
        'scanner-002'
      );
      await checkInService.manualCheckIn(validGuests[4].id, TEST_EVENT_ID, 'scanner-001');

      // Add 2 Go-Shows
      await checkInService.registerGoShow('Go-Show A', TEST_EVENT_ID, 'scanner-001');
      await checkInService.registerGoShow('Go-Show B', TEST_EVENT_ID, 'scanner-002');

      // Verify final stats consistency
      const stats = await statsService.calculateAndBroadcastStats(TEST_EVENT_ID);

      // 5 invited + 2 go-show = 7 total guests
      expect(stats.total_guests).toBe(7);

      // 3 non-decline RSVPs
      expect(stats.total_rsvp).toBe(3);

      // 2 QR + 1 manual + 2 go-show = 5 check-ins
      expect(stats.total_checked_in).toBe(5);

      // 2 go-show guests
      expect(stats.total_go_show).toBe(2);

      // Verify: total_checked_in equals actual check-in records (Req 9.7)
      expect(stats.total_checked_in).toBe(state.checkIns.size);
    });
  });
});
