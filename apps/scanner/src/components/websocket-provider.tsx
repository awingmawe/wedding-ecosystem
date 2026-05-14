/**
 * WebSocket Provider component.
 * Provides WebSocket connection state and real-time sync to the app.
 * Integrates with the existing PWA infrastructure and auth context.
 * UI labels in Bahasa Indonesia.
 */

'use client';

import { createContext, useContext, useCallback, type ReactNode } from 'react';
import {
  useWebSocket,
  type WebSocketState,
  type GuestCheckedInEvent,
  type GoShowAddedEvent,
  type GuestAddedEvent,
} from '@/lib/websocket';
import { usePWA } from './pwa-provider';

// Default WebSocket URL — uses NEXT_PUBLIC_WS_URL or falls back to API URL
const DEFAULT_WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface WebSocketContextValue extends WebSocketState {
  /** Human-readable status label in Bahasa Indonesia */
  statusLabel: string;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  status: 'disconnected',
  isConnected: false,
  lastEventReceived: null,
  statusLabel: 'Terputus',
});

export function useWebSocketContext(): WebSocketContextValue {
  return useContext(WebSocketContext);
}

interface WebSocketProviderProps {
  children: ReactNode;
  /** Optional callback when a guest is checked in by another device */
  onGuestCheckedIn?: (event: GuestCheckedInEvent) => void;
  /** Optional callback when a Go-Show guest is added */
  onGoShowAdded?: (event: GoShowAddedEvent) => void;
  /** Optional callback when a new guest is added to the event */
  onGuestAdded?: (event: GuestAddedEvent) => void;
}

/**
 * Get human-readable status label in Bahasa Indonesia.
 */
function getStatusLabel(status: WebSocketState['status']): string {
  switch (status) {
    case 'connected':
      return 'Terhubung';
    case 'connecting':
      return 'Menghubungkan...';
    case 'reconnecting':
      return 'Menghubungkan ulang...';
    case 'disconnected':
      return 'Terputus';
    default:
      return 'Terputus';
  }
}

export function WebSocketProvider({
  children,
  onGuestCheckedIn,
  onGoShowAdded,
  onGuestAdded,
}: WebSocketProviderProps) {
  const { eventId, apiBaseUrl, authToken, isOnline } = usePWA();

  // Memoize callbacks to prevent unnecessary re-renders
  const handleGuestCheckedIn = useCallback(
    (event: GuestCheckedInEvent) => {
      onGuestCheckedIn?.(event);
    },
    [onGuestCheckedIn]
  );

  const handleGoShowAdded = useCallback(
    (event: GoShowAddedEvent) => {
      onGoShowAdded?.(event);
    },
    [onGoShowAdded]
  );

  const handleGuestAdded = useCallback(
    (event: GuestAddedEvent) => {
      onGuestAdded?.(event);
    },
    [onGuestAdded]
  );

  const wsState = useWebSocket({
    wsUrl: DEFAULT_WS_URL,
    eventId,
    apiBaseUrl,
    authToken,
    enabled: isOnline && !!eventId && !!authToken,
    onGuestCheckedIn: handleGuestCheckedIn,
    onGoShowAdded: handleGoShowAdded,
    onGuestAdded: handleGuestAdded,
  });

  const contextValue: WebSocketContextValue = {
    ...wsState,
    statusLabel: getStatusLabel(wsState.status),
  };

  return <WebSocketContext.Provider value={contextValue}>{children}</WebSocketContext.Provider>;
}
