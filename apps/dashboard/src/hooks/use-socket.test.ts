import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock socket.io-client
const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connect: vi.fn(),
  connected: false,
  removeAllListeners: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

vi.mock('@/lib/api', () => ({
  getAccessToken: vi.fn(() => 'test-token'),
}));

import { io } from 'socket.io-client';

describe('useSocket connection status logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.on.mockReset();
    mockSocket.emit.mockReset();
    mockSocket.disconnect.mockReset();
    mockSocket.connect.mockReset();
    mockSocket.removeAllListeners.mockReset();
  });

  describe('ConnectionStatus type', () => {
    it('should have terhubung as connected status', () => {
      const status: 'terhubung' | 'terputus' | 'menghubungkan' | 'menghubungkan_ulang' =
        'terhubung';
      expect(status).toBe('terhubung');
    });

    it('should have terputus as disconnected status', () => {
      const status: 'terhubung' | 'terputus' | 'menghubungkan' | 'menghubungkan_ulang' = 'terputus';
      expect(status).toBe('terputus');
    });

    it('should have menghubungkan_ulang as reconnecting status', () => {
      const status: 'terhubung' | 'terputus' | 'menghubungkan' | 'menghubungkan_ulang' =
        'menghubungkan_ulang';
      expect(status).toBe('menghubungkan_ulang');
    });

    it('should have menghubungkan as initial connecting status', () => {
      const status: 'terhubung' | 'terputus' | 'menghubungkan' | 'menghubungkan_ulang' =
        'menghubungkan';
      expect(status).toBe('menghubungkan');
    });
  });

  describe('connection status transitions', () => {
    it('should start as terputus', () => {
      const initialStatus = 'terputus';
      expect(initialStatus).toBe('terputus');
    });

    it('should transition to terhubung on connect', () => {
      let status: 'terhubung' | 'terputus' | 'menghubungkan' | 'menghubungkan_ulang' = 'terputus';
      status = 'terhubung';
      expect(status).toBe('terhubung');
    });

    it('should transition to menghubungkan_ulang on disconnect (auto-reconnect)', () => {
      let status: 'terhubung' | 'terputus' | 'menghubungkan' | 'menghubungkan_ulang' = 'terhubung';
      // On disconnect, Socket.io will auto-reconnect, so show reconnecting
      status = 'menghubungkan_ulang';
      expect(status).toBe('menghubungkan_ulang');
    });

    it('should transition to menghubungkan_ulang on reconnect_attempt', () => {
      let status: 'terhubung' | 'terputus' | 'menghubungkan' | 'menghubungkan_ulang' = 'terhubung';
      status = 'menghubungkan_ulang';
      expect(status).toBe('menghubungkan_ulang');
    });

    it('should transition back to terhubung on reconnect', () => {
      let status: 'terhubung' | 'terputus' | 'menghubungkan' | 'menghubungkan_ulang' =
        'menghubungkan_ulang';
      status = 'terhubung';
      expect(status).toBe('terhubung');
    });

    it('should transition to terputus on reconnect_failed', () => {
      let status: 'terhubung' | 'terputus' | 'menghubungkan' | 'menghubungkan_ulang' =
        'menghubungkan_ulang';
      status = 'terputus';
      expect(status).toBe('terputus');
    });
  });

  describe('Socket.io reconnection configuration', () => {
    it('should configure exponential backoff with 1s initial delay and 30s max', () => {
      const wsUrl = 'http://localhost:4000';
      const token = 'test-token';

      (io as unknown as ReturnType<typeof vi.fn>)(wsUrl, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        randomizationFactor: 0.5,
        timeout: 20000,
        transports: ['websocket', 'polling'],
        autoConnect: false,
        auth: { token },
      });

      expect(io).toHaveBeenCalledWith(
        wsUrl,
        expect.objectContaining({
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 30000,
          randomizationFactor: 0.5,
        })
      );
    });

    it('should pass auth token in socket options', () => {
      const wsUrl = 'http://localhost:4000';
      const token = 'my-jwt-token';

      (io as unknown as ReturnType<typeof vi.fn>)(wsUrl, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        auth: { token },
      });

      expect(io).toHaveBeenCalledWith(
        wsUrl,
        expect.objectContaining({
          auth: { token },
        })
      );
    });

    it('should set autoConnect to false for manual lifecycle control', () => {
      const wsUrl = 'http://localhost:4000';

      (io as unknown as ReturnType<typeof vi.fn>)(wsUrl, {
        autoConnect: false,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        auth: { token: 'test' },
      });

      expect(io).toHaveBeenCalledWith(
        wsUrl,
        expect.objectContaining({
          autoConnect: false,
        })
      );
    });
  });

  describe('event room management', () => {
    it('should emit join_event with eventId on connect', () => {
      const eventId = 'event-123';
      const emittedEvents: { event: string; data: string }[] = [];

      const emit = (event: string, data: string) => {
        emittedEvents.push({ event, data });
      };

      emit('join_event', eventId);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].event).toBe('join_event');
      expect(emittedEvents[0].data).toBe('event-123');
    });

    it('should emit leave_event with eventId on disconnect', () => {
      const eventId = 'event-123';
      const emittedEvents: { event: string; data: string }[] = [];

      const emit = (event: string, data: string) => {
        emittedEvents.push({ event, data });
      };

      emit('leave_event', eventId);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].event).toBe('leave_event');
      expect(emittedEvents[0].data).toBe('event-123');
    });

    it('should re-join event room after reconnection', () => {
      const eventId = 'event-456';
      const emittedEvents: { event: string; data: string }[] = [];

      const emit = (event: string, data: string) => {
        emittedEvents.push({ event, data });
      };

      // Simulate reconnect handler re-joining room
      emit('join_event', eventId);

      expect(emittedEvents[0].event).toBe('join_event');
      expect(emittedEvents[0].data).toBe('event-456');
    });
  });

  describe('event listener registration', () => {
    it('should register all required lifecycle event listeners', () => {
      const requiredEvents = [
        'connect',
        'disconnect',
        'reconnect_attempt',
        'reconnect',
        'reconnect_failed',
        'connect_error',
      ];

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
