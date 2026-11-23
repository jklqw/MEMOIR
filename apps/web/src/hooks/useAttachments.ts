import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttachmentResponse, DecryptedAttachment, StorageQuotaResponse } from '@memoir/shared';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../lib/api.js';
import {
  decryptAttachmentMeta,
  prepareEncryptedAttachment,
} from '../services/attachmentCryptoService.js';
import { useVaultStore } from '../stores/vaultStore.js';

export function useAttachments(options?: { memoryId?: string; isVaultItem?: boolean }) {
  const { user } = useAuth();
  const { dek, isUnlocked } = useVaultStore();

  const queryParams = new URLSearchParams();
  if (options?.memoryId) queryParams.set('memoryId', options.memoryId);
  if (options?.isVaultItem !== undefined) {
    queryParams.set('isVaultItem', String(options.isVaultItem));
  }

  const endpoint = `/api/v1/attachments${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

  return useQuery({
    queryKey: ['attachments', options?.memoryId, options?.isVaultItem, isUnlocked],
    queryFn: async (): Promise<DecryptedAttachment[]> => {
      const items = await api.get<AttachmentResponse[]>(endpoint);

      if (!isUnlocked || !dek || !user) {
        return items.map((item) => ({
          ...item,
          originalFilename: 'Encrypted File',
          mimeType: 'application/octet-stream',
          originalSize: item.byteSize,
        }));
      }

      // Concurrently decrypt attachment metadata in RAM
      const decrypted = await Promise.all(
        items.map((item) => decryptAttachmentMeta(item, dek, user.id)),
      );

      return decrypted;
    },
    enabled: !!user,
  });
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { dek } = useVaultStore();

  return useMutation({
    mutationFn: async (params: { file: File; memoryId?: string; isVaultItem?: boolean }) => {
      if (!user || !dek) {
        throw new Error('Vault must be unlocked to upload encrypted attachments.');
      }

      const prepared = await prepareEncryptedAttachment({
        file: params.file,
        dek,
        userId: user.id,
        memoryId: params.memoryId,
        isVaultItem: params.isVaultItem,
      });

      const result = await api.post<AttachmentResponse>('/api/v1/attachments', prepared);
      return decryptAttachmentMeta(result, dek, user.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attachments'] });
      void queryClient.invalidateQueries({ queryKey: ['storage-quota'] });
    },
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/attachments/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attachments'] });
      void queryClient.invalidateQueries({ queryKey: ['storage-quota'] });
    },
  });
}

export function useStorageQuota() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['storage-quota'],
    queryFn: async (): Promise<StorageQuotaResponse> => {
      return api.get<StorageQuotaResponse>('/api/v1/attachments/quota');
    },
    enabled: !!user,
  });
}
