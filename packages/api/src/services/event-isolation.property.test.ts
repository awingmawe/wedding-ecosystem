import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  GuestGroup,
  GuestType,
  AttendanceType,
  CheckInMethod,
  DeliveryStatus,
  ErrorCode,
} from '@wedding/shared';
import {
  GuestService,
  GuestRepository,
  GuestRecord,
  QRCodeRecord,
  PaginatedGuestList,
  GuestFilterOptions,
} from './guest.service';
import {
  RsvpService,
  RsvpRepository,
  RsvpRecord,
  GuestForRsvp,
  RsvpBroadcaster,
} from './rsvp.service';
import {
  CheckInService,
  CheckInRepository,
  CheckInRecord,
  GuestInfo,
  QRCodeInfo,
  GuestSearchResult,
  RedisClient,
  CheckInBroadcaster,
} from './checkin.service';

// --- Constants ---

const TEST_ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes in hex for AES-256

// --- Arbitraries ---

/** Generates a UUID-like event ID */
const arbEventId = fc.uuid();

/** Generates a UUID-like tenant ID */
const arbTenantId = fc.uuid();

/** Generates a valid guest name */
const arbGuestName = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.replace(/[^a-zA-Z0-9\s]/g, 'a').trim() || 'Guest');

/** Generates a valid guest group */
const arbGuestGroup = fc.constantFrom(
  GuestGroup.FAMILY,
  GuestGroup.FRIEND,
  GuestGroup.COLLEAGUE,
  GuestGroup.VIP
);

/** Generates a valid attendance type (non-decline) */
const arbAttendance = fc.constantFrom(
  AttendanceType.AKAD,
  AttendanceType.RESEPSI,
  AttendanceType.BOTH
);

// --- Test Helpers ---

/**
 * Creates a mock GuestRepository that stores guests per event,
 * ensuring findGuestsByEvent only returns guests for the queried event.
 */
function createMockGuestRepository(): GuestRepository & {
  guests: Map<string, GuestRecord[]>;
} {
  const guests = new Map<string, GuestRecord[]>();
  const slugs = new Set<string>();
  const qrPayloads = new Set<string>();

  return {
    guests,

    createGuest: async (data) => {
      const guest: GuestRecord = {
        id: data.id,
        event_id: data.event_id,
        tenant_id: data.tenant_id,
        name: data.name,
        slug: data.slug,
        phone: data.phone,
        email: data.email,
        group: data.group,
        type: data.type,
        plus_one_count: data.plus_one_count,
        invitation_url: data.invitation_url,
        delivery_status: data.delivery_status,
        created_at: new Date(),
      };
      const eventGuests = guests.get(data.event_id) || [];
      eventGuests.push(guest);
      guests.set(data.event_id, eventGuests);
      return guest;
    },

    createQRCode: async (data) => {
      qrPayloads.add(data.qr_payload);
      return {
        id: data.id,
        guest_id: data.guest_id,
        qr_payload: data.qr_payload,
        qr_image_url: null,
        is_active: data.is_active,
        generated_at: new Date(),
      };
    },

    findGuestById: async (guestId, tenantId) => {
      for (const eventGuests of guests.values()) {
        const found = eventGuests.find(
          (g) => g.id === guestId && g.tenant_id === tenantId
        );
        if (found) return found;
      }
      return null;
    },

    findGuestBySlug: async (eventId, slug) => {
      const eventGuests = guests.get(eventId) || [];
      return eventGuests.find((g) => g.slug === slug) || null;
    },

    findGuestsByEvent: async (eventId, tenantId, pagination, _filters?) => {
      // This is the key isolation point: only return guests for the specific event
      const eventGuests = (guests.get(eventId) || []).filter(
        (g) => g.tenant_id === tenantId
      );
      const page = pagination.page ?? 1;
      const perPage = pagination.per_page ?? 50;
      const start = (page - 1) * perPage;
      const data = eventGuests.slice(start, start + perPage).map((g) => ({
        id: g.id,
        event_id: g.event_id,
        name: g.name,
        slug: g.slug,
        group: g.group,
        type: g.type,
        phone: g.phone,
        email: g.email,
        plus_one_count: g.plus_one_count,
        rsvp_status: null,
        check_in_status: null,
        delivery_status: g.delivery_status,
      }));
      return {
        data,
        pagination: {
          page,
          per_page: perPage,
          total: eventGuests.length,
          total_pages: Math.ceil(eventGuests.length / perPage),
        },
      };
    },

    updateGuest: async () => null,
    deleteGuest: async () => true,
    deactivateQRCode: async () => true,
    findQRCodeByGuestId: async () => null,

    checkSlugExists: async (eventId: string, slug: string) => {
      if (slugs.has(`${eventId}:${slug}`)) {
        return true;
      }
      slugs.add(`${eventId}:${slug}`);
      return false;
    },

    checkQRPayloadExists: async (payload: string) => {
      return qrPayloads.has(payload);
    },

    findEventById: async (eventId: string) => ({
      id: eventId,
      slug: `event-${eventId.slice(0, 8)}`,
    }),
  };
}

