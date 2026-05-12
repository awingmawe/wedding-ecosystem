'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';

/** Real-time event statistics (Req 9.6) */
export interface EventStats {
  total_guests: number;
  total_rsvp: number;
  total_checked_in: number;
  total_go_show: number;
}

/** RSVP record for tracking display (Req 4.8) */
export interface RsvpTrackingItem {
  guest_id: string;
  guest_name: string;
  attendance: 'akad' | 'resepsi' | 'both' | 'decline';
  guest_count: number;
  submitted_at: string;
}

interface UseRealtimeStatsOptions {
  socket: Socket | null;
  initialStats?: EventStats;
  initialRsvpList?: RsvpTrackingItem[];
}

interface UseRealtimeStatsReturn {
  stats: EventStats;
  rsvpList: RsvpTrackingItem[];
}

const DEFAULT_STATS: EventStats = {
  total_guests: 0,
  total_rsvp: 0,
  total_checked_in: 0,
  total_go_show: 0,
};

/**
 * Hook for receiving real-time statistics and RSVP updates via WebSocket.
 * Updates stats within < 500ms after broadcast received (Req 9.6).
 */
export function useRealtimeStats({
  socket,
  initialStats = DEFAULT_STATS,
  initialRsvpList = [],
}: UseRealtimeStatsOptions): UseRealtimeStatsReturn {
  const [stats, setStats] = useState<EventStats>(initialStats);
  const [rsvpList, setRsvpList] = useState<RsvpTrackingItem[]>(initialRsvpList);

  const handleStatsUpdated = useCallback((payload: EventStats) => {
    setStats({
      total_guests: payload.total_guests,
      total_rsvp: payload.total_rsvp,
      total_checked_in: payload.total_checked_in,
      total_go_show: payload.total_go_show,
    });
  }, []);

  const handleRsvpUpdated = useCallback((payload: RsvpTrackingItem) => {
    setRsvpList((prev) => {
      // Update existing entry or add new one (Req 4.7 - upsert)
      const existingIndex = prev.findIndex((item) => item.guest_id === payload.guest_id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = payload;
        return updated;
      }
      return [payload, ...prev];
    });
  }, []);

  const handleGoShowAdded = useCallback((payload: { guest_id: string; guest_name: string; checked_in_at: string }) => {
    setStats((prev) => ({
      ...prev,
      total_guests: prev.total_guests + 1,
      total_checked_in: prev.total_checked_in + 1,
      total_go_show: prev.total_go_show + 1,
    }));
  }, []);

  const handleGuestCheckedIn = useCallback(() => {
    setStats((prev) => ({
      ...prev,
      total_checked_in: prev.total_checked_in + 1,
    }));
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('stats_updated', handleStatsUpdated);
    socket.on('rsvp_updated', handleRsvpUpdated);
    socket.on('go_show_added', handleGoShowAdded);
    socket.on('guest_checked_in', handleGuestCheckedIn);

    return () => {
      socket.off('stats_updated', handleStatsUpdated);
      socket.off('rsvp_updated', handleRsvpUpdated);
      socket.off('go_show_added', handleGoShowAdded);
      socket.off('guest_checked_in', handleGuestCheckedIn);
    };
  }, [socket, handleStatsUpdated, handleRsvpUpdated, handleGoShowAdded, handleGuestCheckedIn]);

  return { stats, rsvpList };
}
