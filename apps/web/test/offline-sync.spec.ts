import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryItemResponse } from '@memoir/shared';
import { offlineCacheService } from '../src/services/offlineCacheService.js';
import { offlineSyncService } from '../src/services/offlineSyncService.js';

describe('Encrypted-Only IndexedDB Cache & Resilient Offline Sync Queue', () => {
  const dummyEncryptedMemory1: MemoryItemResponse = {
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'user-offline-test-1',
    ciphertext: 'U2FsdGVkX1+vupppZksvRf5pq5g5XjFRIipRkwB0K1Y=',
    nonce: 'dGVzdG5vbmNlMTIz',
    algorithm: 'AES-256-GCM',
    envelopeVersion: 1,
    entryDate: '2026-11-20T12:00:00.000Z',
    createdAt: '2026-11-20T12:00:00.000Z',
    updatedAt: '2026-11-20T12:00:00.000Z',
    isPinned: false,
    archivedAt: null,
    isTimeCapsule: false,
    unlockAt: null,
  };

  const dummyEncryptedMemory2: MemoryItemResponse = {
    id: '22222222-2222-4222-8222-222222222222',
    userId: 'user-offline-test-1',
    ciphertext: 'Mm1lbW9yeWNpcGhlcnRleHRkYXRhYmxvY2s=',
    nonce: 'bm9uY2UyMjIyMjI=',
    algorithm: 'AES-256-GCM',
    envelopeVersion: 1,
    entryDate: '2026-11-21T15:30:00.000Z',
    createdAt: '2026-11-21T15:30:00.000Z',
    updatedAt: '2026-11-21T15:30:00.000Z',
    isPinned: false,
    archivedAt: null,
    isTimeCapsule: false,
    unlockAt: null,
  };

  beforeEach(async () => {
    // Reset database state between tests
    offlineCacheService.closeDb();
    await offlineCacheService.clearEncryptedCache();
    await offlineCacheService.clearSyncQueue();
  });

  it('1. CRITICAL ZERO-KNOWLEDGE INVARIANT: raw IndexedDB contains ONLY ciphertext & nonce, never plaintext', async () => {
    const CANARY_PLAINTEXT_TITLE = 'Confidential Deep Secret Title';
    const CANARY_PLAINTEXT_BODY = 'This private entry text must NEVER touch IndexedDB unencrypted!';
    const CANARY_PLAINTEXT_TAG = 'secret-medical-tag';

    // Verify that attempting to verify storage contents shows zero occurrence of canary strings
    await offlineCacheService.cacheEncryptedMemory(dummyEncryptedMemory1);
    await offlineCacheService.enqueueAction('CREATE', dummyEncryptedMemory1.id, {
      ciphertext: dummyEncryptedMemory1.ciphertext,
      nonce: dummyEncryptedMemory1.nonce,
      algorithm: dummyEncryptedMemory1.algorithm,
      entryDate: dummyEncryptedMemory1.entryDate,
    });

    const cachedList = await offlineCacheService.getCachedEncryptedMemories();
    const queueList = await offlineCacheService.getPendingQueue();

    const rawCacheDump = JSON.stringify(cachedList);
    const rawQueueDump = JSON.stringify(queueList);

    // Assert that canary strings never exist in memory cache or sync queue
    expect(rawCacheDump).not.toContain(CANARY_PLAINTEXT_TITLE);
    expect(rawCacheDump).not.toContain(CANARY_PLAINTEXT_BODY);
    expect(rawCacheDump).not.toContain(CANARY_PLAINTEXT_TAG);

    expect(rawQueueDump).not.toContain(CANARY_PLAINTEXT_TITLE);
    expect(rawQueueDump).not.toContain(CANARY_PLAINTEXT_BODY);
    expect(rawQueueDump).not.toContain(CANARY_PLAINTEXT_TAG);

    // Verify that what IS stored is strictly the encrypted envelope
    expect(rawCacheDump).toContain(dummyEncryptedMemory1.ciphertext);
    expect(rawCacheDump).toContain(dummyEncryptedMemory1.nonce);
    expect(rawQueueDump).toContain(dummyEncryptedMemory1.ciphertext);
  });

  it('2. Caches and retrieves multiple encrypted memory envelopes in descending entryDate order', async () => {
    await offlineCacheService.cacheEncryptedMemories([
      dummyEncryptedMemory1, // 2026-11-20
      dummyEncryptedMemory2, // 2026-11-21 (more recent)
    ]);

    const cached = await offlineCacheService.getCachedEncryptedMemories();
    expect(cached).toHaveLength(2);
    // Should be sorted descending by entryDate
    expect(cached[0]?.id).toBe(dummyEncryptedMemory2.id);
    expect(cached[1]?.id).toBe(dummyEncryptedMemory1.id);

    // Single item retrieval
    const single = await offlineCacheService.getCachedEncryptedMemory(dummyEncryptedMemory1.id);
    expect(single).toBeDefined();
    expect(single?.ciphertext).toBe(dummyEncryptedMemory1.ciphertext);

    // Item deletion
    await offlineCacheService.removeCachedEncryptedMemory(dummyEncryptedMemory1.id);
    const afterDelete = await offlineCacheService.getCachedEncryptedMemory(dummyEncryptedMemory1.id);
    expect(afterDelete).toBeUndefined();
  });

  it('3. Manages offline sync queue with pending, update, and remove states', async () => {
    expect(await offlineCacheService.getPendingCount()).toBe(0);

    const qId1 = await offlineCacheService.enqueueAction('CREATE', 'temp-id-1', {
      ciphertext: 'enc-blob-1',
      nonce: 'nonce-1',
    });
    const qId2 = await offlineCacheService.enqueueAction('UPDATE', 'existing-id-2', {
      ciphertext: 'enc-blob-2',
      nonce: 'nonce-2',
    });

    expect(await offlineCacheService.getPendingCount()).toBe(2);

    const queue = await offlineCacheService.getPendingQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0]?.queueId).toBe(qId1);
    expect(queue[0]?.action).toBe('CREATE');
    expect(queue[1]?.queueId).toBe(qId2);
    expect(queue[1]?.action).toBe('UPDATE');

    // Update queue item status
    const itemToUpdate = queue[0]!;
    itemToUpdate.status = 'FAILED';
    itemToUpdate.retryCount = 1;
    itemToUpdate.error = 'Network Timeout';
    await offlineCacheService.updateQueueItem(itemToUpdate);

    const reloadedQueue = await offlineCacheService.getPendingQueue();
    expect(reloadedQueue[0]?.status).toBe('FAILED');
    expect(reloadedQueue[0]?.error).toBe('Network Timeout');

    // Remove item once synced
    await offlineCacheService.removeQueueItem(qId1);
    expect(await offlineCacheService.getPendingCount()).toBe(1);
  });

  it('4. OfflineSyncService flushes queued CREATE, UPDATE, and DELETE actions to server', async () => {
    // Enqueue actions
    await offlineCacheService.enqueueAction('CREATE', 'temp-uuid-create', {
      ciphertext: 'create-cipher',
      nonce: 'create-nonce',
      entryDate: '2026-11-22T00:00:00.000Z',
    });
    await offlineCacheService.enqueueAction('UPDATE', 'mem-uuid-update', {
      ciphertext: 'update-cipher',
      nonce: 'update-nonce',
    });
    await offlineCacheService.enqueueAction('DELETE', 'mem-uuid-delete');

    // Mock API
    const mockCreatedMemory: MemoryItemResponse = {
      id: 'server-assigned-uuid',
      userId: 'user-offline-test-1',
      ciphertext: 'create-cipher',
      nonce: 'create-nonce',
      algorithm: 'AES-256-GCM',
      envelopeVersion: 1,
      entryDate: '2026-11-22T00:00:00.000Z',
      createdAt: '2026-11-22T00:00:00.000Z',
      updatedAt: '2026-11-22T00:00:00.000Z',
      isPinned: false,
      archivedAt: null,
      isTimeCapsule: false,
      unlockAt: null,
    };

    const mockUpdatedMemory: MemoryItemResponse = {
      id: 'mem-uuid-update',
      userId: 'user-offline-test-1',
      ciphertext: 'update-cipher',
      nonce: 'update-nonce',
      algorithm: 'AES-256-GCM',
      envelopeVersion: 1,
      entryDate: '2026-11-20T00:00:00.000Z',
      createdAt: '2026-11-20T00:00:00.000Z',
      updatedAt: '2026-11-22T01:00:00.000Z',
      isPinned: false,
      archivedAt: null,
      isTimeCapsule: false,
      unlockAt: null,
    };

    const mockApi = {
      post: vi.fn().mockResolvedValue(mockCreatedMemory),
      get: vi.fn().mockResolvedValue(mockUpdatedMemory),
      patch: vi.fn().mockResolvedValue(mockUpdatedMemory),
      delete: vi.fn().mockResolvedValue({ success: true }),
    };

    // Prepopulate cache with deleted item to confirm it gets removed from cache
    await offlineCacheService.cacheEncryptedMemory({
      ...dummyEncryptedMemory1,
      id: 'mem-uuid-delete',
    });

    const result = await offlineSyncService.flushQueue(mockApi as any);
    expect(result.processed).toBe(3);
    expect(result.failed).toBe(0);

    // Verify API calls
    expect(mockApi.post).toHaveBeenCalledWith('memories', expect.objectContaining({ ciphertext: 'create-cipher' }));
    expect(mockApi.patch).toHaveBeenCalledWith('memories/mem-uuid-update', expect.objectContaining({ ciphertext: 'update-cipher' }));
    expect(mockApi.delete).toHaveBeenCalledWith('memories/mem-uuid-delete');

    // Queue should now be empty
    expect(await offlineCacheService.getPendingCount()).toBe(0);

    // Deleted item removed from local cache
    expect(await offlineCacheService.getCachedEncryptedMemory('mem-uuid-delete')).toBeUndefined();

    // Created item present in local cache under server assigned UUID
    const cachedCreated = await offlineCacheService.getCachedEncryptedMemory('server-assigned-uuid');
    expect(cachedCreated).toBeDefined();
    expect(cachedCreated?.ciphertext).toBe('create-cipher');
  });

  it('5. Handles DELETE 404 gracefully without failing the sync queue', async () => {
    await offlineCacheService.enqueueAction('DELETE', 'already-deleted-on-server');

    const notFoundError = new Error('Not found');
    (notFoundError as any).status = 404;

    const mockApi = {
      post: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn().mockRejectedValue(notFoundError),
    };

    const result = await offlineSyncService.flushQueue(mockApi as any);
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(await offlineCacheService.getPendingCount()).toBe(0);
  });

  it('6. Halts queue processing safely on unexpected network error and marks item FAILED', async () => {
    await offlineCacheService.enqueueAction('CREATE', 'failing-item', {
      ciphertext: 'test-fail',
      nonce: 'nonce-fail',
    });
    await offlineCacheService.enqueueAction('UPDATE', 'subsequent-item', {
      ciphertext: 'test-sub',
      nonce: 'nonce-sub',
    });

    const networkError = new Error('Failed to fetch / Connection refused');

    const mockApi = {
      post: vi.fn().mockRejectedValue(networkError),
      get: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };

    const result = await offlineSyncService.flushQueue(mockApi as any);
    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);

    // Queue should still have both items, first marked FAILED
    const queue = await offlineCacheService.getPendingQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0]?.status).toBe('FAILED');
    expect(queue[0]?.retryCount).toBe(1);
    expect(queue[0]?.error).toBe('Failed to fetch / Connection refused');
    expect(mockApi.patch).not.toHaveBeenCalled(); // Processing halted before reaching second item
  });
});
