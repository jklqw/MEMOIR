import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DecryptedMemory, MemoryItemResponse, MemoryPayload } from '@memoir/shared';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../lib/api.js';
import {
  buildEncryptedCreateDto,
  buildEncryptedUpdateDto,
  decryptMemory,
} from '../services/memoryCryptoService.js';
import { offlineCacheService } from '../services/offlineCacheService.js';
import { offlineSyncService } from '../services/offlineSyncService.js';
import { useVaultStore } from '../stores/vaultStore.js';

export function useMemoriesList(options?: { includeArchived?: boolean; entryDate?: string }) {
  const { user } = useAuth();
  const { dek, isUnlocked } = useVaultStore();

  const queryParams = new URLSearchParams();
  if (options?.includeArchived) queryParams.set('includeArchived', 'true');
  if (options?.entryDate) queryParams.set('entryDate', options.entryDate);

  const endpoint = `/api/v1/memories${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

  return useQuery({
    queryKey: ['memories', options?.includeArchived, options?.entryDate, isUnlocked],
    queryFn: async (): Promise<DecryptedMemory[]> => {
      let items: MemoryItemResponse[] = [];

      try {
        items = await api.get<MemoryItemResponse[]>(endpoint);
        // Opportunistically cache encrypted envelopes in IndexedDB (ZERO PLAINTEXT!)
        void offlineCacheService.cacheEncryptedMemories(items);
      } catch (networkErr) {
        // Fallback to local encrypted cache if offline or network unreachable
        try {
          const cached = await offlineCacheService.getCachedEncryptedMemories();
          if (cached.length > 0) {
            items = cached;
          } else {
            throw networkErr;
          }
        } catch {
          throw networkErr;
        }
      }

      // If vault is locked or DEK is absent, return masked empty bodies
      if (!isUnlocked || !dek || !user) {
        return items.map((item) => ({
          ...item,
          title: 'Encrypted Memory',
          bodyMarkdown: '',
          mood: null,
          tags: [],
          schemaVersion: 1,
        }));
      }


      // Concurrently decrypt all memory envelopes locally in RAM
      const decrypted = await Promise.all(
        items.map(async (item) => {
          try {
            return await decryptMemory(item, dek, user.id);
          } catch {
            return {
              ...item,
              title: '[Decryption Error — Tampered or Corrupted Envelope]',
              bodyMarkdown: '',
              mood: null,
              tags: [],
              schemaVersion: 1,
            };
          }
        }),
      );

      return decrypted;
    },
    enabled: !!user,
  });
}

export function useMemory(memoryId?: string) {
  const { user } = useAuth();
  const { dek, isUnlocked } = useVaultStore();

  return useQuery({
    queryKey: ['memory', memoryId, isUnlocked],
    queryFn: async (): Promise<DecryptedMemory | null> => {
      if (!memoryId) return null;
      const item = await api.get<MemoryItemResponse>(`/api/v1/memories/${memoryId}`);

      if (!isUnlocked || !dek || !user) {
        return {
          ...item,
          title: 'Encrypted Memory',
          bodyMarkdown: '',
          mood: null,
          tags: [],
          schemaVersion: 1,
        };
      }

      return decryptMemory(item, dek, user.id);
    },
    enabled: !!memoryId && !!user,
  });
}

export function useSaveMemory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { dek } = useVaultStore();

  return useMutation({
    mutationFn: async (params: {
      id?: string;
      payload: MemoryPayload;
      entryDate: string;
      isPinned?: boolean;
      isTimeCapsule?: boolean;
      unlockAt?: string | null;
    }) => {
      if (!user || !dek) {
        throw new Error('Vault must be unlocked to save encrypted memories.');
      }

      if (params.id) {
        // Update existing memory with fresh nonce
        const updateDto = await buildEncryptedUpdateDto({
          memoryId: params.id,
          payload: params.payload,
          entryDate: params.entryDate,
          isPinned: params.isPinned,
          isTimeCapsule: params.isTimeCapsule,
          unlockAt: params.unlockAt,
          dek,
          userId: user.id,
        });

        try {
          const updated = await api.patch<MemoryItemResponse>(
            `/api/v1/memories/${params.id}`,
            updateDto,
          );
          void offlineCacheService.cacheEncryptedMemory(updated);
          return decryptMemory(updated, dek, user.id);
        } catch {
          // If offline or network unavailable, persist encrypted envelope locally and enqueue
          const offlineItem: MemoryItemResponse = {
            id: params.id,
            userId: user.id,
            entryDate: new Date(params.entryDate).toISOString(),
            isPinned: params.isPinned ?? false,
            isTimeCapsule: params.isTimeCapsule ?? false,
            unlockAt: params.unlockAt ? new Date(params.unlockAt).toISOString() : null,
            envelopeVersion: updateDto.envelopeVersion ?? 1,
            algorithm: updateDto.algorithm ?? 'AES-256-GCM',
            ciphertext: updateDto.ciphertext,
            nonce: updateDto.nonce,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            archivedAt: null,
          };
          await offlineCacheService.cacheEncryptedMemory(offlineItem);
          await offlineCacheService.enqueueAction(
            'UPDATE',
            params.id,
            updateDto as unknown as Record<string, unknown>,
          );
          void offlineSyncService.refreshPendingCount();
          return decryptMemory(offlineItem, dek, user.id);
        }
      } else {
        // Create new memory with pre-bound AAD
        const createDto = await buildEncryptedCreateDto({
          payload: params.payload,
          entryDate: params.entryDate,
          isPinned: params.isPinned,
          isTimeCapsule: params.isTimeCapsule,
          unlockAt: params.unlockAt,
          dek,
          userId: user.id,
        });

        try {
          const created = await api.post<MemoryItemResponse>('/api/v1/memories', createDto);
          void offlineCacheService.cacheEncryptedMemory(created);
          return decryptMemory(created, dek, user.id);
        } catch {
          // If offline, generate temporary client UUID and queue
          const syntheticId = crypto.randomUUID();
          const offlineItem: MemoryItemResponse = {
            id: syntheticId,
            userId: user.id,
            entryDate: new Date(params.entryDate).toISOString(),
            isPinned: params.isPinned ?? false,
            isTimeCapsule: params.isTimeCapsule ?? false,
            unlockAt: params.unlockAt ? new Date(params.unlockAt).toISOString() : null,
            envelopeVersion: createDto.envelopeVersion,
            algorithm: createDto.algorithm,
            ciphertext: createDto.ciphertext,
            nonce: createDto.nonce,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            archivedAt: null,
          };
          await offlineCacheService.cacheEncryptedMemory(offlineItem);
          await offlineCacheService.enqueueAction(
            'CREATE',
            syntheticId,
            createDto as unknown as Record<string, unknown>,
          );
          void offlineSyncService.refreshPendingCount();
          return decryptMemory(offlineItem, dek, user.id);
        }
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['memories'] });
    },
  });
}

export function useDeleteMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await api.delete(`/api/v1/memories/${id}`);
        void offlineCacheService.removeCachedEncryptedMemory(id);
      } catch {
        // If offline, remove from local cache and queue delete
        await offlineCacheService.removeCachedEncryptedMemory(id);
        await offlineCacheService.enqueueAction('DELETE', id);
        void offlineSyncService.refreshPendingCount();
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['memories'] });
    },
  });
}


export function useTogglePin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/api/v1/memories/${id}/pin`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['memories'] });
    },
  });
}

export function useToggleArchive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/api/v1/memories/${id}/archive`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['memories'] });
    },
  });
}

export function useRestoreMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/api/v1/memories/${id}/restore`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['memories'] });
    },
  });
}
