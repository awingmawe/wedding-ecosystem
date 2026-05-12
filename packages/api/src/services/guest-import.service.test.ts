import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseCSV,
  validateRow,
  bulkImportGuests,
  CSVRow,
  IMPORT_CONSTANTS,
} from './guest-import.service';
import {
  GuestService,
  GuestRepository,
  GuestRecord,
  QRCodeRecord,
} from './guest.service';
import { GuestGroup, GuestType, DeliveryStatus, ErrorCode } from '@wedding/shared';

// --- Test Helpers ---

const TEST_ENCRYPTION_KEY =
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

function createMockRepository(): GuestRepository {
  return {
    createGuest: vi.fn(),
    createQRCode: vi.fn(),
    findGuestById: vi.fn(),
    findGuestBySlug: vi.fn(),
    findGuestsByEvent: vi.fn(),
    updateGuest: vi.fn(),
    deleteGuest: vi.fn(),
    deactivateQRCode: vi.fn(),
    findQRCodeByGuestId: vi.fn(),
    checkSlugExists: vi.fn(),
    checkQRPayloadExists: vi.fn(),
    findEventById: vi.fn(),
  };
}

function createMockGuestRecord(name: string): GuestRecord {
  return {
    id: `guest-${name.toLowerCase().replace(/\s/g, '-')}`,
    event_id: 'event-001',
    tenant_id: 'tenant-001',
    name,
    slug: name.toLowerCase().replace(/\s/g, '-'),
    phone: null,
    email: null,
    group: GuestGroup.FRIEND,
    type: GuestType.INVITED,
    plus_one_count: 0,
    invitation_url: `/wedding?to=${name.toLowerCase().replace(/\s/g, '-')}`,
    delivery_status: DeliveryStatus.NOT_SENT,
    created_at: new Date('2024-01-01'),
  };
}

function createMockQRCode(guestId: string): QRCodeRecord {
  return {
    id: `qr-${guestId}`,
    guest_id: guestId,
    qr_payload: 'abc123:encrypted_data',
    qr_image_url: null,
    is_active: true,
    generated_at: new Date('2024-01-01'),
  };
}

function setupMockService(): { service: GuestService; repository: GuestRepository } {
  const repository = createMockRepository();
  const service = new GuestService({
    repository,
    encryptionKey: TEST_ENCRYPTION_KEY,
  });

  // Default mock implementations
  vi.mocked(repository.findEventById).mockResolvedValue({
    id: 'event-001',
    slug: 'wedding-event',
  });
  vi.mocked(repository.checkSlugExists).mockResolvedValue(false);
  vi.mocked(repository.checkQRPayloadExists).mockResolvedValue(false);
  vi.mocked(repository.createGuest).mockImplementation(async (data) => ({
    ...data,
    created_at: new Date(),
  }));
  vi.mocked(repository.createQRCode).mockImplementation(async (data) => ({
    ...data,
    qr_image_url: null,
    generated_at: new Date(),
  }));

  return { service, repository };
}

// --- Tests ---

