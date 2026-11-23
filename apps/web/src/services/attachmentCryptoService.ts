import {
  bytesToBase64Url,
  decryptAttachmentMetadata as cryptoDecryptMeta,
  decryptFileBytes,
  encryptAttachmentMetadata as cryptoEncryptMeta,
  encryptFileBytes,
} from '@memoir/crypto';
import type {
  AttachmentMetadataPayload,
  AttachmentResponse,
  DecryptedAttachment,
} from '@memoir/shared';
import { api } from '../lib/api.js';

export interface PreparedAttachmentUpload {
  id: string;
  memoryId?: string;
  isVaultItem?: boolean;
  wrappedFileKey: string;
  fileKeyNonce: string;
  encryptedMetadata: string;
  metaNonce: string;
  fileNonce: string;
  ciphertext: string; // Base64URL
  byteSize: number;
}

/**
 * Strips EXIF metadata, encrypts file bytes under dedicated FileKey,
 * encrypts private file metadata, and wraps FileKey under DEK with AAD.
 */
export async function prepareEncryptedAttachment(params: {
  file: File;
  dek: CryptoKey;
  userId: string;
  attachmentId?: string;
  memoryId?: string;
  isVaultItem?: boolean;
}): Promise<PreparedAttachmentUpload> {
  const attachmentId = params.attachmentId ?? crypto.randomUUID();
  const fileArrayBuffer = await params.file.arrayBuffer();
  const rawBytes = new Uint8Array(fileArrayBuffer);

  // 1. Encrypt file bytes (and automatically strip JPEG EXIF client-side)
  const fileResult = await encryptFileBytes(
    rawBytes,
    params.dek,
    attachmentId,
    params.userId,
    params.file.type,
  );

  // 2. Encrypt private file metadata ({ originalFilename, mimeType, originalSize })
  const metadata: AttachmentMetadataPayload = {
    originalFilename: params.file.name,
    mimeType: params.file.type || 'application/octet-stream',
    originalSize: params.file.size,
  };

  const metaResult = await cryptoEncryptMeta(metadata, params.dek, attachmentId, params.userId);

  return {
    id: attachmentId,
    memoryId: params.memoryId,
    isVaultItem: params.isVaultItem ?? false,
    wrappedFileKey: fileResult.wrappedFileKey,
    fileKeyNonce: fileResult.fileKeyNonce,
    encryptedMetadata: metaResult.encryptedMetadata,
    metaNonce: metaResult.metaNonce,
    fileNonce: fileResult.fileNonce,
    ciphertext: bytesToBase64Url(fileResult.fileCiphertextBytes),
    byteSize: fileResult.fileCiphertextBytes.length,
  };
}

/**
 * Decrypts private metadata for an attachment record in browser RAM.
 */
export async function decryptAttachmentMeta(
  item: AttachmentResponse,
  dek: CryptoKey,
  userId: string,
): Promise<DecryptedAttachment> {
  try {
    const meta = await cryptoDecryptMeta(
      item.encryptedMetadata,
      item.metaNonce,
      dek,
      item.id,
      userId,
    );

    return {
      ...item,
      originalFilename: meta.originalFilename,
      mimeType: meta.mimeType,
      originalSize: meta.originalSize,
    };
  } catch {
    return {
      ...item,
      originalFilename: '[Decryption Error — Tampered Metadata]',
      mimeType: 'application/octet-stream',
      originalSize: item.byteSize,
    };
  }
}

/**
 * Downloads the encrypted binary blob and decrypts file bytes locally in browser RAM.
 */
export async function downloadAndDecryptAttachment(
  item: AttachmentResponse,
  dek: CryptoKey,
  userId: string,
): Promise<{ bytes: Uint8Array; metadata: DecryptedAttachment }> {
  // 1. Download raw encrypted binary blob
  const ciphertextBytes = await api.getBlob(`/api/v1/attachments/${item.id}/download`);

  // 2. Decrypt metadata
  const metadata = await decryptAttachmentMeta(item, dek, userId);

  // 3. Decrypt file bytes with FileKey and AAD
  const decryptedBytes = await decryptFileBytes(
    ciphertextBytes,
    item.fileNonce,
    item.wrappedFileKey,
    item.fileKeyNonce,
    dek,
    item.id,
    userId,
  );

  return { bytes: decryptedBytes, metadata };
}
