'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { type Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/api';
import { createDashboardSocket, type DashboardSocketStatus } from '@/lib/socket';

export type ConnectionStatus = DashboardSocketStatus;

interface UseSocketOptions {
  /** The event ID to join the room for */
  eventId: string | null;
  /** Whether to auto-connect on mount */
  autoConnect?: boolean;
}

interface UseSocketReturn {
  /** The Socket.io client instance */
  socket: Socket | null;
  /** Connection status in Bahasa Indonesia */
  connectionStatus: ConnectionStatus;
  /** Whether the socket is connected */
  isConnected: boolean;
  /** Whether the socket is currently reconnecting */
  isReconnecting: boolean;
  /** Manually connect */
  connect: () => void;
  /** Manually disconnect */
  disconnect: () => void;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

/**
 * Hook for managing Socket.io WebSocket connection with room-based event subscription.
 * Provides connection status indicator including "menghubungkan_ulang" (reconnecting)
 * per Requirement 13.8.
 *
 * Reconnection uses exponential backoff: 1s, 2s, 4s, 8s, max 30s.
 * Dashboard shows "reconnecting" indicator when connection is lost.
 */
export function useSocket({ eventId, autoConnect = true }: UseSocketOptions): UseSocketReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('terputus');
  const socketRef = useRef<Socket | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    // Clean up existing socket if any
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }

    const token = getAccessToken();
    if (!token) {
      setConnectionStatus('terputus');
      return;
    }

    setConnectionStatus('menghubungkan');

    const socket = createDashboardSocket({ url: WS_URL, token });

    // --- Connection lifecycle events ---

    socket.on('connect', () => {
      setConnectionStatus('terhubung');
      if (eventId) {
        socket.emit('join_event', eventId);
      }
    });

    socket.on('disconnect', () => {
      // Socket.io will auto-reconnect, so show reconnecting state
      setConnectionStatus('menghubungkan_ulang');
    });

    socket.on('reconnect_attempt', () => {
      setConnectionStatus('menghubungkan_ulang');
    });

    socket.on('reconnect', () => {
      setConnectionStatus('terhubung');
      // Re-join event room after reconnection
      if (eventId) {
        socket.emit('join_event', eventId);
      }
    });

    socket.on('reconnect_failed', () => {
      // All reconnection attempts exhausted (shouldn't happen with Infinity attempts)
      setConnectionStatus('terputus');
    });

    socket.on('connect_error', () => {
      // On initial connection error, show reconnecting since Socket.io will retry
      if (connectionStatus !== 'terhubung') {
        setConnectionStatus('menghubungkan_ulang');
      }
    });

    // Start the connection
    socket.connect();
    socketRef.current = socket;
  }, [eventId]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      if (eventId) {
        socketRef.current.emit('leave_event', eventId);
      }
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      setConnectionStatus('terputus');
    }
  }, [eventId]);

  useEffect(() => {
    if (autoConnect && eventId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, eventId, connect, disconnect]);

  return {
    socket: socketRef.current,
    connectionStatus,
    isConnected: connectionStatus === 'terhubung',
    isReconnecting: connectionStatus === 'menghubungkan_ulang',
    connect,
    disconnect,
  };
}
