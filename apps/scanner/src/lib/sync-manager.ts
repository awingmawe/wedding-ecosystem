/**
 * Sync manager for auto-syncing queued check-in records on reconnect.
 * Syncs in chronological order by checked_in_at within 30 seconds.
 * Applies idempotency — server ignores duplicates without error.
 */

import { getPendingCheckIns, markRecordsSynced, cleanupSyncedRecords } from './offline-queue';
import { cacheGuests, clearGuestCache, type CachedGuest } from './indexed-db';

const SYNC_TIMEOUT_MS = 30_000; // 30 seconds max for sync
const BATCH_SIZE = 50; // Sync in batches to avoid overwhelming the server

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface SyncResult {
  synced: number;
  failed: number;
  duplicatesIgnored: number;
}

interface SyncCallbacks {
  onStatusChange?: (status: SyncStatus) => void;
  onProgress?: (synced: number, total: number) => void;
  onComplete?: (result: SyncResult) => void;
  onError?: (error: Error) => void;
}

let isSyncing = false;
let syncTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * Sync all pending check-in records to the server.
 * Records are sent in chronological order by checked_in_at.
 * Idempotency: server returns success even for duplicates.
 */
export async function syncPendingCheckIns(
  apiBaseUrl: string,
  authToken: string,
  callbacks?: SyncCallbacks
): Promise<SyncResult> {
  if (isSyncing) {
    return { synced: 0, failed: 0, duplicatesIgnored: 0 };
  }

  isSyncing = true;
  callbacks?.onStatusChange?.('syncing');

  const result: SyncResult = { synced: 0, failed: 0, duplicatesIgnored: 0 };

  try {
    const pendingRecords = await getPendingCheckIns();

    if (pendingRecords.length === 0) {
      callbacks?.onStatusChange?.('success');
      callbacks?.onComplete?.(result);
      return result;
    }

    // Process in batches, chronologically ordered (already sorted by checkedInAt index)
    for (let i = 0; i < pendingRecords.length; i += BATCH_SIZE) {
      const batch = pendingRecords.slice(i, i + BATCH_SIZE);

      try {
        const response = await fetchWithTimeout(
          `${apiBaseUrl}/check-in/sync`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              checkIns: batch.map((record) => ({
                guestId: record.guestId,
                qrPayload: record.qrPayload,
                method: record.method,
                checkedInAt: record.checkedInAt,
                eventId: record.eventId,
              })),
            }),
          },
          SYNC_TIMEOUT_MS
        );

        if (response.ok) {
          const data = await response.json();
          const syncedIds = batch.map((r) => r.id);
          await markRecordsSynced(syncedIds);

          result.synced += data.synced || batch.length;
          result.duplicatesIgnored += data.duplicatesIgnored || 0;
        } else if (response.status === 409) {
          // All duplicates — mark as synced (idempotency)
          const syncedIds = batch.map((r) => r.id);
          await markRecordsSynced(syncedIds);
          result.duplicatesIgnored += batch.length;
        } else {
          result.failed += batch.length;
        }
      } catch {
        // Network error for this batch — stop syncing
        result.failed += pendingRecords.length - i;
        break;
      }

      callbacks?.onProgress?.(result.synced + result.duplicatesIgnored, pendingRecords.length);
    }

    // Clean up synced records to free space
    if (result.synced > 0 || result.duplicatesIgnored > 0) {
      await cleanupSyncedRecords();
    }

    callbacks?.onStatusChange?.(result.failed > 0 ? 'error' : 'success');
    callbacks?.onComplete?.(result);
    return result;
  } catch (error) {
    callbacks?.onStatusChange?.('error');
    callbacks?.onError?.(error instanceof Error ? error : new Error('Sync failed'));
    return result;
  } finally {
    isSyncing = false;
  }
}

/**
 * Refresh the local guest cache from the server.
 * Called on connectivity restore and before event start.
 */
export async function refreshGuestCache(
  apiBaseUrl: string,
  authToken: string,
  eventId: string
): Promise<void> {
  try {
    const response = await fetchWithTimeout(
      `${apiBaseUrl}/guests/cache?eventId=${eventId}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
      SYNC_TIMEOUT_MS
    );

    if (response.ok) {
      const data = await response.json();
      const guests: CachedGuest[] = (data.guests || []).map((g: Record<string, unknown>) => ({
        id: g.id as string,
        name: g.name as string,
        qrPayload: g.qrPayload as string,
        group: g.group as string,
        checkedIn: g.checkedIn as boolean,
        checkedInAt: g.checkedInAt as string | undefined,
        eventId: g.eventId as string,
      }));

      // Replace entire cache with fresh data
      await clearGuestCache();
      await cacheGuests(guests);
    }
  } catch {
    // Silently fail — keep existing cache
    console.warn('[SyncManager] Failed to refresh guest cache');
  }
}

/**
 * Schedule auto-sync when connectivity is restored.
 * Must complete within 30 seconds per requirement.
 */
export function scheduleSync(
  apiBaseUrl: string,
  authToken: string,
  eventId: string,
  callbacks?: SyncCallbacks
): void {
  // Clear any existing scheduled sync
  if (syncTimeoutId) {
    clearTimeout(syncTimeoutId);
  }

  // Start sync immediately on reconnect
  syncTimeoutId = setTimeout(async () => {
    await syncPendingCheckIns(apiBaseUrl, authToken, callbacks);
    await refreshGuestCache(apiBaseUrl, authToken, eventId);
  }, 100); // Small delay to ensure connection is stable
}

/**
 * Cancel any scheduled sync.
 */
export function cancelSync(): void {
  if (syncTimeoutId) {
    clearTimeout(syncTimeoutId);
    syncTimeoutId = null;
  }
}

/**
 * Fetch with timeout to ensure sync completes within 30 seconds.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}
