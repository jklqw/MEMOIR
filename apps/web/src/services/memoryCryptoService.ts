import { decryptEnvelope, encryptEnvelope } from '@memoir/crypto';
import type {
  CreateMemoryDto,
  DecryptedMemory,
  MemoryItemResponse,
  MemoryPayload,
  UpdateMemoryDto,
} from '@memoir/shared';

/**
 * Derives Associated Authenticated Data (AAD) for memory payloads.
 * Format: memoir:v1|memory|user:{userId}|id:{memoryId}
 */
export function getMemoryAad(userId: string, memoryId: string): string {
  return `memoir:v1|memory|user:${userId}|id:${memoryId}`;
}

/**
 * Encrypts a memory payload locally in browser RAM with 256-byte block padding
 * and record-bound AAD. Generates a fresh 12-byte CSPRNG nonce.
 */
export async function encryptMemory(
  payload: MemoryPayload,
  dek: CryptoKey,
  userId: string,
  memoryId: string,
): Promise<{ ciphertext: string; nonce: string }> {
  const json = JSON.stringify(payload);
  const aad = getMemoryAad(userId, memoryId);

  // shouldPad = true enforces deterministic length-prefixed 256-byte boundary padding
  const envelope = await encryptEnvelope(json, dek, aad, true);

  return {
    ciphertext: envelope.ciphertext,
    nonce: envelope.nonce,
  };
}

/**
 * Decrypts a memory envelope in browser RAM, unpads the 256-byte boundary,
 * and parses the private memory JSON.
 */
export async function decryptMemory(
  item: MemoryItemResponse,
  dek: CryptoKey,
  userId: string,
): Promise<DecryptedMemory> {
  // Handle server-masked locked time capsules
  if (item.isLockedTimeCapsule || !item.ciphertext || !item.nonce) {
    return {
      ...item,
      title: 'Locked Time Capsule',
      bodyMarkdown:
        'This memory is encrypted and locked in a time capsule until ' +
        (item.unlockAt ? new Date(item.unlockAt).toLocaleString() : 'the appointed time') +
        '.',
      mood: null,
      tags: ['time-capsule'],
      schemaVersion: 1,
      isLockedTimeCapsule: true,
    };
  }

  const aad = getMemoryAad(userId, item.id);
  const envelope = {
    version: 1 as const,
    algorithm: 'AES-256-GCM' as const,
    ciphertext: item.ciphertext,
    nonce: item.nonce,
  };

  const decryptedBytes = await decryptEnvelope(envelope, dek, aad, true);
  const jsonString = new TextDecoder().decode(decryptedBytes);
  const payload = JSON.parse(jsonString) as MemoryPayload;

  return {
    ...item,
    title: payload.title ?? '',
    bodyMarkdown: payload.bodyMarkdown ?? '',
    mood: payload.mood ?? null,
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    customMeta: payload.customMeta,
    schemaVersion: payload.schemaVersion ?? 1,
    isLockedTimeCapsule: false,
  };
}

/**
 * Prepares a fresh encrypted payload for creation.
 */
export async function buildEncryptedCreateDto(params: {
  id?: string;
  payload: MemoryPayload;
  entryDate: string;
  isPinned?: boolean;
  isTimeCapsule?: boolean;
  unlockAt?: string | null;
  dek: CryptoKey;
  userId: string;
}): Promise<CreateMemoryDto> {
  const memoryId = params.id ?? crypto.randomUUID();
  const { ciphertext, nonce } = await encryptMemory(
    params.payload,
    params.dek,
    params.userId,
    memoryId,
  );

  return {
    id: memoryId,
    entryDate: params.entryDate,
    isPinned: params.isPinned ?? false,
    isTimeCapsule: params.isTimeCapsule ?? false,
    unlockAt: params.unlockAt ?? null,
    envelopeVersion: 1,
    algorithm: 'AES-256-GCM',
    ciphertext,
    nonce,
  };
}

/**
 * Prepares an encrypted payload for update with a fresh nonce.
 */
export async function buildEncryptedUpdateDto(params: {
  memoryId: string;
  payload: MemoryPayload;
  entryDate?: string;
  isPinned?: boolean;
  isTimeCapsule?: boolean;
  unlockAt?: string | null;
  dek: CryptoKey;
  userId: string;
}): Promise<UpdateMemoryDto> {
  const { ciphertext, nonce } = await encryptMemory(
    params.payload,
    params.dek,
    params.userId,
    params.memoryId,
  );

  return {
    entryDate: params.entryDate,
    isPinned: params.isPinned,
    isTimeCapsule: params.isTimeCapsule,
    unlockAt: params.unlockAt,
    envelopeVersion: 1,
    algorithm: 'AES-256-GCM',
    ciphertext,
    nonce,
  };
}
