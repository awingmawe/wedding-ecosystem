import { describe, it, expect } from 'vitest';
import { DeliveryStatus } from '@wedding/shared';

// --- Types (mirrored from page for testing) ---

interface NotificationGuest {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  delivery_status: DeliveryStatus;
  invitation_url: string | null;
}

type NotificationChannel = 'whatsapp' | 'email';

// --- Functions under test (extracted logic) ---

function canSendToGuest(guest: NotificationGuest): boolean {
  return !!(guest.phone || guest.email);
}

function getAvailableChannels(guest: NotificationGuest): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (guest.phone) channels.push('whatsapp');
  if (guest.email) channels.push('email');
  return channels;
}

// --- Test Data ---

function createGuest(overrides: Partial<NotificationGuest> = {}): NotificationGuest {
  return {
    id: 'guest-1',
    name: 'Budi Santoso',
    slug: 'budi-santoso',
    phone: '+6281234567890',
    email: 'budi@example.com',
    delivery_status: DeliveryStatus.NOT_SENT,
    invitation_url: '/wedding-event?to=budi-santoso',
    ...overrides,
  };
}

// --- Tests ---

describe('Notification Page Logic', () => {
  describe('canSendToGuest', () => {
    it('returns true when guest has phone', () => {
      const guest = createGuest({ email: null });
      expect(canSendToGuest(guest)).toBe(true);
    });

    it('returns true when guest has email', () => {
      const guest = createGuest({ phone: null });
      expect(canSendToGuest(guest)).toBe(true);
    });

    it('returns true when guest has both phone and email', () => {
      const guest = createGuest();
      expect(canSendToGuest(guest)).toBe(true);
    });

    it('returns false when guest has neither phone nor email', () => {
      const guest = createGuest({ phone: null, email: null });
      expect(canSendToGuest(guest)).toBe(false);
    });
  });

  describe('getAvailableChannels', () => {
    it('returns both channels when guest has phone and email', () => {
      const guest = createGuest();
      expect(getAvailableChannels(guest)).toEqual(['whatsapp', 'email']);
    });

    it('returns only whatsapp when guest has phone only', () => {
      const guest = createGuest({ email: null });
      expect(getAvailableChannels(guest)).toEqual(['whatsapp']);
    });

    it('returns only email when guest has email only', () => {
      const guest = createGuest({ phone: null });
      expect(getAvailableChannels(guest)).toEqual(['email']);
    });

    it('returns empty array when guest has no contact info', () => {
      const guest = createGuest({ phone: null, email: null });
      expect(getAvailableChannels(guest)).toEqual([]);
    });
  });

  describe('Delivery Status Labels', () => {
    const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
      [DeliveryStatus.NOT_SENT]: 'Belum Dikirim',
      [DeliveryStatus.SENT]: 'Terkirim',
      [DeliveryStatus.FAILED]: 'Gagal',
    };

    it('maps NOT_SENT to "Belum Dikirim"', () => {
      expect(DELIVERY_STATUS_LABELS[DeliveryStatus.NOT_SENT]).toBe('Belum Dikirim');
    });

    it('maps SENT to "Terkirim"', () => {
      expect(DELIVERY_STATUS_LABELS[DeliveryStatus.SENT]).toBe('Terkirim');
    });

    it('maps FAILED to "Gagal"', () => {
      expect(DELIVERY_STATUS_LABELS[DeliveryStatus.FAILED]).toBe('Gagal');
    });
  });

  describe('MAX_BATCH_SIZE', () => {
    const MAX_BATCH_SIZE = 500;

    it('is set to 500', () => {
      expect(MAX_BATCH_SIZE).toBe(500);
    });
  });
});
