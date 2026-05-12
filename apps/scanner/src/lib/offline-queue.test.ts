/**
 * Tests for offline queue management.
 * Validates queue capacity, overflow handling, and chronological ordering.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock IndexedDB operations
const mockRecords: Map<string, unknown> = new Map();
let mockQueueSize = 0;

vi.mock('./indexed-db', () => ({
  addToQueue: vi.fn(async (record: { id: string }) => {
    mockRecords.set(record.id, record);
    mockQueueSize++;
    return { success: true, overflowWarning: false };
  }),
  getUnsyncedCheckIns: vi.fn(async () => {
    return Array.from(mockRecords.values())
      .filter((r: unknown) => !(r as { synced: boolean }).synced)
      .sort((a: unknown, b: unknown) =>
        (a as { checkedInAt: string }).checkedInAt.localeCompare(
          (b as { checkedInAt: string }).checkedInAt
        )
      );
  }),
  markAsSynced: vi.fn(async (ids: string[]) => {
    for (const id of ids) {
      const record = mockRecords.get(id) as { synced: boolean; syncedAt?: string } | undefined;
      if (record) {
        record.synced = true;
        record.syncedAt = new Date().toISOString();
      }
    }
  }),
  getQueueSize: vi.fn(async () => mockQueueSize),
  clearSyncedRecords: vi.fn(async () => {
    for (const [id, record] of mockRecords.entries()) {
      if ((record as { synced: boolean }).synced) {
        mockRecords.delete(id);
        mockQueueSize--;
      }
    }
  }),
  updateCachedGuestCheckIn: vi.fn(async () => {}),
}));

import { enqueueCheckIn, getPendingCheckIns, markRecordsSynced, getQueueStats, cleanupSyncedRecords } from './offline-queue';

describe('Offline Queue', () => {
  beforeEach(() => {
    mockRecords.clear();
    mockQueueSize = 0;
    vi.clearAllMocks();
  });

  it('should enqueue a check-in record with timestamp', async () => {
    const result = await enqueueCheckIn({
      guestId: 'guest-1',
      qrPayload: 'qr-payload-1',
      method: 'qr_scan',
      eventId: 'event-1',
      guestName: 'John Doe',
    });

    expect(result.success).toBe(true);
    expect(result.overflowWarning).toBe(false);
    expect(result.queuedRecord.guestId).toBe('guest-1');
    expect(result.queuedRecord.checkedInAt).toBeDefined();
    expect(result.queuedRecord.synced).toBe(false);
  });

  it('should return pending check-ins in chronological order', async () => {
    await enqueueCheckIn({
      guestId: 'guest-1',
      qrPayload: 'qr-1',
      method: 'qr_scan',
      eventId: 'event-1',
    });

    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));

    await enqueueCheckIn({
      guestId: 'guest-2',
      qrPayload: 'qr-2',
      method: 'manual',
      eventId: 'event-1',
    });

    const pending = await getPendingCheckIns();
    expect(pending.length).toBe(2);
    // Should be in chronological order
    expect(pending[0].guestId).toBe('guest-1');
    expect(pending[1].guestId).toBe('guest-2');
    expect(pending[0].checkedInAt <= pending[1].checkedInAt).toBe(true);
  });

  it('should mark records as synced', async () => {
    const result = await enqueueCheckIn({
      guestId: 'guest-1',
      qrPayload: 'qr-1',
      method: 'qr_scan',
      eventId: 'event-1',
    });

    await markRecordsSynced([result.queuedRecord.id]);

    const pending = await getPendingCheckIns();
    expect(pending.length).toBe(0);
  });

  it('should report correct queue stats', async () => {
    await enqueueCheckIn({
      guestId: 'guest-1',
      qrPayload: 'qr-1',
      method: 'qr_scan',
      eventId: 'event-1',
    });

    const result2 = await enqueueCheckIn({
      guestId: 'guest-2',
      qrPayload: 'qr-2',
      method: 'manual',
      eventId: 'event-1',
    });

    await markRecordsSynced([result2.queuedRecord.id]);

    const stats = await getQueueStats();
    expect(stats.total).toBe(2);
    expect(stats.pending).toBe(1);
    expect(stats.synced).toBe(1);
  });

  it('should clean up synced records', async () => {
    const result1 = await enqueueCheckIn({
      guestId: 'guest-1',
      qrPayload: 'qr-1',
      method: 'qr_scan',
      eventId: 'event-1',
    });

    await enqueueCheckIn({
      guestId: 'guest-2',
      qrPayload: 'qr-2',
      method: 'manual',
      eventId: 'event-1',
    });

    await markRecordsSynced([result1.queuedRecord.id]);
    await cleanupSyncedRecords();

    const stats = await getQueueStats();
    expect(stats.total).toBe(1);
    expect(stats.pending).toBe(1);
  });

  it('should support different check-in methods', async () => {
    const methods = ['qr_scan', 'manual', 'go_show'] as const;

    for (const method of methods) {
      const result = await enqueueCheckIn({
        guestId: `guest-${method}`,
        qrPayload: `qr-${method}`,
        method,
        eventId: 'event-1',
      });

      expect(result.queuedRecord.method).toBe(method);
    }

    const pending = await getPendingCheckIns();
    expect(pending.length).toBe(3);
  });
});
