/**
 * WebSocket manager for real-time sync using Socket.io client.
 * Connects to the WebSocket server with event room for real-time updates.
 * Handles reconnection with exponential backoff (Socket.io built-in).
 * Syncs offline queue on reconnect within 30 seconds.
 * Updates local cache after sync to reflect latest check-in states.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { syncPendingCheckIns, refreshGuestCache } from './sync-manager';
import { cacheGuests, updateCachedGuestCheckIn, type CachedGuest } from './indexed-db';

// WebSocket connection states
export type WebSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface WebSocketState {
  status: WebSocketStatus;
  isConnected: boolean;
  lastEventReceived: string | null;
}

// Events received from the server
export interface GuestCheckedInEvent {
  guestId: string;
  guestName: string;
  group: string;
  checkedInAt: string;
  method: 'qr_scan' | 'manual' | 'go_show';
  eventId: string;
}

export interface GoShowAddedEvent {
  guestId: string;
  guestName: string;
  group: string;
  checkedInAt: string;
  eventId: string;
}

export interface GuestAddedEvent {
  guestId: string;
  guestName: string;
  qrPayload: string;
  group: string;
  eventId: string;
}

interface UseWebSocketOptions {
  wsUrl: string;
  eventId: string;
  apiBaseUrl: string;
  authToken: string;
  enabled?: boolean;
  onGuestCheckedIn?: (event: GuestCheckedInEvent) => void;
  onGoShowAdded?: (event: GoShowAddedEvent) => void;
  onGuestAdded?: (event: GuestAddedEvent) => void;
}

/**
 * React hook for WebSocket connection and real-time sync.
 * Connects to the WebSocket server, joins the event room,
 * and handles real-time updates from other scanner devices.
 */
export function useWebSocket(options: UseWebSocketOptions): WebSocketState {
  const {
    wsUrl,
    eventId,
    apiBaseUrl,
    authToken,
    enabled = true,
    onGuestCheckedIn,
    onGoShowAdded,
    onGuestAdded,
  } = options;

  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [lastEventReceived, setLastEventReceived] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const isSyncingRef = useRef(false);

  // Store callbacks in refs to avoid reconnection on callback changes
  const onGuestCheckedInRef = useRef(onGuestCheckedIn);
  const onGoShowAddedRef = useRef(onGoShowAdded);
  const onGuestAddedRef = useRef(onGuestAdded);

  useEffect(() => {
    onGuestCheckedInRef.current = onGuestCheckedIn;
  }, [onGuestCheckedIn]);

  useEffect(() => {
    onGoShowAddedRef.current = onGoShowAdded;
  }, [onGoShowAdded]);

  useEffect(() => {
    onGuestAddedRef.current = onGuestAdded;
  }, [onGuestAdded]);

  /**
   * Sync offline queue and refresh cache on reconnect.
   * Must complete within 30 seconds per requirement.
   */
  const handleReconnectSync = useCallback(async () => {
    if (isSyncingRef.current || !authToken || !eventId) return;

    isSyncingRef.current = true;
    try {
      // Sync pending check-ins from offline queue
      await syncPendingCheckIns(apiBaseUrl, authToken);

      // Refresh guest cache from server to get latest states
      await refreshGuestCache(apiBaseUrl, authToken, eventId);
    } catch {
      // Silently fail — will retry on next reconnect
      console.warn('[WebSocket] Reconnect sync failed');
    } finally {
      isSyncingRef.current = false;
    }
  }, [apiBaseUrl, authToken, eventId]);

  useEffect(() => {
    // Don't connect if disabled or missing required params
    if (!enabled || !eventId || !wsUrl) {
      setStatus('disconnected');
      return;
    }

    setStatus('connecting');

    // Create Socket.io connection with exponential backoff reconnection
    const socket = io(wsUrl, {
      // Auto-reconnect with exponential backoff (Socket.io built-in)
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000, // Start at 1 second
      reconnectionDelayMax: 30000, // Max 30 seconds between attempts
      randomizationFactor: 0.5, // Add randomization to prevent thundering herd
      timeout: 20000, // Connection timeout
      transports: ['websocket', 'polling'], // Prefer WebSocket, fallback to polling
      auth: {
        token: authToken,
      },
    });

    socketRef.current = socket;

    // --- Connection lifecycle events ---

    socket.on('connect', () => {
      setStatus('connected');

      // Join event room on connect
      socket.emit('join_event', { eventId });
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
    });

    socket.on('reconnect_attempt', () => {
      setStatus('reconnecting');
    });

    socket.on('reconnect', () => {
      setStatus('connected');

      // Re-join event room after reconnection
      socket.emit('join_event', { eventId });

      // Trigger sync of offline queue on reconnect
      handleReconnectSync();
    });

    // --- Real-time update events ---

    /**
     * Handle guest_checked_in event from other scanner devices.
     * Updates local cache to mark guest as checked-in.
     */
    socket.on('guest_checked_in', async (data: GuestCheckedInEvent) => {
      setLastEventReceived(new Date().toISOString());

      // Update local cache to reflect check-in
      await updateCachedGuestCheckIn(data.guestId, data.checkedInAt);

      // Notify consumer component
      onGuestCheckedInRef.current?.(data);
    });

    /**
     * Handle go_show_added event.
     * Adds new Go-Show guest to local cache as already checked-in.
     */
    socket.on('go_show_added', async (data: GoShowAddedEvent) => {
      setLastEventReceived(new Date().toISOString());

      // Add Go-Show guest to local cache (already checked-in)
      const newGuest: CachedGuest = {
        id: data.guestId,
        name: data.guestName,
        qrPayload: '', // Go-Show guests don't have QR codes
        group: data.group,
        checkedIn: true,
        checkedInAt: data.checkedInAt,
        eventId: data.eventId,
      };
      await cacheGuests([newGuest]);

      // Notify consumer component
      onGoShowAddedRef.current?.(data);
    });

    /**
     * Handle guest_added event.
     * Adds new guest to local cache (not yet checked-in).
     */
    socket.on('guest_added', async (data: GuestAddedEvent) => {
      setLastEventReceived(new Date().toISOString());

      // Add new guest to local cache
      const newGuest: CachedGuest = {
        id: data.guestId,
        name: data.guestName,
        qrPayload: data.qrPayload,
        group: data.group,
        checkedIn: false,
        eventId: data.eventId,
      };
      await cacheGuests([newGuest]);

      // Notify consumer component
      onGuestAddedRef.current?.(data);
    });

    // --- Cleanup on unmount ---
    return () => {
      // Leave event room before disconnecting
      socket.emit('leave_event', { eventId });
      socket.disconnect();
      socketRef.current = null;
      setStatus('disconnected');
    };
  }, [wsUrl, eventId, authToken, enabled, handleReconnectSync]);

  return {
    status,
    isConnected: status === 'connected',
    lastEventReceived,
  };
}