/**
 * Creates a mock RsvpRepository that stores RSVPs per guest,
 * with guests scoped to events.
 */
function createMockRsvpRepository(
  guestsPerEvent: Map<string, GuestForRsvp[]>
): RsvpRepository & { rsvps: Map<string, RsvpRecord> } {
  const rsvps = new Map<string, RsvpRecord>();

  return {
    rsvps,

    findGuestById: async (guestId, tenantId) => {
      for (const eventGuests of guestsPerEvent.values()) {
        const found = eventGuests.find(
          (g) => g.id === guestId && g.tenant_id === tenantId
        );
        if (found) return found;
      }
      return null;
    },

    findRsvpByGuestId: async (guestId) => {
      return rsvps.get(guestId) || null;
    },

    createRsvp: async (data) => {
      const rsvp: RsvpRecord = {
        id: data.id,
        guest_id: data.guest_id,
        attendance: data.attendance,
        guest_count: data.guest_count,
        submitted_at: new Date(),
      };
      rsvps.set(data.guest_id, rsvp);
      return rsvp;
    },

    updateRsvp: async (rsvpId, data) => {
      for (const [guestId, rsvp] of rsvps.entries()) {
        if (rsvp.id === rsvpId) {
          const updated: RsvpRecord = {
            ...rsvp,
            attendance: data.attendance,
            guest_count: data.guest_count,
            submitted_at: new Date(),
          };
          rsvps.set(guestId, updated);
          return updated;
        }
      }
      throw new Error('RSVP not found');
    },
  };
}

/**
 * Creates a mock CheckInRepository that stores check-ins per guest,
 * with guest search scoped to events.
 */
function createMockCheckInRepository(
  guestsPerEvent: Map<string, GuestInfo[]>
): CheckInRepository & { checkIns: Map<string, CheckInRecord> } {
  const checkIns = new Map<string, CheckInRecord>();

  return {
    checkIns,

    findGuestById: async (guestId) => {
      for (const eventGuests of guestsPerEvent.values()) {
        const found = eventGuests.find((g) => g.id === guestId);
        if (found) return found;
      }
      return null;
    },

    findGuestByIdAndEvent: async (guestId, eventId) => {
      const eventGuests = guestsPerEvent.get(eventId) || [];
      return eventGuests.find((g) => g.id === guestId) || null;
    },

    findQRCodeByPayload: async () => null,

    findCheckInByGuestId: async (guestId) => {
      return checkIns.get(guestId) || null;
    },

    createCheckIn: async (data) => {
      const checkIn: CheckInRecord = {
        id: data.id,
        guest_id: data.guest_id,
        scanner_device_id: data.scanner_device_id,
        method: data.method,
        checked_in_at: data.checked_in_at,
      };
      checkIns.set(data.guest_id, checkIn);
      return checkIn;
    },

    searchGuestsByName: async (eventId, query, limit) => {
      // Key isolation: only search within the specified event
      const eventGuests = guestsPerEvent.get(eventId) || [];
      return eventGuests
        .filter((g) => g.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, limit)
        .map((g) => ({
          id: g.id,
          name: g.name,
          group: g.group,
          type: g.type,
          is_checked_in: checkIns.has(g.id),
          checked_in_at: checkIns.has(g.id) ? checkIns.get(g.id)!.checked_in_at : null,
        }));
    },

    createGoShowGuest: async (data) => ({
      id: data.id,
      event_id: data.event_id,
      tenant_id: data.tenant_id,
      name: data.name,
      group: GuestGroup.FRIEND,
      type: GuestType.GO_SHOW,
    }),

    findEventById: async (eventId) => {
      if (guestsPerEvent.has(eventId)) {
        // Get tenant_id from first guest in the event
        const eventGuests = guestsPerEvent.get(eventId)!;
        return {
          id: eventId,
          tenant_id: eventGuests.length > 0 ? eventGuests[0].tenant_id : 'tenant-1',
        };
      }
      return null;
    },
  };
}