describe('Guest CSV Import Service', () => {
  describe('parseCSV', () => {
    it('should parse basic CSV with headers and data rows', () => {
      const csv = 'nama,grup,phone\nJohn Doe,friend,+6281234567890\nJane Smith,family,';
      const result = parseCSV(csv);

      expect(result.headers).toEqual(['nama', 'grup', 'phone']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({
        nama: 'John Doe',
        grup: 'friend',
        phone: '+6281234567890',
      });
      expect(result.rows[1]).toEqual({
        nama: 'Jane Smith',
        grup: 'family',
      });
    });

    it('should handle quoted fields with commas', () => {
      const csv = 'nama,grup\n"Doe, John",friend\nJane,family';
      const result = parseCSV(csv);

      expect(result.rows[0].nama).toBe('Doe, John');
    });

    it('should handle escaped quotes within quoted fields', () => {
      const csv = 'nama,grup\n"John ""JD"" Doe",friend';
      const result = parseCSV(csv);

      expect(result.rows[0].nama).toBe('John "JD" Doe');
    });

    it('should normalize headers to lowercase', () => {
      const csv = 'Nama,GRUP,Phone\nJohn,friend,123';
      const result = parseCSV(csv);

      expect(result.headers).toEqual(['nama', 'grup', 'phone']);
      expect(result.rows[0].nama).toBe('John');
    });

    it('should skip empty lines', () => {
      const csv = 'nama,grup\nJohn,friend\n\nJane,family\n';
      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(2);
    });

    it('should handle Windows-style line endings (CRLF)', () => {
      const csv = 'nama,grup\r\nJohn,friend\r\nJane,family';
      const result = parseCSV(csv);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].nama).toBe('John');
      expect(result.rows[1].nama).toBe('Jane');
    });

    it('should return empty rows for empty CSV', () => {
      const result = parseCSV('');
      expect(result.rows).toHaveLength(0);
      expect(result.headers).toHaveLength(0);
    });

    it('should handle CSV with only headers', () => {
      const csv = 'nama,grup,phone';
      const result = parseCSV(csv);

      expect(result.headers).toEqual(['nama', 'grup', 'phone']);
      expect(result.rows).toHaveLength(0);
    });

    it('should handle all optional columns', () => {
      const csv = 'nama,grup,phone,email,plus_one_count\nJohn,friend,+62812,john@test.com,2';
      const result = parseCSV(csv);

      expect(result.rows[0]).toEqual({
        nama: 'John',
        grup: 'friend',
        phone: '+62812',
        email: 'john@test.com',
        plus_one_count: '2',
      });
    });
  });

  describe('validateRow', () => {
    it('should validate a valid row', () => {
      const row: CSVRow = { nama: 'John Doe', grup: 'friend' };
      const result = validateRow(row, new Set());

      expect(typeof result).not.toBe('string');
      if (typeof result !== 'string') {
        expect(result.name).toBe('John Doe');
        expect(result.group).toBe(GuestGroup.FRIEND);
        expect(result.plus_one_count).toBe(0);
      }
    });

    it('should reject empty name', () => {
      const row: CSVRow = { nama: '', grup: 'friend' };
      const result = validateRow(row, new Set());

      expect(result).toBe('Nama tidak boleh kosong');
    });

    it('should reject missing name', () => {
      const row: CSVRow = { grup: 'friend' };
      const result = validateRow(row, new Set());

      expect(result).toBe('Nama tidak boleh kosong');
    });

    it('should reject empty group', () => {
      const row: CSVRow = { nama: 'John', grup: '' };
      const result = validateRow(row, new Set());

      expect(result).toBe('Grup tidak boleh kosong');
    });

    it('should reject invalid group enum', () => {
      const row: CSVRow = { nama: 'John', grup: 'invalid_group' };
      const result = validateRow(row, new Set());

      expect(typeof result).toBe('string');
      expect(result as string).toContain('Grup tidak valid');
      expect(result as string).toContain('invalid_group');
    });

    it('should accept all valid group values', () => {
      const groups = ['family', 'friend', 'colleague', 'vip'];
      for (const group of groups) {
        const row: CSVRow = { nama: `Guest ${group}`, grup: group };
        const result = validateRow(row, new Set());
        expect(typeof result).not.toBe('string');
      }
    });

    it('should be case-insensitive for group validation', () => {
      const row: CSVRow = { nama: 'John', grup: 'FRIEND' };
      const result = validateRow(row, new Set());

      expect(typeof result).not.toBe('string');
      if (typeof result !== 'string') {
        expect(result.group).toBe(GuestGroup.FRIEND);
      }
    });

    it('should detect duplicate names within event (case-insensitive)', () => {
      const existingNames = new Set(['john doe']);
      const row: CSVRow = { nama: 'John Doe', grup: 'friend' };
      const result = validateRow(row, existingNames);

      expect(typeof result).toBe('string');
      expect(result as string).toContain('Duplikat nama');
    });

    it('should validate plus_one_count as integer >= 0', () => {
      const row: CSVRow = { nama: 'John', grup: 'friend', plus_one_count: '-1' };
      const result = validateRow(row, new Set());

      expect(typeof result).toBe('string');
      expect(result as string).toContain('plus_one_count tidak valid');
    });

    it('should reject plus_one_count > 10', () => {
      const row: CSVRow = { nama: 'John', grup: 'friend', plus_one_count: '11' };
      const result = validateRow(row, new Set());

      expect(typeof result).toBe('string');
      expect(result as string).toContain('melebihi batas maksimal 10');
    });

    it('should reject non-numeric plus_one_count', () => {
      const row: CSVRow = { nama: 'John', grup: 'friend', plus_one_count: 'abc' };
      const result = validateRow(row, new Set());

      expect(typeof result).toBe('string');
      expect(result as string).toContain('plus_one_count tidak valid');
    });

    it('should accept valid plus_one_count', () => {
      const row: CSVRow = { nama: 'John', grup: 'friend', plus_one_count: '3' };
      const result = validateRow(row, new Set());

      expect(typeof result).not.toBe('string');
      if (typeof result !== 'string') {
        expect(result.plus_one_count).toBe(3);
      }
    });

    it('should handle optional fields gracefully', () => {
      const row: CSVRow = { nama: 'John', grup: 'vip', phone: '+62812', email: 'j@t.com' };
      const result = validateRow(row, new Set());

      expect(typeof result).not.toBe('string');
      if (typeof result !== 'string') {
        expect(result.phone).toBe('+62812');
        expect(result.email).toBe('j@t.com');
      }
    });

    it('should trim whitespace from name and group', () => {
      const row: CSVRow = { nama: '  John Doe  ', grup: '  friend  ' };
      const result = validateRow(row, new Set());

      expect(typeof result).not.toBe('string');
      if (typeof result !== 'string') {
        expect(result.name).toBe('John Doe');
        expect(result.group).toBe(GuestGroup.FRIEND);
      }
    });
  });

  describe('bulkImportGuests', () => {
    let service: GuestService;
    let repository: GuestRepository;

    beforeEach(() => {
      const setup = setupMockService();
      service = setup.service;
      repository = setup.repository;
    });

    it('should import valid CSV rows and return success count', async () => {
      const csv = 'nama,grup\nJohn Doe,friend\nJane Smith,family';

      const report = await bulkImportGuests(
        { eventId: 'event-001', tenantId: 'tenant-001', csvText: csv },
        service,
        []
      );

      expect(report.successCount).toBe(2);
      expect(report.failedRows).toHaveLength(0);
    });

    it('should report missing required columns', async () => {
      const csv = 'name,group\nJohn,friend'; // Wrong column names

      const report = await bulkImportGuests(
        { eventId: 'event-001', tenantId: 'tenant-001', csvText: csv },
        service,
        []
      );

      expect(report.successCount).toBe(0);
      expect(report.failedRows).toHaveLength(1);
      expect(report.failedRows[0].row).toBe(0);
      expect(report.failedRows[0].reason).toContain('Kolom wajib tidak ditemukan');
    });

    it('should reject CSV exceeding max rows (2000)', async () => {
      // Create CSV with 2001 rows
      let csv = 'nama,grup\n';
      for (let i = 0; i < 2001; i++) {
        csv += `Guest ${i},friend\n`;
      }

      const report = await bulkImportGuests(
        { eventId: 'event-001', tenantId: 'tenant-001', csvText: csv },
        service,
        []
      );

      expect(report.successCount).toBe(0);
      expect(report.failedRows).toHaveLength(1);
      expect(report.failedRows[0].reason).toContain('melebihi batas maksimal');
    });

    it('should skip invalid rows without stopping import (Req 3.4)', async () => {
      const csv = 'nama,grup\nJohn Doe,friend\n,friend\nJane Smith,invalid_group\nBob,vip';

      const report = await bulkImportGuests(
        { eventId: 'event-001', tenantId: 'tenant-001', csvText: csv },
        service,
        []
      );

      // John Doe and Bob should succeed
      expect(report.successCount).toBe(2);
      // Row 3 (empty name) and Row 4 (invalid group) should fail
      expect(report.failedRows).toHaveLength(2);
      expect(report.failedRows[0].row).toBe(3);
      expect(report.failedRows[0].reason).toContain('Nama tidak boleh kosong');
      expect(report.failedRows[1].row).toBe(4);
      expect(report.failedRows[1].reason).toContain('Grup tidak valid');
    });

    it('should detect duplicate names within the import batch', async () => {
      const csv = 'nama,grup\nJohn Doe,friend\nJohn Doe,family';

      const report = await bulkImportGuests(
        { eventId: 'event-001', tenantId: 'tenant-001', csvText: csv },
        service,
        []
      );

      expect(report.successCount).toBe(1);
      expect(report.failedRows).toHaveLength(1);
      expect(report.failedRows[0].row).toBe(3);
      expect(report.failedRows[0].reason).toContain('Duplikat nama');
    });

    it('should detect duplicate names against existing guests in event', async () => {
      const csv = 'nama,grup\nExisting Guest,friend\nNew Guest,family';

      const report = await bulkImportGuests(
        { eventId: 'event-001', tenantId: 'tenant-001', csvText: csv },
        service,
        ['Existing Guest'] // Already exists in event
      );

      expect(report.successCount).toBe(1);
      expect(report.failedRows).toHaveLength(1);
      expect(report.failedRows[0].row).toBe(2);
      expect(report.failedRows[0].reason).toContain('Duplikat nama');
    });

    it('should generate QR code for each valid guest (Req 3.3)', async () => {
      const csv = 'nama,grup\nGuest One,friend\nGuest Two,vip';

      await bulkImportGuests(
        { eventId: 'event-001', tenantId: 'tenant-001', csvText: csv },
        service,
        []
      );

      // createQRCode should be called for each successful guest
      expect(repository.createQRCode).toHaveBeenCalledTimes(2);
    });

    it('should handle all optional columns in CSV', async () => {
      const csv =
        'nama,grup,phone,email,plus_one_count\nJohn Doe,friend,+6281234567890,john@test.com,2';

      const report = await bulkImportGuests(
        { eventId: 'event-001', tenantId: 'tenant-001', csvText: csv },
        service,
        []
      );

      expect(report.successCount).toBe(1);
      expect(repository.createGuest).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'John Doe',
          group: GuestGroup.FRIEND,
          phone: '+6281234567890',
          email: 'john@test.com',
          plus_one_count: 2,
        })
      );
    });

    it('should report row numbers correctly (1-indexed, header is row 1)', async () => {
      const csv = 'nama,grup\nValid,friend\n,friend\nAlso Valid,vip\n,family';

      const report = await bulkImportGuests(
        { eventId: 'event-001', tenantId: 'tenant-001', csvText: csv },
        service,
        []
      );

      expect(report.successCount).toBe(2);
      expect(report.failedRows[0].row).toBe(3); // 3rd line in file (2nd data row)
      expect(report.failedRows[1].row).toBe(5); // 5th line in file (4th data row)
    });

    it('should handle service errors gracefully', async () => {
      // Make the event not found for the second call
      vi.mocked(repository.findEventById)
        .mockResolvedValueOnce({ id: 'event-001', slug: 'wedding' })
        .mockResolvedValueOnce(null);

      const csv = 'nama,grup\nGuest One,friend\nGuest Two,family';

      const report = await bulkImportGuests(
        { eventId: 'event-001', tenantId: 'tenant-001', csvText: csv },
        service,
        []
      );

      // First guest succeeds, second fails because event not found
      expect(report.successCount).toBe(1);
      expect(report.failedRows).toHaveLength(1);
      expect(report.failedRows[0].reason).toContain('Event tidak ditemukan');
    });

    it('should handle empty CSV gracefully', async () => {
      const csv = '';

      const report = await bulkImportGuests(
        { eventId: 'event-001', tenantId: 'tenant-001', csvText: csv },
        service,
        []
      );

      expect(report.successCount).toBe(0);
      expect(report.failedRows).toHaveLength(1);
      expect(report.failedRows[0].reason).toContain('Kolom wajib tidak ditemukan');
    });

    it('should handle CSV with only headers (no data rows)', async () => {
      const csv = 'nama,grup';

      const report = await bulkImportGuests(
        { eventId: 'event-001', tenantId: 'tenant-001', csvText: csv },
        service,
        []
      );

      expect(report.successCount).toBe(0);
      expect(report.failedRows).toHaveLength(0);
    });

    it('should accept exactly 2000 rows', async () => {
      let csv = 'nama,grup\n';
      for (let i = 0; i < 2000; i++) {
        csv += `Guest ${i},friend\n`;
      }

      const report = await bulkImportGuests(
        { eventId: 'event-001', tenantId: 'tenant-001', csvText: csv },
        service,
        []
      );

      // Should not reject for row count
      expect(
        report.failedRows.some((r) => r.reason.includes('melebihi batas'))
      ).toBe(false);
      expect(report.successCount).toBe(2000);
    });

    it('should handle duplicate detection case-insensitively', async () => {
      const csv = 'nama,grup\njohn doe,friend\nJOHN DOE,family';

      const report = await bulkImportGuests(
        { eventId: 'event-001', tenantId: 'tenant-001', csvText: csv },
        service,
        []
      );

      expect(report.successCount).toBe(1);
      expect(report.failedRows).toHaveLength(1);
      expect(report.failedRows[0].reason).toContain('Duplikat nama');
    });
  });
});
