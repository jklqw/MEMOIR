import {
  base64UrlToBytes,
  bytesToBase64Url,
  toBufferSource,
  utf8ToBytes,
} from './encoding.util.js';
import { stripJpegExif } from './exif.util.js';
import { decryptEnvelope, encryptEnvelope } from './envelope.js';
import type { EncryptedFileResult } from './types.js';

/**
 * Generates a random 256-bit AES-GCM FileKey for a specific attachment.
 */
export async function generateFileKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // Extractable for wrapping under DEK
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
  );
}

/**
 * Encrypts raw attachment bytes using a dedicated random 256-bit FileKey,
 * strips EXIF metadata for JPEGs, and wraps the FileKey under the user's DEK with AAD.
 */
export async function encryptFileBytes(
  rawFileBytes: Uint8Array,
  dek: CryptoKey,
  attachmentId: string,
  userId: string,
  mimeType?: string,
): Promise<EncryptedFileResult> {
  // 1. Strip EXIF metadata client-side if JPEG
  const isJpeg =
    mimeType === 'image/jpeg' ||
    (rawFileBytes.length >= 2 && rawFileBytes[0] === 0xff && rawFileBytes[1] === 0xd8);
  const bytesToEncrypt = isJpeg ? stripJpegExif(rawFileBytes) : rawFileBytes;

  // 2. Generate unique FileKey
  const fileKey = await generateFileKey();

  // 3. Wrap FileKey under user's DEK with AAD
  const fileKeyNonce = crypto.getRandomValues(new Uint8Array(12));
  const fileKeyWrapAad = utf8ToBytes(`memoir:v1|file-key-wrap|user:${userId}|id:${attachmentId}`);

  const wrappedFileKeyBuffer = await crypto.subtle.wrapKey('raw', fileKey, dek, {
    name: 'AES-GCM',
    iv: toBufferSource(fileKeyNonce),
    additionalData: toBufferSource(fileKeyWrapAad),
  });

  // 4. Encrypt file bytes with FileKey with AAD
  const fileNonce = crypto.getRandomValues(new Uint8Array(12));
  const fileBytesAad = utf8ToBytes(`memoir:v1|attachment-blob|user:${userId}|id:${attachmentId}`);

  const encryptedFileBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toBufferSource(fileNonce),
      additionalData: toBufferSource(fileBytesAad),
    },
    fileKey,
    toBufferSource(bytesToEncrypt),
  );

  return {
    fileCiphertextBytes: new Uint8Array(encryptedFileBuffer),
    fileNonce: bytesToBase64Url(fileNonce),
    wrappedFileKey: bytesToBase64Url(new Uint8Array(wrappedFileKeyBuffer)),
    fileKeyNonce: bytesToBase64Url(fileKeyNonce),
  };
}

/**
 * Unwraps an attachment's FileKey under DEK and decrypts the file bytes with AAD.
 */
export async function decryptFileBytes(
  fileCiphertextBytes: Uint8Array,
  fileNonceBase64: string,
  wrappedFileKeyBase64: string,
  fileKeyNonceBase64: string,
  dek: CryptoKey,
  attachmentId: string,
  userId: string,
): Promise<Uint8Array> {
  const fileKeyNonce = base64UrlToBytes(fileKeyNonceBase64);
  const wrappedFileKeyBytes = base64UrlToBytes(wrappedFileKeyBase64);
  const fileKeyWrapAad = utf8ToBytes(`memoir:v1|file-key-wrap|user:${userId}|id:${attachmentId}`);

  // 1. Unwrap FileKey
  const fileKey = await crypto.subtle.unwrapKey(
    'raw',
    toBufferSource(wrappedFileKeyBytes),
    dek,
    {
      name: 'AES-GCM',
      iv: toBufferSource(fileKeyNonce),
      additionalData: toBufferSource(fileKeyWrapAad),
    },
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['decrypt'],
  );

  // 2. Decrypt file ciphertext bytes
  const fileNonce = base64UrlToBytes(fileNonceBase64);
  const fileBytesAad = utf8ToBytes(`memoir:v1|attachment-blob|user:${userId}|id:${attachmentId}`);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toBufferSource(fileNonce),
      additionalData: toBufferSource(fileBytesAad),
    },
    fileKey,
    toBufferSource(fileCiphertextBytes),
  );

  return new Uint8Array(decryptedBuffer);
}

/**
 * Encrypts private attachment metadata ({ originalFilename, mimeType, originalSize })
 * under DEK with AAD memoir:v1|attachment-meta|user:{userId}|id:{attachmentId}
 */
export async function encryptAttachmentMetadata(
  metadata: { originalFilename: string; mimeType: string; originalSize: number },
  dek: CryptoKey,
  attachmentId: string,
  userId: string,
): Promise<{ encryptedMetadata: string; metaNonce: string }> {
  const json = JSON.stringify(metadata);
  const aad = `memoir:v1|attachment-meta|user:${userId}|id:${attachmentId}`;
  const envelope = await encryptEnvelope(json, dek, aad, false);
  return {
    encryptedMetadata: envelope.ciphertext,
    metaNonce: envelope.nonce,
  };
}

/**
 * Decrypts private attachment metadata under DEK with AAD.
 */
export async function decryptAttachmentMetadata(
  encryptedMetadata: string,
  metaNonce: string,
  dek: CryptoKey,
  attachmentId: string,
  userId: string,
): Promise<{ originalFilename: string; mimeType: string; originalSize: number }> {
  const aad = `memoir:v1|attachment-meta|user:${userId}|id:${attachmentId}`;
  const envelope = {
    version: 1 as const,
    algorithm: 'AES-256-GCM' as const,
    ciphertext: encryptedMetadata,
    nonce: metaNonce,
  };
  const decryptedBytes = await decryptEnvelope(envelope, dek, aad, false);
  const jsonStr = new TextDecoder().decode(decryptedBytes);
  return JSON.parse(jsonStr) as {
    originalFilename: string;
    mimeType: string;
    originalSize: number;
  };
}
