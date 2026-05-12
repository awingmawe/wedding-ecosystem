/**
 * Offline queue manager for check-in records.
 * Handles capacity of 2000 entries with overflow handling.
 * Records are stored with timestamps for chronological sync.
 */

import {
  addToQueue,
  getUnsyncedCheckIns,
  markAsSynced,
  getQueueSize,
  clearSyncedRecords,
  updateCachedGuestCheckIn,
  type QueuedCheckIn,
} from './indexed-db';

export interface CheckInRecord {
  guestId: string;
  qrPayload: string;
  method: 'qr_scan' | 'manual' | 'go_show';
  eventId: string;
  guestName?: string;
}

/**
 * Generate a unique ID for queue entries
 */
function generateQueueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Add a check-in record to the offline queue.
 * Returns overflow warning if capacity is reached and no synced records can be overwritten.
 */
export async function enqueueCheckIn(record: CheckInRecord): Promise<{
  success: boolean;
  overflowWarning: boolean;
  queuedRecord: QueuedCheckIn;
}> {
  const checkedInAt = new Date().toISOString();
  const queuedRecord: QueuedCheckIn = {
    id: generateQueueId(),
    guestId: record.guestId,
    qrPayload: record.qrPayload,
    method: record.method,
    checkedInAt,
    synced: false,
    eventId: record.eventId,
    guestName: record.guestName,
  };

  const result = await addToQueue(queuedRecord);

  // Also update the local guest cache to reflect check-in
  await updateCachedGuestCheckIn(record.guestId, checkedInAt);

  return {
    success: result.success,
    overflowWarning: result.overflowWarning,
    queuedRecord,
  };
}

/**
 * Get all unsynced check-in records in chronological order (by checked_in_at).
 */
export async function getPendingCheckIns(): Promise<QueuedCheckIn[]> {
  return getUnsyncedCheckIns();
}

/**
 * Mark records as successfully synced.
 */
export async function markRecordsSynced(ids: string[]): Promise<void> {
  await markAsSynced(ids);
}

/**
 * Get current queue statistics.
 */
export async function getQueueStats(): Promise<{
  total: number;
  pending: number;
  synced: number;
}> {
  const total = await getQueueSize();
  const pending = await getUnsyncedCheckIns();
  return {
    total,
    pending: pending.length,
    synced: total - pending.length,
  };
}

/**
 * Clean up synced records to free space.
 * Called after successful sync to maintain capacity.
 */
export async function cleanupSyncedRecords(): Promise<void> {
  await clearSyncedRecords();
}
