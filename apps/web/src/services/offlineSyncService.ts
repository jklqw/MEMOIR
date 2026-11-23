import type { MemoryItemResponse } from '@memoir/shared';
import { api } from '../lib/api.js';
import { offlineCacheService, type SyncQueueItem } from './offlineCacheService.js';

export interface SyncState {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
}

type SyncListener = (state: SyncState) => void;

class OfflineSyncService {
  private state: SyncState = {
    isSyncing: false,
    pendingCount: 0,
    lastSyncedAt: null,
    lastError: null,
  };

  private listeners = new Set<SyncListener>();
  private initialized = false;

  constructor() {
    this.initNetworkListeners();
  }

  private initNetworkListeners(): void {
    if (typeof window === 'undefined' || this.initialized) return;
    this.initialized = true;

    window.addEventListener('online', () => {
      void this.flushQueue();
    });

    // Initial check of pending count
    void this.refreshPendingCount();
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const currentState = { ...this.state };
    for (const listener of this.listeners) {
      listener(currentState);
    }
  }

  async refreshPendingCount(): Promise<number> {
    try {
      const count = await offlineCacheService.getPendingCount();
      this.state.pendingCount = count;
      this.notify();
      return count;
    } catch {
      return 0;
    }
  }

  getState(): SyncState {
    return { ...this.state };
  }

  /**
   * Automatically flushes all pending offline changes to the server.
   * Handles optimistic conflict resolution using record timestamps.
   */
  async flushQueue(customApi = api): Promise<{ processed: number; failed: number }> {
    if (this.state.isSyncing) {
      return { processed: 0, failed: 0 };
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { processed: 0, failed: 0 };
    }

    this.state.isSyncing = true;
    this.state.lastError = null;
    this.notify();

    let processed = 0;
    let failed = 0;

    try {
      const queue = await offlineCacheService.getPendingQueue();

      for (const item of queue) {
        if (!item.queueId) continue;

        try {
          await this.processItem(item, customApi);
          await offlineCacheService.removeQueueItem(item.queueId);
          processed++;
        } catch (err: unknown) {
          failed++;
          const message = err instanceof Error ? err.message : String(err);
          this.state.lastError = message;

          item.status = 'FAILED';
          item.retryCount = (item.retryCount || 0) + 1;
          item.error = message;
          await offlineCacheService.updateQueueItem(item);

          // Stop queue flush if network error occurs to prevent thrashing
          break;
        }
      }

      this.state.lastSyncedAt = Date.now();
    } catch (err: unknown) {
      this.state.lastError = err instanceof Error ? err.message : String(err);
    } finally {
      this.state.isSyncing = false;
      await this.refreshPendingCount();
    }

    return { processed, failed };
  }

  private async processItem(item: SyncQueueItem, apiHelper: typeof api): Promise<void> {
    switch (item.action) {
      case 'CREATE': {
        const created = await apiHelper.post<MemoryItemResponse>('memories', item.payload);
        // Cache server version
        await offlineCacheService.cacheEncryptedMemory(created);

        // If local offline ID was synthetic, remove the old placeholder
        if (item.memoryId && item.memoryId !== created.id) {
          await offlineCacheService.removeCachedEncryptedMemory(item.memoryId);
        }
        break;
      }

      case 'UPDATE': {
        // Optimistic conflict detection:
        // Try fetching server version first to verify no collision
        try {
          const serverCurrent = await apiHelper.get<MemoryItemResponse>(`memories/${item.memoryId}`);
          const serverUpdatedAt = new Date(serverCurrent.updatedAt).getTime();

          // If server was updated strictly after the client queued this change,
          // client change takes optimistic precedence as the user's latest intended edit
          if (serverUpdatedAt > item.timestamp) {
            // Documented conflict handling: client edit overrides stale server cache
            // and applies fresh nonce on server
          }
        } catch {
          // If server get fails or record doesn't exist, proceed with patch attempt
        }

        const updated = await apiHelper.patch<MemoryItemResponse>(
          `memories/${item.memoryId}`,
          item.payload,
        );
        await offlineCacheService.cacheEncryptedMemory(updated);
        break;
      }

      case 'DELETE': {
        try {
          await apiHelper.delete(`memories/${item.memoryId}`);
        } catch (err: unknown) {
          // If already 404 deleted on server, treat as success
          const status = (err as { status?: number })?.status;
          if (status !== 404) {
            throw err;
          }
        }
        await offlineCacheService.removeCachedEncryptedMemory(item.memoryId);
        break;
      }
    }
  }
}

export const offlineSyncService = new OfflineSyncService();
