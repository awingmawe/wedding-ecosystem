import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock socket.io-client
const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connect: vi.fn(),
  connected: false,
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

import { io } from 'socket.io-client';
import { createDashboardSocket, DASHBOARD_SOCKET_OPTIONS } from './socket';

describe('Dashboard Socket Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DASHBOARD_SOCKET_OPTIONS', () => {
    it('should enable reconnection', () => {
      expect(DASHBOARD_SOCKET_OPTIONS.reconnection).toBe(true);
    });

    it('should set reconnection attempts to Infinity', () => {
      expect(DASHBOARD_SOCKET_OPTIONS.reconnectionAttempts).toBe(Infinity);
    });

    it('should set initial reconnection delay to 1 second', () => {
      expect(DASHBOARD_SOCKET_OPTIONS.reconnectionDelay).toBe(1000);
    });

    it('should set max reconnection delay to 30 seconds', () => {
      expect(DASHBOARD_SOCKET_OPTIONS.reconnectionDelayMax).toBe(30000);
    });

    it('should set randomization factor to 0.5', () => {
      expect(DASHBOARD_SOCKET_OPTIONS.randomizationFactor).toBe(0.5);
    });

    it('should set connection timeout to 20 seconds', () => {
      expect(DASHBOARD_SOCKET_OPTIONS.timeout).toBe(20000);
    });

    it('should prefer websocket transport with polling fallback', () => {
      expect(DASHBOARD_SOCKET_OPTIONS.transports).toEqual(['websocket', 'polling']);
    });

    it('should not auto-connect (manual lifecycle control)', () => {
      expect(DASHBOARD_SOCKET_OPTIONS.autoConnect).toBe(false);
    });
  });

  describe('createDashboardSocket', () => {
    it('should create socket with correct URL', () => {
      const url = 'http://localhost:4000';
      const token = 'test-jwt-token';

      createDashboardSocket({ url, token });

      expect(io).toHaveBeenCalledWith(url, expect.any(Object));
    });

    it('should pass auth token in socket options', () => {
      const url = 'http://localhost:4000';
      const token = 'my-auth-token';

      createDashboardSocket({ url, token });

      expect(io).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          auth: { token: 'my-auth-token' },
        })
      );
    });

    it('should include all reconnection options', () => {
      const url = 'wss://ws.example.com';
      const token = 'token-123';

      createDashboardSocket({ url, token });

      expect(io).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 30000,
          randomizationFactor: 0.5,
          timeout: 20000,
          transports: ['websocket', 'polling'],
          autoConnect: false,
        })
      );
    });

    it('should return a socket instance', () => {
      const socket = createDashboardSocket({ url: 'http://localhost:4000', token: 'token' });
      expect(socket).toBeDefined();
    });
  });

  describe('exponential backoff sequence validation', () => {
    it('should produce correct backoff sequence: 1s, 2s, 4s, 8s, 16s, 30s (capped)', () => {
      const baseDelay = DASHBOARD_SOCKET_OPTIONS.reconnectionDelay!;
      const maxDelay = DASHBOARD_SOCKET_OPTIONS.reconnectionDelayMax!;

      // Socket.io uses: delay * 2^attempt (before randomization)
      const expectedSequence = [1000, 2000, 4000, 8000, 16000, 30000];

      for (let attempt = 0; attempt < expectedSequence.length; attempt++) {
        const rawDelay = baseDelay * Math.pow(2, attempt);
        const cappedDelay = Math.min(rawDelay, maxDelay);
        expect(cappedDelay).toBe(expectedSequence[attempt]);
      }
    });
  });
});
