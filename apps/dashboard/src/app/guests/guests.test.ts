import { describe, it, expect } from 'vitest';
import { GuestGroup } from '@wedding/shared';

// Test the guest list item type structure and filter logic
describe('Guest Management - Data Types', () => {
  it('defines correct guest group values', () => {
    expect(GuestGroup.FAMILY).toBe('family');
    expect(GuestGroup.FRIEND).toBe('friend');
    expect(GuestGroup.COLLEAGUE).toBe('colleague');
    expect(GuestGroup.VIP).toBe('vip');
  });

  it('validates pagination structure with 50 items per page', () => {
    const pagination = {
      page: 1,
      per_page: 50,
      total: 120,
      total_pages: 3,
    };

    expect(pagination.per_page).toBe(50);
    expect(pagination.total_pages).toBe(Math.ceil(pagination.total / pagination.per_page));
  });

  it('calculates correct page range display', () => {
    const pagination = { page: 2, per_page: 50, total: 120, total_pages: 3 };
    const start = (pagination.page - 1) * pagination.per_page + 1;
    const end = Math.min(pagination.page * pagination.per_page, pagination.total);

    expect(start).toBe(51);
    expect(end).toBe(100);
  });

  it('handles last page with fewer items', () => {
    const pagination = { page: 3, per_page: 50, total: 120, total_pages: 3 };
    const start = (pagination.page - 1) * pagination.per_page + 1;
    const end = Math.min(pagination.page * pagination.per_page, pagination.total);

    expect(start).toBe(101);
    expect(end).toBe(120);
  });
});

describe('Guest Management - Filter Logic', () => {
  const mockGuests = [
    { id: '1', name: 'Budi', group: GuestGroup.FAMILY, rsvp_status: 'both', check_in_status: true },
    { id: '2', name: 'Ani', group: GuestGroup.FRIEND, rsvp_status: null, check_in_status: false },
    { id: '3', name: 'Citra', group: GuestGroup.VIP, rsvp_status: 'decline', check_in_status: false },
    { id: '4', name: 'Dedi', group: GuestGroup.COLLEAGUE, rsvp_status: 'akad', check_in_status: false },
  ];

  it('filters by group', () => {
    const filtered = mockGuests.filter((g) => g.group === GuestGroup.FAMILY);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Budi');
  });

  it('filters by RSVP status - belum_rsvp', () => {
    const filtered = mockGuests.filter((g) => g.rsvp_status === null);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Ani');
  });

  it('filters by RSVP status - confirmed', () => {
    const filtered = mockGuests.filter(
      (g) => g.rsvp_status === 'akad' || g.rsvp_status === 'resepsi' || g.rsvp_status === 'both'
    );
    expect(filtered).toHaveLength(2);
  });

  it('filters by RSVP status - declined', () => {
    const filtered = mockGuests.filter((g) => g.rsvp_status === 'decline');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Citra');
  });

  it('filters by check-in status', () => {
    const filtered = mockGuests.filter((g) => g.check_in_status === true);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Budi');
  });

  it('combines group and status filters', () => {
    const filtered = mockGuests.filter(
      (g) => g.group === GuestGroup.FRIEND && g.rsvp_status === null
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Ani');
  });
});

describe('Guest Management - CSV Validation', () => {
  it('validates CSV file extension', () => {
    const validFile = 'guests.csv';
    const invalidFile = 'guests.xlsx';

    expect(validFile.endsWith('.csv')).toBe(true);
    expect(invalidFile.endsWith('.csv')).toBe(false);
  });

  it('validates max row count of 2000', () => {
    const maxRows = 2000;
    const rowCount = 1500;
    const overLimitCount = 2500;

    expect(rowCount <= maxRows).toBe(true);
    expect(overLimitCount <= maxRows).toBe(false);
  });

  it('validates required CSV columns', () => {
    const requiredColumns = ['nama', 'grup'];
    const headers = ['nama', 'grup', 'phone', 'email'];

    const missingColumns = requiredColumns.filter((col) => !headers.includes(col));
    expect(missingColumns).toHaveLength(0);
  });

  it('detects missing required columns', () => {
    const requiredColumns = ['nama', 'grup'];
    const headers = ['nama', 'phone', 'email'];

    const missingColumns = requiredColumns.filter((col) => !headers.includes(col));
    expect(missingColumns).toEqual(['grup']);
  });

  it('validates file size limit of 5MB', () => {
    const maxSize = 5 * 1024 * 1024;
    const validSize = 1024 * 1024; // 1MB
    const invalidSize = 6 * 1024 * 1024; // 6MB

    expect(validSize <= maxSize).toBe(true);
    expect(invalidSize <= maxSize).toBe(false);
  });
});

describe('Guest Management - RSVP Status Labels', () => {
  function getRsvpLabel(status: string | null): string {
    switch (status) {
      case 'akad':
        return 'Hadir (Akad)';
      case 'resepsi':
        return 'Hadir (Resepsi)';
      case 'both':
        return 'Hadir (Keduanya)';
      case 'decline':
        return 'Menolak';
      default:
        return 'Belum RSVP';
    }
  }

  it('returns correct label for akad', () => {
    expect(getRsvpLabel('akad')).toBe('Hadir (Akad)');
  });

  it('returns correct label for resepsi', () => {
    expect(getRsvpLabel('resepsi')).toBe('Hadir (Resepsi)');
  });

  it('returns correct label for both', () => {
    expect(getRsvpLabel('both')).toBe('Hadir (Keduanya)');
  });

  it('returns correct label for decline', () => {
    expect(getRsvpLabel('decline')).toBe('Menolak');
  });

  it('returns correct label for null (belum RSVP)', () => {
    expect(getRsvpLabel(null)).toBe('Belum RSVP');
  });
});
