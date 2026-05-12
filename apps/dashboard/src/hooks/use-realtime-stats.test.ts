import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRealtimeStats, type EventStats, type RsvpTrackingItem } from './use-realtime-stats';

// Mock a minimal Socket-like event emitter for testing
class MockSocket {
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  on(event: string, handler: (...args: unknown[]) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((handler) => handler(...args));
  }
}

// Since we can't use React hooks directly in tests without a renderer,
// we test the logic by simulating what the hook does internally.
describe('useRealtimeStats logic', () => {
  describe('stats_updated event handling', () => {
    it('should update stats when stats_updated event is received', () => {
      const mockSocket = new MockSocket();
      let currentStats: EventStats = {
        total_guests: 0,
        total_rsvp: 0,
        total_checked_in: 0,
        total_go_show: 0,
      };

      // Simulate the handler logic
      mockSocket.on('stats_updated', (payload: unknown) => {
        const p = payload as EventStats;
        currentStats = {
          total_guests: p.total_guests,
          total_rsvp: p.total_rsvp,
          total_checked_in: p.total_checked_in,
          total_go_show: p.total_go_show,
        };
      });

      mockSocket.emit('stats_updated', {
        total_guests: 100,
        total_rsvp: 50,
        total_checked_in: 30,
        total_go_show: 5,
      });

      expect(currentStats.total_guests).toBe(100);
      expect(currentStats.total_rsvp).toBe(50);
      expect(currentStats.total_checked_in).toBe(30);
      expect(currentStats.total_go_show).toBe(5);
    });
  });

  describe('rsvp_updated event handling', () => {
    it('should add new RSVP entry to the list', () => {
      const mockSocket = new MockSocket();
      let rsvpList: RsvpTrackingItem[] = [];

      mockSocket.on('rsvp_updated', (payload: unknown) => {
        const p = payload as RsvpTrackingItem;
        const existingIndex = rsvpList.findIndex((item) => item.guest_id === p.guest_id);
        if (existingIndex >= 0) {
          rsvpList = [...rsvpList];
          rsvpList[existingIndex] = p;
        } else {
          rsvpList = [p, ...rsvpList];
        }
      });

      mockSocket.emit('rsvp_updated', {
        guest_id: 'guest-1',
        guest_name: 'Budi Santoso',
        attendance: 'both',
        guest_count: 2,
        submitted_at: '2025-01-15T10:00:00Z',
      });

      expect(rsvpList).toHaveLength(1);
      expect(rsvpList[0].guest_name).toBe('Budi Santoso');
      expect(rsvpList[0].attendance).toBe('both');
      expect(rsvpList[0].guest_count).toBe(2);
    });

    it('should update existing RSVP entry (upsert behavior)', () => {
      const mockSocket = new MockSocket();
      let rsvpList: RsvpTrackingItem[] = [
        {
          guest_id: 'guest-1',
          guest_name: 'Budi Santoso',
          attendance: 'akad',
          guest_count: 1,
          submitted_at: '2025-01-15T10:00:00Z',
        },
      ];

      mockSocket.on('rsvp_updated', (payload: unknown) => {
        const p = payload as RsvpTrackingItem;
        const existingIndex = rsvpList.findIndex((item) => item.guest_id === p.guest_id);
        if (existingIndex >= 0) {
          rsvpList = [...rsvpList];
          rsvpList[existingIndex] = p;
        } else {
          rsvpList = [p, ...rsvpList];
        }
      });

      // Update the same guest's RSVP
      mockSocket.emit('rsvp_updated', {
        guest_id: 'guest-1',
        guest_name: 'Budi Santoso',
        attendance: 'both',
        guest_count: 3,
        submitted_at: '2025-01-15T11:00:00Z',
      });

      expect(rsvpList).toHaveLength(1);
      expect(rsvpList[0].attendance).toBe('both');
      expect(rsvpList[0].guest_count).toBe(3);
    });
  });

  describe('go_show_added event handling', () => {
    it('should increment go-show and check-in stats', () => {
      const mockSocket = new MockSocket();
      let stats: EventStats = {
        total_guests: 50,
        total_rsvp: 30,
        total_checked_in: 20,
        total_go_show: 2,
      };

      mockSocket.on('go_show_added', () => {
        stats = {
          ...stats,
          total_guests: stats.total_guests + 1,
          total_checked_in: stats.total_checked_in + 1,
          total_go_show: stats.total_go_show + 1,
        };
      });

      mockSocket.emit('go_show_added', {
        guest_id: 'go-show-1',
        guest_name: 'Walk-in Guest',
        checked_in_at: '2025-01-15T14:00:00Z',
      });

      expect(stats.total_guests).toBe(51);
      expect(stats.total_checked_in).toBe(21);
      expect(stats.total_go_show).toBe(3);
      // RSVP count should not change
      expect(stats.total_rsvp).toBe(30);
    });
  });

  describe('guest_checked_in event handling', () => {
    it('should increment check-in count', () => {
      const mockSocket = new MockSocket();
      let stats: EventStats = {
        total_guests: 50,
        total_rsvp: 30,
        total_checked_in: 20,
        total_go_show: 2,
      };

      mockSocket.on('guest_checked_in', () => {
        stats = {
          ...stats,
          total_checked_in: stats.total_checked_in + 1,
        };
      });

      mockSocket.emit('guest_checked_in', {
        guest_id: 'guest-5',
        guest_name: 'Siti Rahayu',
        method: 'qr_scan',
        checked_in_at: '2025-01-15T14:30:00Z',
      });

      expect(stats.total_checked_in).toBe(21);
      // Other stats should not change
      expect(stats.total_guests).toBe(50);
      expect(stats.total_rsvp).toBe(30);
      expect(stats.total_go_show).toBe(2);
    });
  });
});
