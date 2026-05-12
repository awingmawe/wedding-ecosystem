import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import {
  createRealtimeServer,
  getEventRoom,
  RealtimeEvent,
  RealtimeServer,
  GuestCheckedInPayload,
  RsvpUpdatedPayload,
  GoShowAddedPayload,
  StatsUpdatedPayload,
} from './index';

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createClientSocket(port: number): ClientSocket {
  return ioClient(`http://localhost:${port}`, {
    transports: ['websocket'],
    autoConnect: false,
  });
}

function waitForEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout waiting for event: ${event}`)), 3000);
    socket.once(event, (data: T) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
}

describe('getEventRoom', () => {
  it('should return room name prefixed with event:', () => {
    expect(getEventRoom('abc-123')).toBe('event:abc-123');
  });

  it('should handle different event IDs', () => {
    expect(getEventRoom('event-1')).toBe('event:event-1');
    expect(getEventRoom('event-2')).toBe('event:event-2');
    expect(getEventRoom('event-1')).not.toBe(getEventRoom('event-2'));
  });
});

describe('createRealtimeServer', () => {
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
    // Disconnect all clients
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

  describe('connection handling', () => {
    it('should emit connection_status on connect', async () => {
      const client = createClientSocket(port);
      clients.push(client);

      const statusPromise = waitForEvent<{ status: string }>(client, 'connection_status');
      client.connect();

      const status = await statusPromise;
      expect(status).toEqual({ status: 'connected' });
    });

    it('should allow client to join an event room', async () => {
      const client = createClientSocket(port);
      clients.push(client);

      client.connect();
      await waitForEvent(client, 'connection_status');

      const joinPromise = waitForEvent<{ event_id: string; status: string; connected_clients: number }>(
        client,
        'joined_event'
      );
      client.emit('join_event', 'event-123');

      const result = await joinPromise;
      expect(result.event_id).toBe('event-123');
      expect(result.status).toBe('connected');
      expect(result.connected_clients).toBe(1);
    });

    it('should track connection count per event', async () => {
      const client1 = createClientSocket(port);
      const client2 = createClientSocket(port);
      clients.push(client1, client2);

      client1.connect();
      await waitForEvent(client1, 'connection_status');
      client1.emit('join_event', 'event-456');
      await waitForEvent(client1, 'joined_event');

      client2.connect();
      await waitForEvent(client2, 'connection_status');

      const joinPromise = waitForEvent<{ connected_clients: number }>(client2, 'joined_event');
      client2.emit('join_event', 'event-456');
      const result = await joinPromise;

      expect(result.connected_clients).toBe(2);
      expect(server.getConnectionCount('event-456')).toBe(2);
    });

    it('should allow client to leave an event room', async () => {
      const client = createClientSocket(port);
      clients.push(client);

      client.connect();
      await waitForEvent(client, 'connection_status');
      client.emit('join_event', 'event-789');
      await waitForEvent(client, 'joined_event');

      expect(server.getConnectionCount('event-789')).toBe(1);

      const leavePromise = waitForEvent<{ event_id: string; status: string }>(client, 'left_event');
      client.emit('leave_event', 'event-789');
      const result = await leavePromise;

      expect(result.event_id).toBe('event-789');
      expect(result.status).toBe('disconnected');
      expect(server.getConnectionCount('event-789')).toBe(0);
    });

    it('should clean up connections on disconnect', async () => {
      const client = createClientSocket(port);
      clients.push(client);

      client.connect();
      await waitForEvent(client, 'connection_status');
      client.emit('join_event', 'event-cleanup');
      await waitForEvent(client, 'joined_event');

      expect(server.getConnectionCount('event-cleanup')).toBe(1);

      client.disconnect();
      await waitFor(100);

      expect(server.getConnectionCount('event-cleanup')).toBe(0);
    });

    it('should reject join_event with invalid event_id', async () => {
      const client = createClientSocket(port);
      clients.push(client);

      client.connect();
      await waitForEvent(client, 'connection_status');

      const errorPromise = waitForEvent<{ message: string }>(client, 'error');
      client.emit('join_event', '');

      const error = await errorPromise;
      expect(error.message).toBe('Invalid event_id');
    });
  });

  describe('room-based broadcasting', () => {
    it('should broadcast check-in event only to clients in the same event room', async () => {
      const client1 = createClientSocket(port);
      const client2 = createClientSocket(port);
      const client3 = createClientSocket(port);
      clients.push(client1, client2, client3);

      // client1 and client2 join event-A
      client1.connect();
      await waitForEvent(client1, 'connection_status');
      client1.emit('join_event', 'event-A');
      await waitForEvent(client1, 'joined_event');

      client2.connect();
      await waitForEvent(client2, 'connection_status');
      client2.emit('join_event', 'event-A');
      await waitForEvent(client2, 'joined_event');

      // client3 joins event-B (different room)
      client3.connect();
      await waitForEvent(client3, 'connection_status');
      client3.emit('join_event', 'event-B');
      await waitForEvent(client3, 'joined_event');

      // Set up listeners
      const payload: GuestCheckedInPayload = {
        guest_id: 'guest-1',
        guest_name: 'John Doe',
        group: 'family',
        method: 'qr_scan',
        checked_in_at: new Date().toISOString(),
        event_id: 'event-A',
      };

      const client1Promise = waitForEvent<GuestCheckedInPayload>(
        client1,
        RealtimeEvent.GUEST_CHECKED_IN
      );
      const client2Promise = waitForEvent<GuestCheckedInPayload>(
        client2,
        RealtimeEvent.GUEST_CHECKED_IN
      );

      let client3Received = false;
      client3.on(RealtimeEvent.GUEST_CHECKED_IN, () => {
        client3Received = true;
      });

      // Broadcast to event-A
      server.broadcastCheckIn('event-A', payload);

      // client1 and client2 should receive it
      const result1 = await client1Promise;
      const result2 = await client2Promise;
      expect(result1).toEqual(payload);
      expect(result2).toEqual(payload);

      // Wait a bit to ensure client3 doesn't receive it
      await waitFor(100);
      expect(client3Received).toBe(false);
    });

    it('should broadcast RSVP update to event room clients', async () => {
      const client = createClientSocket(port);
      clients.push(client);

      client.connect();
      await waitForEvent(client, 'connection_status');
      client.emit('join_event', 'event-rsvp');
      await waitForEvent(client, 'joined_event');

      const payload: RsvpUpdatedPayload = {
        guest_id: 'guest-2',
        guest_name: 'Jane Smith',
        attendance: 'both',
        guest_count: 2,
        submitted_at: new Date().toISOString(),
        event_id: 'event-rsvp',
      };

      const receivePromise = waitForEvent<RsvpUpdatedPayload>(
        client,
        RealtimeEvent.RSVP_UPDATED
      );

      server.broadcastRsvpUpdate('event-rsvp', payload);

      const result = await receivePromise;
      expect(result).toEqual(payload);
    });

    it('should broadcast Go-Show event to event room clients', async () => {
      const client = createClientSocket(port);
      clients.push(client);

      client.connect();
      await waitForEvent(client, 'connection_status');
      client.emit('join_event', 'event-goshow');
      await waitForEvent(client, 'joined_event');

      const payload: GoShowAddedPayload = {
        guest_id: 'guest-3',
        guest_name: 'Walk-in Guest',
        checked_in_at: new Date().toISOString(),
        event_id: 'event-goshow',
      };

      const receivePromise = waitForEvent<GoShowAddedPayload>(
        client,
        RealtimeEvent.GO_SHOW_ADDED
      );

      server.broadcastGoShow('event-goshow', payload);

      const result = await receivePromise;
      expect(result).toEqual(payload);
    });

    it('should broadcast stats update to event room clients', async () => {
      const client = createClientSocket(port);
      clients.push(client);

      client.connect();
      await waitForEvent(client, 'connection_status');
      client.emit('join_event', 'event-stats');
      await waitForEvent(client, 'joined_event');

      const payload: StatsUpdatedPayload = {
        event_id: 'event-stats',
        total_guests: 100,
        total_rsvp: 75,
        total_checked_in: 50,
        total_go_show: 5,
      };

      const receivePromise = waitForEvent<StatsUpdatedPayload>(
        client,
        RealtimeEvent.STATS_UPDATED
      );

      server.broadcastStats('event-stats', payload);

      const result = await receivePromise;
      expect(result).toEqual(payload);
    });
  });

  describe('broadcast latency', () => {
    it('should deliver broadcast within 500ms (Req 9.1, 9.2)', async () => {
      const client = createClientSocket(port);
      clients.push(client);

      client.connect();
      await waitForEvent(client, 'connection_status');
      client.emit('join_event', 'event-latency');
      await waitForEvent(client, 'joined_event');

      const payload: GuestCheckedInPayload = {
        guest_id: 'guest-latency',
        guest_name: 'Latency Test',
        group: 'friend',
        method: 'qr_scan',
        checked_in_at: new Date().toISOString(),
        event_id: 'event-latency',
      };

      const startTime = Date.now();
      const receivePromise = waitForEvent<GuestCheckedInPayload>(
        client,
        RealtimeEvent.GUEST_CHECKED_IN
      );

      server.broadcastCheckIn('event-latency', payload);

      await receivePromise;
      const latency = Date.now() - startTime;

      expect(latency).toBeLessThan(500);
    });
  });

  describe('connection status tracking (Req 9.8)', () => {
    it('should return 0 connections for unknown event', () => {
      expect(server.getConnectionCount('nonexistent-event')).toBe(0);
    });

    it('should accurately track multiple clients across different events', async () => {
      const client1 = createClientSocket(port);
      const client2 = createClientSocket(port);
      const client3 = createClientSocket(port);
      clients.push(client1, client2, client3);

      client1.connect();
      await waitForEvent(client1, 'connection_status');
      client1.emit('join_event', 'event-track-A');
      await waitForEvent(client1, 'joined_event');

      client2.connect();
      await waitForEvent(client2, 'connection_status');
      client2.emit('join_event', 'event-track-A');
      await waitForEvent(client2, 'joined_event');

      client3.connect();
      await waitForEvent(client3, 'connection_status');
      client3.emit('join_event', 'event-track-B');
      await waitForEvent(client3, 'joined_event');

      expect(server.getConnectionCount('event-track-A')).toBe(2);
      expect(server.getConnectionCount('event-track-B')).toBe(1);

      // Disconnect one client from event-track-A
      client1.disconnect();
      await waitFor(100);

      expect(server.getConnectionCount('event-track-A')).toBe(1);
      expect(server.getConnectionCount('event-track-B')).toBe(1);
    });
  });
});