function createMockRedisClient(): RedisClient {
  const store = new Map<string, string>();
  return {
    set: async (key, value, _mode?, _duration?) => {
      store.set(key, value);
    },
    get: async (key) => store.get(key) || null,
  };
}

function createMockBroadcaster(): CheckInBroadcaster {
  return {
    broadcast: () => {},
  };
}

function createMockRsvpBroadcaster(): RsvpBroadcaster {
  return {
    broadcast: () => {},
  };
}

// --- Property Tests ---

describe('Property 2: Event Data Isolation Within Tenant', () => {
  /**
   * **Validates: Requirement 1.4**
   *
   * For any two events E1 and E2 within the same tenant, querying guests
   * for event E1 SHALL never return records belonging to event E2.
   */
  it('guest queries for one event never return guests from another event in the same tenant', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTenantId,
        arbEventId,
        arbEventId,
        fc.array(arbGuestName, { minLength: 1, maxLength: 10 }),
        fc.array(arbGuestName, { minLength: 1, maxLength: 10 }),
        arbGuestGroup,
        async (tenantId, eventId1, eventId2, namesE1, namesE2, group) => {
          // Ensure events are distinct
          fc.pre(eventId1 !== eventId2);

          const repository = createMockGuestRepository();
          const service = new GuestService({
            repository,
            encryptionKey: TEST_ENCRYPTION_KEY,
          });

          // Add guests to event 1
          for (const name of namesE1) {
            await service.addGuest(eventId1, tenantId, { name, group });
          }

          // Add guests to event 2
          for (const name of namesE2) {
            await service.addGuest(eventId2, tenantId, { name, group });
          }

          // Query guests for event 1
          const result1 = await service.listGuests(eventId1, tenantId, {
            page: 1,
            per_page: 50,
          });

          // Query guests for event 2
          const result2 = await service.listGuests(eventId2, tenantId, {
            page: 1,
            per_page: 50,
          });

          // Verify isolation: event 1 results only contain event 1 guests
          if ('data' in result1) {
            for (const guest of result1.data) {
              expect(guest.event_id).toBe(eventId1);
            }
          }

          // Verify isolation: event 2 results only contain event 2 guests
          if ('data' in result2) {
            for (const guest of result2.data) {
              expect(guest.event_id).toBe(eventId2);
            }
          }

          // Verify no overlap: guest IDs from event 1 should not appear in event 2 results
          if ('data' in result1 && 'data' in result2) {
            const event1GuestIds = new Set(result1.data.map((g) => g.id));
            const event2GuestIds = new Set(result2.data.map((g) => g.id));

            for (const id of event1GuestIds) {
              expect(event2GuestIds.has(id)).toBe(false);
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirement 1.4**
   *
   * For any two events E1 and E2 within the same tenant, searching guests
   * by name in event E1 SHALL never return guests belonging to event E2.
   */
  it('guest search within one event never returns guests from another event', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTenantId,
        arbEventId,
        arbEventId,
        async (tenantId, eventId1, eventId2) => {
          fc.pre(eventId1 !== eventId2);

          // Set up guests in two events with a shared name pattern
          const sharedName = 'SharedGuest';
          const guestsEvent1: GuestInfo[] = [
            {
              id: 'guest-e1-1',
              event_id: eventId1,
              tenant_id: tenantId,
              name: `${sharedName} Alpha`,
              group: GuestGroup.FAMILY,
              type: GuestType.INVITED,
            },
            {
              id: 'guest-e1-2',
              event_id: eventId1,
              tenant_id: tenantId,
              name: `${sharedName} Beta`,
              group: GuestGroup.FRIEND,
              type: GuestType.INVITED,
            },
          ];

          const guestsEvent2: GuestInfo[] = [
            {
              id: 'guest-e2-1',
              event_id: eventId2,
              tenant_id: tenantId,
              name: `${sharedName} Gamma`,
              group: GuestGroup.VIP,
              type: GuestType.INVITED,
            },
            {
              id: 'guest-e2-2',
              event_id: eventId2,
              tenant_id: tenantId,
              name: `${sharedName} Delta`,
              group: GuestGroup.COLLEAGUE,
              type: GuestType.INVITED,
            },
          ];

          const guestsPerEvent = new Map<string, GuestInfo[]>();
          guestsPerEvent.set(eventId1, guestsEvent1);
          guestsPerEvent.set(eventId2, guestsEvent2);

          const repository = createMockCheckInRepository(guestsPerEvent);
          const redisClient = createMockRedisClient();
          const broadcaster = createMockBroadcaster();

          const service = new CheckInService({
            repository,
            redis: redisClient,
            broadcaster,
            encryptionKey: TEST_ENCRYPTION_KEY,
          });

          // Search for "SharedGuest" in event 1
          const searchResult = await service.searchGuests(eventId1, 'SharedGuest');

          // All results must belong to event 1 only
          if (Array.isArray(searchResult)) {
            for (const result of searchResult) {
              // Verify the guest ID belongs to event 1
              const isInEvent1 = guestsEvent1.some((g) => g.id === result.id);
              const isInEvent2 = guestsEvent2.some((g) => g.id === result.id);
              expect(isInEvent1).toBe(true);
              expect(isInEvent2).toBe(false);
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirement 1.4**
   *
   * For any two events E1 and E2 within the same tenant, RSVP data
   * for guests in event E1 SHALL not be accessible when querying
   * through a guest belonging to event E2.
   */
  it('RSVP queries for guests in one event do not return data from another event', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTenantId,
        arbEventId,
        arbEventId,
        arbAttendance,
        async (tenantId, eventId1, eventId2, attendance) => {
          fc.pre(eventId1 !== eventId2);

          const guestE1: GuestForRsvp = {
            id: 'guest-e1-rsvp',
            event_id: eventId1,
            tenant_id: tenantId,
            name: 'Guest Event 1',
            plus_one_count: 2,
          };

          const guestE2: GuestForRsvp = {
            id: 'guest-e2-rsvp',
            event_id: eventId2,
            tenant_id: tenantId,
            name: 'Guest Event 2',
            plus_one_count: 3,
          };

          const guestsPerEvent = new Map<string, GuestForRsvp[]>();
          guestsPerEvent.set(eventId1, [guestE1]);
          guestsPerEvent.set(eventId2, [guestE2]);

          const repository = createMockRsvpRepository(guestsPerEvent);
          const broadcaster = createMockRsvpBroadcaster();

          const service = new RsvpService({ repository, broadcaster });

          // Submit RSVP for guest in event 1
          await service.submitRsvp(guestE1.id, tenantId, {
            attendance,
            guest_count: 1,
          });

          // Submit RSVP for guest in event 2
          await service.submitRsvp(guestE2.id, tenantId, {
            attendance,
            guest_count: 2,
          });

          // Query RSVP for guest in event 1
          const rsvp1 = await service.getRsvp(guestE1.id, tenantId);
          // Query RSVP for guest in event 2
          const rsvp2 = await service.getRsvp(guestE2.id, tenantId);

          // Verify isolation: RSVP for event 1 guest has event 1 guest's data
          if (rsvp1 && 'guest_id' in rsvp1) {
            expect(rsvp1.guest_id).toBe(guestE1.id);
            expect(rsvp1.guest_id).not.toBe(guestE2.id);
          }

          // Verify isolation: RSVP for event 2 guest has event 2 guest's data
          if (rsvp2 && 'guest_id' in rsvp2) {
            expect(rsvp2.guest_id).toBe(guestE2.id);
            expect(rsvp2.guest_id).not.toBe(guestE1.id);
          }

          // Verify: querying with event 2 guest ID should not return event 1 RSVP
          const crossQuery = await service.getRsvp(guestE2.id, tenantId);
          if (crossQuery && 'guest_id' in crossQuery) {
            expect(crossQuery.guest_count).toBe(2); // event 2's count, not event 1's
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirement 1.4**
   *
   * For any two events E1 and E2 within the same tenant, check-in records
   * for guests in event E1 SHALL not appear when querying check-in status
   * for guests in event E2.
   */
  it('check-in data for one event does not leak into another event within the same tenant', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTenantId,
        arbEventId,
        arbEventId,
        async (tenantId, eventId1, eventId2) => {
          fc.pre(eventId1 !== eventId2);

          const guestsEvent1: GuestInfo[] = [
            {
              id: 'guest-checkin-e1',
              event_id: eventId1,
              tenant_id: tenantId,
              name: 'CheckIn Guest E1',
              group: GuestGroup.FAMILY,
              type: GuestType.INVITED,
            },
          ];

          const guestsEvent2: GuestInfo[] = [
            {
              id: 'guest-checkin-e2',
              event_id: eventId2,
              tenant_id: tenantId,
              name: 'CheckIn Guest E2',
              group: GuestGroup.FRIEND,
              type: GuestType.INVITED,
            },
          ];

          const guestsPerEvent = new Map<string, GuestInfo[]>();
          guestsPerEvent.set(eventId1, guestsEvent1);
          guestsPerEvent.set(eventId2, guestsEvent2);

          const repository = createMockCheckInRepository(guestsPerEvent);
          const redisClient = createMockRedisClient();
          const broadcaster = createMockBroadcaster();

          const service = new CheckInService({
            repository,
            redis: redisClient,
            broadcaster,
            encryptionKey: TEST_ENCRYPTION_KEY,
          });

          // Perform manual check-in for guest in event 1
          // manualCheckIn signature: (guestId, eventId, scannerDeviceId?)
          const checkInResult = await service.manualCheckIn(
            'guest-checkin-e1',
            eventId1,
            null
          );

          // Verify check-in succeeded for event 1 guest
          expect('guest' in checkInResult || 'code' in checkInResult).toBe(true);
          if ('guest' in checkInResult) {
            expect(checkInResult.guest.name).toBe('CheckIn Guest E1');
          }

          // Search in event 2 should not show event 1's checked-in guest
          const searchInEvent2 = await service.searchGuests(eventId2, 'CheckIn');

          if (Array.isArray(searchInEvent2)) {
            // None of the results should be the event 1 guest
            for (const result of searchInEvent2) {
              expect(result.id).not.toBe('guest-checkin-e1');
            }

            // Only event 2 guests should appear
            for (const result of searchInEvent2) {
              const isInEvent2 = guestsEvent2.some((g) => g.id === result.id);
              expect(isInEvent2).toBe(true);
            }
          }

          // Verify check-in record isolation via repository
          const e1CheckIn = repository.checkIns.get('guest-checkin-e1');
          const e2CheckIn = repository.checkIns.get('guest-checkin-e2');

          // Event 1 guest should have a check-in record
          expect(e1CheckIn).toBeDefined();
          // Event 2 guest should NOT have a check-in record
          expect(e2CheckIn).toBeUndefined();
        }
      ),
      { numRuns: 50 }
    );
  });
});
