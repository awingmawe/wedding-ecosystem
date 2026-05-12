/**
 * IndexedDB wrapper for local guest data cache and offline check-in queue.
 * Stores guest data (name, QR payload, check-in status) for offline verification.
 * Stores check-in records in an offline queue with 2000 entry capacity.
 */

const DB_NAME = 'wedding-scanner-db';
const DB_VERSION = 1;

// Store names
const GUEST_STORE = 'guests';
const CHECKIN_QUEUE_STORE = 'checkin-queue';
const META_STORE = 'meta';

export interface CachedGuest {
  id: string;
  name: string;
  qrPayload: string;
  group: string;
  checkedIn: boolean;
  checkedInAt?: string;
  eventId: string;
}

export interface QueuedCheckIn {
  id: string; // unique ID for this queue entry
  guestId: string;
  qrPayload: string;
  method: 'qr_scan' | 'manual' | 'go_show';
  checkedInAt: string; // ISO timestamp when scan was performed
  synced: boolean;
  syncedAt?: string;
  eventId: string;
  guestName?: string;
}

export interface MetaData {
  key: string;
  value: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Guest cache store
      if (!db.objectStoreNames.contains(GUEST_STORE)) {
        const guestStore = db.createObjectStore(GUEST_STORE, { keyPath: 'id' });
        guestStore.createIndex('qrPayload', 'qrPayload', { unique: true });
        guestStore.createIndex('eventId', 'eventId', { unique: false });
        guestStore.createIndex('name', 'name', { unique: false });
      }

      // Check-in queue store
      if (!db.objectStoreNames.contains(CHECKIN_QUEUE_STORE)) {
        const queueStore = db.createObjectStore(CHECKIN_QUEUE_STORE, { keyPath: 'id' });
        queueStore.createIndex('synced', 'synced', { unique: false });
        queueStore.createIndex('checkedInAt', 'checkedInAt', { unique: false });
        queueStore.createIndex('guestId', 'guestId', { unique: false });
      }

      // Meta store for last sync time, etc.
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
  });
}

// ============ Guest Cache Operations ============

