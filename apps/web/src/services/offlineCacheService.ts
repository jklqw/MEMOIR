import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MemoryItemResponse } from '@memoir/shared';

export interface SyncQueueItem {
  queueId?: number;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  memoryId: string;
  timestamp: number;
  payload?: Record<string, unknown>; // Encrypted ciphertext envelope DTO — NEVER PLAINTEXT
  status: 'PENDING' | 'SYNCING' | 'FAILED';
  retryCount: number;
  error?: string | null;
}

export interface CachedEncryptedMemory extends MemoryItemResponse {
  cachedAt: number;
}

export interface MemoirOfflineDBSchema extends DBSchema {
  encrypted_memories: {
    key: string;
    value: CachedEncryptedMemory;
    indexes: { 'by-entryDate': string };
  };
  offline_sync_queue: {
    key: number;
    value: SyncQueueItem;
    indexes: { 'by-status': string; 'by-timestamp': number };
  };
}

const DB_NAME = 'memoir-offline-store-v1';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MemoirOfflineDBSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<MemoirOfflineDBSchema>> {
  if (typeof indexedDB === 'undefined') {
    // In environments without indexedDB (e.g. Node tests without mock), return dummy or fail gracefully
    throw new Error('IndexedDB is not available in this environment.');
  }

  if (!dbPromise) {
    dbPromise = openDB<MemoirOfflineDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('encrypted_memories')) {
          const memStore = db.createObjectStore('encrypted_memories', { keyPath: 'id' });
          memStore.createIndex('by-entryDate', 'entryDate');
        }
        if (!db.objectStoreNames.contains('offline_sync_queue')) {
          const queueStore = db.createObjectStore('offline_sync_queue', {
            keyPath: 'queueId',
            autoIncrement: true,
          });
          queueStore.createIndex('by-status', 'status');
          queueStore.createIndex('by-timestamp', 'timestamp');
        }
      },
    });
  }
  return dbPromise;
}

export const offlineCacheService = {
  /**
   * Caches multiple encrypted memory records in IndexedDB.
   * INVARIANT: Values must only ever be opaque encrypted ciphertexts + nonces.
   */
  async cacheEncryptedMemories(memories: MemoryItemResponse[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('encrypted_memories', 'readwrite');
    const store = tx.objectStore('encrypted_memories');
    const now = Date.now();

    for (const mem of memories) {
      await store.put({
        ...mem,
        cachedAt: now,
      });
    }
    await tx.done;
  },

  /**
   * Retrieves all cached encrypted memories from IndexedDB.
   */
  async getCachedEncryptedMemories(): Promise<MemoryItemResponse[]> {
    const db = await getDb();
    const records = await db.getAll('encrypted_memories');
    return records.sort(
      (a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime(),
    );
  },

  /**
   * Retrieves a single cached encrypted memory by ID.
   */
  async getCachedEncryptedMemory(id: string): Promise<MemoryItemResponse | undefined> {
    const db = await getDb();
    return db.get('encrypted_memories', id);
  },

  /**
   * Caches a single encrypted memory.
   */
  async cacheEncryptedMemory(memory: MemoryItemResponse): Promise<void> {
    const db = await getDb();
    await db.put('encrypted_memories', {
      ...memory,
      cachedAt: Date.now(),
    });
  },

  /**
   * Deletes a cached encrypted memory by ID.
   */
  async removeCachedEncryptedMemory(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('encrypted_memories', id);
  },

  /**
   * Clears the entire local encrypted memory cache.
   */
  async clearEncryptedCache(): Promise<void> {
    const db = await getDb();
    await db.clear('encrypted_memories');
  },

  /**
   * Enqueues an offline action into the sync queue.
   * INVARIANT: The payload must only be an encrypted ciphertext envelope, never plaintext.
   */
  async enqueueAction(
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    memoryId: string,
    payload?: Record<string, unknown>,
  ): Promise<number> {
    const db = await getDb();
    const item: SyncQueueItem = {
      action,
      memoryId,
      timestamp: Date.now(),
      payload,
      status: 'PENDING',
      retryCount: 0,
      error: null,
    };
    return (await db.add('offline_sync_queue', item as any)) as unknown as number;
  },

  /**
   * Retrieves all pending actions in the sync queue sorted by timestamp.
   */
  async getPendingQueue(): Promise<SyncQueueItem[]> {
    const db = await getDb();
    const items = await db.getAll('offline_sync_queue');
    return items
      .filter((item) => item.status === 'PENDING' || item.status === 'FAILED')
      .sort((a, b) => a.timestamp - b.timestamp);
  },

  /**
   * Returns total count of pending sync items.
   */
  async getPendingCount(): Promise<number> {
    const pending = await this.getPendingQueue();
    return pending.length;
  },

  /**
   * Updates an existing queue item's status, error, or retry count.
   */
  async updateQueueItem(item: SyncQueueItem): Promise<void> {
    const db = await getDb();
    await db.put('offline_sync_queue', item as any);
  },

  /**
   * Removes a processed queue item once successfully synced.
   */
  async removeQueueItem(queueId: number): Promise<void> {
    const db = await getDb();
    await db.delete('offline_sync_queue', queueId);
  },

  /**
   * Clears all items in the sync queue.
   */
  async clearSyncQueue(): Promise<void> {
    const db = await getDb();
    await db.clear('offline_sync_queue');
  },

  /**
   * Resets database connection (used primarily in test suites).
   */
  closeDb(): void {
    if (dbPromise) {
      dbPromise.then((db) => db.close()).catch(() => {});
      dbPromise = null;
    }
  },
};
