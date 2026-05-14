/**
 * Socket.io client configuration for the Dashboard app.
 * Configures reconnection with exponential backoff per Requirement 13.8:
 * - Reconnection delay: 1s, 2s, 4s, 8s, max 30s
 * - Shows "reconnecting" indicator on disconnect
 *
 * The Dashboard uses less aggressive reconnection than the Scanner
 * since it's not used during live check-in events, but still needs
 * reliable real-time updates for stats and notifications.
 */

import { io, type Socket, type ManagerOptions, type SocketOptions } from 'socket.io-client';

export type DashboardSocketStatus =
  | 'terputus' // disconnected
  | 'menghubungkan' // connecting (initial)
  | 'terhubung' // connected
  | 'menghubungkan_ulang'; // reconnecting

export interface DashboardSocketConfig {
  /** WebSocket server URL */
  url: string;
  /** JWT auth token */
  token: string;
}

/**
 * Socket.io client options configured for Dashboard reconnection.
 * Uses exponential backoff: 1s → 2s → 4s → 8s → ... → max 30s
 */
export const DASHBOARD_SOCKET_OPTIONS: Partial<ManagerOptions & SocketOptions> = {
  // Reconnection with exponential backoff
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000, // Start at 1 second
  reconnectionDelayMax: 30000, // Max 30 seconds between attempts
  randomizationFactor: 0.5, // Jitter to prevent thundering herd

  // Connection settings
  timeout: 20000, // 20s connection timeout
  transports: ['websocket', 'polling'], // Prefer WebSocket, fallback to polling

  // Don't auto-connect — let the hook control lifecycle
  autoConnect: false,
};

/**
 * Creates a configured Socket.io client instance for the Dashboard.
 * Includes exponential backoff reconnection (1s, 2s, 4s, 8s, max 30s).
 */
export function createDashboardSocket(config: DashboardSocketConfig): Socket {
  const { url, token } = config;

  return io(url, {
    ...DASHBOARD_SOCKET_OPTIONS,
    auth: { token },
  });
}
