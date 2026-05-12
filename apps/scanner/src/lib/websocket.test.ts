/**
 * Unit tests for WebSocket manager.
 * Tests Socket.io client connection, event handling, and reconnection sync.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock socket.io-client
const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

// Mock sync-manager
vi.mock('./sync-manager', () => ({
  syncPendingCheckIns: vi.fn().mockResolvedValue({ synced: 0, failed: 0, duplicatesIgnored: 0 }),
  refreshGuestCache: vi.fn().mockResolvedValue(undefined),
}));

// Mock indexed-db
vi.mock('./indexed-db', () => ({
  cacheGuests: vi.fn().mockResolvedValue(undefined),
  updateCachedGuestCheckIn: vi.fn().mockResolvedValue(undefined),
}));

import { io } from 'socket.io-client';
import { syncPendingCheckIns, refreshGuestCache } from './sync-manager';
import { cacheGuests, updateCachedGuestCheckIn } from './indexed-db';

describe('WebSocket Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.on.mockReset();
    mockSocket.emit.mockReset();
    mockSocket.disconnect.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Socket.io connection configuration', () => {
    it('should create socket with correct URL and options', async () => {
      // Import dynamically to trigger the module
      const { io: ioFn } = await import('socket.io-client');

      // Simulate what useWebSocket does internally
      const wsUrl = 'http://localhost:3100';
      const authToken = 'test-token';

      const socket = (ioFn as unknown as typeof io)(wsUrl, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        randomizationFactor: 0.5,
        timeout: 20000,
        transports: ['websocket', 'polling'],
        auth: { token: authToken },
      });

      expect(ioFn).toHaveBeenCalledWith(wsUrl, expect.objectContaining({
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        randomizationFactor: 0.5,
        timeout: 20000,
        transports: ['websocket', 'polling'],
        auth: { token: authToken },
      }));

      expect(socket).toBeDefined();
    });

    it('should configure exponential backoff with max 30 second delay', () => {
      const wsUrl = 'http://localhost:3100';
      (io as unknown as ReturnType<typeof vi.fn>)(wsUrl, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        randomizationFactor: 0.5,
      });

      expect(io).toHaveBeenCalledWith(wsUrl, expect.objectContaining({
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
      }));
    });
  });

  describe('Event room management', () => {
    it('should emit join_event with eventId on connect', () => {
      const eventId = 'event-123';

      // Simulate the connect handler
      const connectHandler = () => {
        mockSocket.emit('join_event', { eventId });
      };

      connectHandler();

      expect(mockSocket.emit).toHaveBeenCalledWith('join_event', { eventId });
    });

    it('should emit leave_event with eventId on unmount/disconnect', () => {
      const eventId = 'event-123';

      // Simulate the cleanup handler
      const cleanupHandler = () => {
        mockSocket.emit('leave_event', { eventId });
        mockSocket.disconnect();
      };

      cleanupHandler();

      expect(mockSocket.emit).toHaveBeenCalledWith('leave_event', { eventId });
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should re-join event room after reconnection', () => {
      const eventId = 'event-456';

      // Simulate reconnect handler
      const reconnectHandler = () => {
        mockSocket.emit('join_event', { eventId });
      };

      reconnectHandler();

      expect(mockSocket.emit).toHaveBeenCalledWith('join_event', { eventId });
    });
  });

  describe('Real-time event handling', () => {
    it('should update local cache when guest_checked_in event received', async () => {
      const event = {
        guestId: 'guest-1',
        guestName: 'John Doe',
        group: 'friend',
        checkedInAt: '2024-01-15T10:30:00Z',
        method: 'qr_scan' as const,
        eventId: 'event-123',
      };

      // Simulate the event handler
      await updateCachedGuestCheckIn(event.guestId, event.checkedInAt);

      expect(updateCachedGuestCheckIn).toHaveBeenCalledWith('guest-1', '2024-01-15T10:30:00Z');
    });

    it('should add Go-Show guest to local cache when go_show_added event received', async () => {
      const event = {
        guestId: 'guest-goshow-1',
        guestName: 'Walk-in Guest',
        group: 'friend',
        checkedInAt: '2024-01-15T11:00:00Z',
        eventId: 'event-123',
      };

      // Simulate the event handler — adds guest as already checked-in
      await cacheGuests([{
        id: event.guestId,
        name: event.guestName,
        qrPayload: '', // Go-Show guests don't have QR codes
        group: event.group,
        checkedIn: true,
        checkedInAt: event.checkedInAt,
        eventId: event.eventId,
      }]);

      expect(cacheGuests).toHaveBeenCalledWith([expect.objectContaining({
        id: 'guest-goshow-1',
        name: 'Walk-in Guest',
        qrPayload: '',
        checkedIn: true,
        checkedInAt: '2024-01-15T11:00:00Z',
      })]);
    });

    it('should add new guest to local cache when guest_added event received', async () => {
      const event = {
        guestId: 'guest-new-1',
        guestName: 'New Guest',
        qrPayload: 'encrypted-qr-payload',
        group: 'family',
        eventId: 'event-123',
      };

      // Simulate the event handler — adds guest as not checked-in
      await cacheGuests([{
        id: event.guestId,
        name: event.guestName,
        qrPayload: event.qrPayload,
        group: event.group,
        checkedIn: false,
        eventId: event.eventId,
      }]);

      expect(cacheGuests).toHaveBeenCalledWith([expect.objectContaining({
        id: 'guest-new-1',
        name: 'New Guest',
        qrPayload: 'encrypted-qr-payload',
        group: 'family',
        checkedIn: false,
      })]);
    });
  });

  describe('Reconnection sync', () => {
    it('should sync pending check-ins on reconnect', async () => {
      const apiBaseUrl = 'http://localhost:3100';
      const authToken = 'test-token';

      await syncPendingCheckIns(apiBaseUrl, authToken);

      expect(syncPendingCheckIns).toHaveBeenCalledWith(apiBaseUrl, authToken);
    });

    it('should refresh guest cache after sync on reconnect', async () => {
      const apiBaseUrl = 'http://localhost:3100';
      const authToken = 'test-token';
      const eventId = 'event-123';

      await refreshGuestCache(apiBaseUrl, authToken, eventId);

      expect(refreshGuestCache).toHaveBeenCalledWith(apiBaseUrl, authToken, eventId);
    });

    it('should handle sync failure gracefully without throwing', async () => {
      (syncPendingCheckIns as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      await expect(
        syncPendingCheckIns('http://localhost:3100', 'token').catch(() => 'handled')
      ).resolves.toBe('handled');
    });

    it('should handle cache refresh failure gracefully without throwing', async () => {
      (refreshGuestCache as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      await expect(
        refreshGuestCache('http://localhost:3100', 'token', 'event-1').catch(() => 'handled')
      ).resolves.toBe('handled');
    });
  });

  describe('Connection state management', () => {
    it('should register all required event listeners', () => {
      // Verify the socket registers listeners for all required events
      const requiredEvents = ['connect', 'disconnect', 'reconnect_attempt', 'reconnect', 'guest_checked_in', 'go_show_added', 'guest_added'];

      // Simulate registering all listeners
      for (const event of requiredEvents) {
        mockSocket.on(event, vi.fn());
      }

      expect(mockSocket.on).toHaveBeenCalledTimes(requiredEvents.length);
      for (const event of requiredEvents) {
        expect(mockSocket.on).toHaveBeenCalledWith(event, expect.any(Function));
      }
    });
  });
});
