'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/api';

export type ConnectionStatus = 'terhubung' | 'terputus';

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
  /** Manually connect */
  connect: () => void;
  /** Manually disconnect */
  disconnect: () => void;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

/**
 * Hook for managing Socket.io WebSocket connection with room-based event subscription.
 * Provides connection status indicator (terhubung/terputus) per Requirement 9.8.
 */
export function useSocket({ eventId, autoConnect = true }: UseSocketOptions): UseSocketReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('terputus');
  const socketRef = useRef<Socket | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const token = getAccessToken();

    const socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      auth: { token },
      autoConnect: true,
    });

    socket.on('connect', () => {
      setConnectionStatus('terhubung');
      if (eventId) {
        socket.emit('join_event', eventId);
      }
    });

    socket.on('disconnect', () => {
      setConnectionStatus('terputus');
    });

    socket.on('connect_error', () => {
      setConnectionStatus('terputus');
    });

    socketRef.current = socket;
  }, [eventId]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      if (eventId) {
        socketRef.current.emit('leave_event', eventId);
      }
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
    connect,
    disconnect,
  };
}
