/**
 * Socket.io client configuration for the Scanner PWA.
 * Configures aggressive reconnection with exponential backoff per Requirement 13.8:
 * - Reconnection delay: 1s, 2s, 4s, 8s, max 30s
 * - Infinite reconnection attempts (Scanner must always reconnect during live events)
 *
 * The Scanner uses aggressive reconnection because it's used during live check-in
 * events where real-time connectivity is critical for syncing offline queue and
 * receiving updates from other scanner devices.
 */

import { io, type Socket, type ManagerOptions, type SocketOptions } from 'socket.io-client';

export type ScannerSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface ScannerSocketConfig {
  /** WebSocket server URL */
  url: string;
  /** JWT auth token */
  token: string;
}

/**
 * Socket.io client options configured for Scanner reconnection.
 * Uses exponential backoff: 1s → 2s → 4s → 8s → ... → max 30s
 *
 * Scanner is more aggressive than Dashboard because:
 * - Used during live events where connectivity is critical
 * - Needs to sync offline queue as soon as connection is restored
 * - Multiple scanner devices need real-time coordination
 */
export const SCANNER_SOCKET_OPTIONS: Partial<ManagerOptions & SocketOptions> = {
  // Aggressive reconnection with exponential backoff
  reconnection: true,
  reconnectionAttempts: Infinity, // Never stop trying
  reconnectionDelay: 1000, // Start at 1 second
  reconnectionDelayMax: 30000, // Max 30 seconds between attempts
  randomizationFactor: 0.5, // Jitter to prevent thundering herd

  // Connection settings
  timeout: 20000, // 20s connection timeout
  transports: ['websocket', 'polling'], // Prefer WebSocket, fallback to polling
};

/**
 * Creates a configured Socket.io client instance for the Scanner.
 * Includes exponential backoff reconnection (1s, 2s, 4s, 8s, max 30s).
 *
 * The backoff sequence with randomization factor 0.5:
 * - Attempt 1: ~1s (0.5s - 1.5s)
 * - Attempt 2: ~2s (1s - 3s)
 * - Attempt 3: ~4s (2s - 6s)
 * - Attempt 4: ~8s (4s - 12s)
 * - Attempt 5: ~16s (8s - 24s)
 * - Attempt 6+: capped at ~30s
 */
export function createScannerSocket(config: ScannerSocketConfig): Socket {
  const { url, token } = config;

  return io(url, {
    ...SCANNER_SOCKET_OPTIONS,
    auth: { token },
  });
}