export async function cacheGuests(guests: CachedGuest[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(GUEST_STORE, 'readwrite');
  const store = tx.objectStore(GUEST_STORE);

  for (const guest of guests) {
    store.put(guest);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedGuestByQR(qrPayload: string): Promise<CachedGuest | undefined> {
  const db = await openDB();
  const tx = db.transaction(GUEST_STORE, 'readonly');
  const store = tx.objectStore(GUEST_STORE);
  const index = store.index('qrPayload');

  return new Promise((resolve, reject) => {
    const request = index.get(qrPayload);
    request.onsuccess = () => resolve(request.result || undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedGuestById(guestId: string): Promise<CachedGuest | undefined> {
  const db = await openDB();
  const tx = db.transaction(GUEST_STORE, 'readonly');
  const store = tx.objectStore(GUEST_STORE);

  return new Promise((resolve, reject) => {
    const request = store.get(guestId);
    request.onsuccess = () => resolve(request.result || undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function searchCachedGuests(query: string, eventId: string): Promise<CachedGuest[]> {
  const db = await openDB();
  const tx = db.transaction(GUEST_STORE, 'readonly');
  const store = tx.objectStore(GUEST_STORE);
  const index = store.index('eventId');

  return new Promise((resolve, reject) => {
    const results: CachedGuest[] = [];
    const request = index.openCursor(IDBKeyRange.only(eventId));
    const lowerQuery = query.toLowerCase();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const guest = cursor.value as CachedGuest;
        if (guest.name.toLowerCase().includes(lowerQuery)) {
          results.push(guest);
        }
        if (results.length < 10) {
          cursor.continue();
        } else {
          resolve(results);
        }
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function updateCachedGuestCheckIn(guestId: string, checkedInAt: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(GUEST_STORE, 'readwrite');
  const store = tx.objectStore(GUEST_STORE);

  return new Promise((resolve, reject) => {
    const getRequest = store.get(guestId);
    getRequest.onsuccess = () => {
      const guest = getRequest.result;
      if (guest) {
        guest.checkedIn = true;
        guest.checkedInAt = checkedInAt;
        store.put(guest);
      }
      resolve();
    };
    getRequest.onerror = () => reject(getRequest.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearGuestCache(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(GUEST_STORE, 'readwrite');
  const store = tx.objectStore(GUEST_STORE);
  store.clear();

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============ Check-in Queue Operations ============

const MAX_QUEUE_SIZE = 2000;

export async function getQueueSize(): Promise<number> {
  const db = await openDB();
  const tx = db.transaction(CHECKIN_QUEUE_STORE, 'readonly');
  const store = tx.objectStore(CHECKIN_QUEUE_STORE);

  return new Promise((resolve, reject) => {
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addToQueue(checkIn: QueuedCheckIn): Promise<{ success: boolean; overflowWarning: boolean }> {
  const db = await openDB();
  const currentSize = await getQueueSize();

  if (currentSize >= MAX_QUEUE_SIZE) {
    // Overflow handling: try to overwrite oldest synced records
    const overwritten = await overwriteOldestSynced(db, checkIn);
    if (!overwritten) {
      // All records are unsynced — show warning but still allow scanning
      // Force add by overwriting the oldest entry regardless
      await forceAddToQueue(db, checkIn);
      return { success: true, overflowWarning: true };
    }
    return { success: true, overflowWarning: false };
  }

  const tx = db.transaction(CHECKIN_QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(CHECKIN_QUEUE_STORE);
  store.put(checkIn);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve({ success: true, overflowWarning: false });
    tx.onerror = () => reject(tx.error);
  });
}

async function overwriteOldestSynced(db: IDBDatabase, newCheckIn: QueuedCheckIn): Promise<boolean> {
  const tx = db.transaction(CHECKIN_QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(CHECKIN_QUEUE_STORE);
  const index = store.index('synced');

  return new Promise((resolve, reject) => {
    // Find oldest synced record
    const request = index.openCursor(IDBKeyRange.only(1)); // synced = true (stored as 1)
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        // Delete the oldest synced record and add the new one
        cursor.delete();
        store.put(newCheckIn);
        resolve(true);
      } else {
        // No synced records to overwrite
        resolve(false);
      }
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => {}; // handled by cursor
  });
}

async function forceAddToQueue(db: IDBDatabase, newCheckIn: QueuedCheckIn): Promise<void> {
  const tx = db.transaction(CHECKIN_QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(CHECKIN_QUEUE_STORE);
  const index = store.index('checkedInAt');

  return new Promise((resolve, reject) => {
    // Delete the oldest record (by checkedInAt timestamp)
    const request = index.openCursor();
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        store.put(newCheckIn);
      }
      resolve();
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
  });
}

export async function getUnsyncedCheckIns(): Promise<QueuedCheckIn[]> {
  const db = await openDB();
  const tx = db.transaction(CHECKIN_QUEUE_STORE, 'readonly');
  const store = tx.objectStore(CHECKIN_QUEUE_STORE);
  const index = store.index('checkedInAt');

  return new Promise((resolve, reject) => {
    const results: QueuedCheckIn[] = [];
    const request = index.openCursor();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const record = cursor.value as QueuedCheckIn;
        if (!record.synced) {
          results.push(record);
        }
        cursor.continue();
      } else {
        // Results are already in chronological order (by checkedInAt index)
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function markAsSynced(ids: string[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(CHECKIN_QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(CHECKIN_QUEUE_STORE);

  for (const id of ids) {
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const record = getRequest.result;
      if (record) {
        record.synced = true;
        record.syncedAt = new Date().toISOString();
        store.put(record);
      }
    };
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearSyncedRecords(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(CHECKIN_QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(CHECKIN_QUEUE_STORE);

  return new Promise((resolve, reject) => {
    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const record = cursor.value as QueuedCheckIn;
        if (record.synced) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============ Meta Operations ============

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(META_STORE, 'readwrite');
  const store = tx.objectStore(META_STORE);
  store.put({ key, value });

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMeta(key: string): Promise<string | undefined> {
  const db = await openDB();
  const tx = db.transaction(META_STORE, 'readonly');
  const store = tx.objectStore(META_STORE);

  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}
