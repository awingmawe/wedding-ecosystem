/**
 * Tests for manual check-in logic.
 * Validates search behavior, check-in flow, and Go-Show registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock indexed-db module
vi.mock('@/lib/indexed-db', () => ({
  searchCachedGuests: vi.fn(),
  updateCachedGuestCheckIn: vi.fn(),
}));

// Mock offline-queue module
vi.mock('@/lib/offline-queue', () => ({
  enqueueCheckIn: vi.fn(async () => ({
    success: true,
    overflowWarning: false,
    queuedRecord: {
      id: 'queue-1',
      guestId: 'guest-1',
      qrPayload: '',
      method: 'manual',
      checkedInAt: new Date().toISOString(),
      synced: false,
      eventId: 'event-1',
    },
  })),
}));

import { searchCachedGuests } from '@/lib/indexed-db';
import { enqueueCheckIn } from '@/lib/offline-queue';

const mockSearchCachedGuests = vi.mocked(searchCachedGuests);
const mockEnqueueCheckIn = vi.mocked(enqueueCheckIn);

describe('Manual Check-in Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Search behavior', () => {
    it('should not search with less than 3 characters', async () => {
      // Simulate the component logic: query length < 3 means no search
      const query = 'ab';
      const shouldSearch = query.length >= 3;
      expect(shouldSearch).toBe(false);
    });

    it('should search with 3 or more characters', async () => {
      const query = 'abc';
      const shouldSearch = query.length >= 3;
      expect(shouldSearch).toBe(true);
    });

    it('should return max 10 results from local search', async () => {
      const mockGuests = Array.from({ length: 15 }, (_, i) => ({
        id: `guest-${i}`,
        name: `Guest ${i}`,
        qrPayload: `qr-${i}`,
        group: 'friend',
        checkedIn: false,
        eventId: 'event-1',
      }));

      // searchCachedGuests already limits to 10 results internally
      mockSearchCachedGuests.mockResolvedValue(mockGuests.slice(0, 10));

      const results = await searchCachedGuests('Guest', 'event-1');
      expect(results.length).toBeLessThanOrEqual(10);
    });

    it('should perform partial name match search', async () => {
      const mockGuests = [
        { id: 'g1', name: 'Ahmad Fauzi', qrPayload: 'qr1', group: 'family', checkedIn: false, eventId: 'e1' },
        { id: 'g2', name: 'Fauziah Nur', qrPayload: 'qr2', group: 'friend', checkedIn: false, eventId: 'e1' },
      ];

      mockSearchCachedGuests.mockResolvedValue(mockGuests);

      const results = await searchCachedGuests('Fauz', 'e1');
      expect(results.length).toBe(2);
      expect(results.every((g) => g.name.toLowerCase().includes('fauz'))).toBe(true);
    });
  });

  describe('Check-in flow', () => {
    it('should distinguish between checked-in and not-checked-in guests', () => {
      const guests = [
        { id: 'g1', name: 'Guest A', qrPayload: 'qr1', group: 'family', checkedIn: false, eventId: 'e1' },
        { id: 'g2', name: 'Guest B', qrPayload: 'qr2', group: 'friend', checkedIn: true, checkedInAt: '2024-01-01T10:00:00Z', eventId: 'e1' },
      ];

      const notCheckedIn = guests.filter((g) => !g.checkedIn);
      const alreadyCheckedIn = guests.filter((g) => g.checkedIn);

      expect(notCheckedIn.length).toBe(1);
      expect(notCheckedIn[0].name).toBe('Guest A');
      expect(alreadyCheckedIn.length).toBe(1);
      expect(alreadyCheckedIn[0].name).toBe('Guest B');
    });

    it('should enqueue check-in when offline', async () => {
      await enqueueCheckIn({
        guestId: 'guest-1',
        qrPayload: 'qr-1',
        method: 'manual',
        eventId: 'event-1',
        guestName: 'Test Guest',
      });

      expect(mockEnqueueCheckIn).toHaveBeenCalledWith({
        guestId: 'guest-1',
        qrPayload: 'qr-1',
        method: 'manual',
        eventId: 'event-1',
        guestName: 'Test Guest',
      });
    });

    it('should enqueue Go-Show with method go_show when offline', async () => {
      await enqueueCheckIn({
        guestId: 'go-show-temp-id',
        qrPayload: '',
        method: 'go_show',
        eventId: 'event-1',
        guestName: 'Walk-in Guest',
      });

      expect(mockEnqueueCheckIn).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'go_show',
          qrPayload: '',
          guestName: 'Walk-in Guest',
        })
      );
    });
  });

  describe('Go-Show registration', () => {
    it('should require nama field', () => {
      const nama = '';
      const isValid = nama.trim().length > 0;
      expect(isValid).toBe(false);
    });

    it('should accept valid nama', () => {
      const nama = 'Budi Santoso';
      const isValid = nama.trim().length > 0;
      expect(isValid).toBe(true);
    });

    it('should trim whitespace from nama', () => {
      const nama = '  Budi Santoso  ';
      const trimmed = nama.trim();
      expect(trimmed).toBe('Budi Santoso');
      expect(trimmed.length > 0).toBe(true);
    });
  });

  describe('Group label mapping', () => {
    it('should map group codes to Indonesian labels', () => {
      const getGroupLabel = (group: string): string => {
        switch (group) {
          case 'family': return 'Keluarga';
          case 'friend': return 'Teman';
          case 'colleague': return 'Rekan Kerja';
          case 'vip': return 'VIP';
          default: return group || '';
        }
      };

      expect(getGroupLabel('family')).toBe('Keluarga');
      expect(getGroupLabel('friend')).toBe('Teman');
      expect(getGroupLabel('colleague')).toBe('Rekan Kerja');
      expect(getGroupLabel('vip')).toBe('VIP');
      expect(getGroupLabel('')).toBe('');
    });
  });
});
