import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import fc from 'fast-check';
import {
  createRealtimeServer,
  RealtimeEvent,
  RealtimeServer,
  GuestCheckedInPayload,
} from './index';

// --- Helpers ---

function createClientSocket(port: number): ClientSocket {
  return ioClient(`http://localhost:${port}`, {
    transports: ['websocket'],
    autoConnect: false,
  });
}

function waitForEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timeout waiting for event: ${event}`)),
      5000
    );
    socket.once(event, (data: T) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Arbitraries ---

/**
 * Generates a pair of distinct event IDs to represent two different event rooms.
 * Uses alphanumeric strings to avoid issues with special characters in room names.
 */
const arbDistinctEventIds = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]{4,20}$/),
    fc.stringMatching(/^[a-z0-9]{4,20}$/)
  )
  .filter(([e1, e2]) => e1 !== e2);

/** Generates a valid guest name */
const arbGuestName = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

/** Generates a guest group */
const arbGuestGroup = fc.constantFrom('family', 'friend', 'colleague', 'vip');

/** Generates a check-in method */
const arbCheckInMethod = fc.constantFrom('qr_scan', 'manual', 'go_show');

// --- Property Tests ---

describe('Property 14: WebSocket Room Isolation', () => {
  let server: RealtimeServer;
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  let clients: ClientSocket[];

  beforeAll(async () => {
    httpServer = createServer();
    server = createRealtimeServer({ httpServer });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });

    clients = [];
  });

  afterEach(async () => {
    for (const client of clients) {
      if (client.connected) {
        client.disconnect();
      }
    }
    clients = [];
    await waitFor(50);
  });

  afterAll(async () => {
    await server.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  /**
   * **Validates: Requirement 9.3**
   *
   * For any two events E1 and E2 with connected clients, a broadcast to event E1's room
   * SHALL only be received by clients connected to E1's room, and clients connected to
   * E2's room SHALL NOT receive the broadcast.
   */
  it('broadcasts to event E1 room are received ONLY by E1 clients, never by E2 clients', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDistinctEventIds,
        arbGuestName,
        arbGuestGroup,
        arbCheckInMethod,
        async ([eventId1, eventId2], guestName, group, method) => {
          // Create two clients: one for E1, one for E2
          const clientE1 = createClientSocket(port);
          const clientE2 = createClientSocket(port);
          clients.push(clientE1, clientE2);

          // Connect and join respective rooms
          clientE1.connect();
          await waitForEvent(clientE1, 'connection_status');
          clientE1.emit('join_event', eventId1);
          await waitForEvent(clientE1, 'joined_event');

          clientE2.connect();
          await waitForEvent(clientE2, 'connection_status');
          clientE2.emit('join_event', eventId2);
          await waitForEvent(clientE2, 'joined_event');

          // Track whether E2 client receives the broadcast (it should NOT)
          let e2Received = false;
          clientE2.on(RealtimeEvent.GUEST_CHECKED_IN, () => {
            e2Received = true;
          });

          // Broadcast a check-in event to E1's room
          const payload: GuestCheckedInPayload = {
            guest_id: `guest-${eventId1}`,
            guest_name: guestName,
            group,
            method,
            checked_in_at: new Date().toISOString(),
            event_id: eventId1,
          };

          const e1ReceivePromise = waitForEvent<GuestCheckedInPayload>(
            clientE1,
            RealtimeEvent.GUEST_CHECKED_IN
          );

          server.broadcastCheckIn(eventId1, payload);

          // E1 client MUST receive the broadcast
          const received = await e1ReceivePromise;
          expect(received.event_id).toBe(eventId1);
          expect(received.guest_name).toBe(guestName);
          expect(received.group).toBe(group);
          expect(received.method).toBe(method);

          // Wait to ensure E2 does NOT receive it
          await waitFor(100);
          expect(e2Received).toBe(false);

          // Cleanup for next iteration
          clientE1.disconnect();
          clientE2.disconnect();
          clients = clients.filter((c) => c !== clientE1 && c !== clientE2);
          await waitFor(50);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * **Validates: Requirement 9.3**
   *
   * Symmetric property: broadcasting to E2's room should also be isolated from E1 clients.
   * This ensures room isolation works in both directions.
   */
  it('broadcasts to event E2 room are NOT received by E1 clients (symmetric isolation)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbDistinctEventIds,
        arbGuestName,
        arbGuestGroup,
        async ([eventId1, eventId2], guestName, group) => {
          const clientE1 = createClientSocket(port);
          const clientE2 = createClientSocket(port);
          clients.push(clientE1, clientE2);

          // Connect and join respective rooms
          clientE1.connect();
          await waitForEvent(clientE1, 'connection_status');
          clientE1.emit('join_event', eventId1);
          await waitForEvent(clientE1, 'joined_event');

          clientE2.connect();
          await waitForEvent(clientE2, 'connection_status');
          clientE2.emit('join_event', eventId2);
          await waitForEvent(clientE2, 'joined_event');

          // Track whether E1 client receives the broadcast (it should NOT)
          let e1Received = false;
          clientE1.on(RealtimeEvent.GUEST_CHECKED_IN, () => {
            e1Received = true;
          });

          // Broadcast to E2's room
          const payload: GuestCheckedInPayload = {
            guest_id: `guest-${eventId2}`,
            guest_name: guestName,
            group,
            method: 'qr_scan',
            checked_in_at: new Date().toISOString(),
            event_id: eventId2,
          };

          const e2ReceivePromise = waitForEvent<GuestCheckedInPayload>(
            clientE2,
            RealtimeEvent.GUEST_CHECKED_IN
          );

          server.broadcastCheckIn(eventId2, payload);

          // E2 client MUST receive the broadcast
          const received = await e2ReceivePromise;
          expect(received.event_id).toBe(eventId2);
          expect(received.guest_name).toBe(guestName);

          // Wait to ensure E1 does NOT receive it
          await waitFor(100);
          expect(e1Received).toBe(false);

          // Cleanup
          clientE1.disconnect();
          clientE2.disconnect();
          clients = clients.filter((c) => c !== clientE1 && c !== clientE2);
          await waitFor(50);
        }
      ),
      { numRuns: 20 }
    );
  });
});
