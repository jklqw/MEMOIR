import { describe, expect, it } from 'vitest';
import {
  decryptAttachmentMetadata,
  decryptFileBytes,
  encryptAttachmentMetadata,
  encryptFileBytes,
  generateDek,
  stripJpegExif,
} from '@memoir/crypto';

describe('Private Vault Client File Encryption, EXIF Stripping & Tamper Rejection', () => {
  const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('1. Strips EXIF metadata from synthetic JPEG fixtures before encryption', () => {
    // Construct synthetic JPEG with SOI (0xFFD8), APP1 (0xFFE1) with Exif header, and DQT (0xFFDB)
    const jpegWithExif = new Uint8Array([
      0xff,
      0xd8, // SOI
      0xff,
      0xe1, // APP1 marker (EXIF)
      0x00,
      0x0a, // length: 10 bytes
      0x45,
      0x78,
      0x69,
      0x66,
      0x00,
      0x00,
      0x11,
      0x22, // 'Exif\0\0' payload
      0xff,
      0xdb, // DQT marker
      0x00,
      0x05,
      0x01,
      0x02,
      0x03,
      0xff,
      0xd9, // EOI
    ]);

    const stripped = stripJpegExif(jpegWithExif);
    expect(stripped.length).toBeLessThan(jpegWithExif.length);

    // Verify APP1 marker (0xFFE1) is absent in stripped output
    let foundApp1 = false;
    for (let i = 0; i < stripped.length - 1; i++) {
      if (stripped[i] === 0xff && stripped[i + 1] === 0xe1) {
        foundApp1 = true;
        break;
      }
    }
    expect(foundApp1).toBe(false);
  });

  it('2. Encrypts file bytes and wraps unique per-file FileKey under user DEK', async () => {
    const dek = await generateDek();
    const attachmentId1 = crypto.randomUUID();
    const attachmentId2 = crypto.randomUUID();
    const rawData = new TextEncoder().encode('Confidential medical certificate content');

    const result1 = await encryptFileBytes(rawData, dek, attachmentId1, userId, 'text/plain');
    const result2 = await encryptFileBytes(rawData, dek, attachmentId2, userId, 'text/plain');

    // Unique nonces and ciphertexts per encryption
    expect(result1.fileNonce).not.toBe(result2.fileNonce);
    expect(result1.fileKeyNonce).not.toBe(result2.fileKeyNonce);
    expect(result1.wrappedFileKey).not.toBe(result2.wrappedFileKey);

    // Decrypt round-trip
    const decrypted = await decryptFileBytes(
      result1.fileCiphertextBytes,
      result1.fileNonce,
      result1.wrappedFileKey,
      result1.fileKeyNonce,
      dek,
      attachmentId1,
      userId,
    );

    expect(new TextDecoder().decode(decrypted)).toBe('Confidential medical certificate content');
  });

  it('3. Encrypts and decrypts private file metadata ({ originalFilename, mimeType, originalSize })', async () => {
    const dek = await generateDek();
    const attachmentId = crypto.randomUUID();
    const metadata = {
      originalFilename: 'passport_scan_2026.pdf',
      mimeType: 'application/pdf',
      originalSize: 1048576,
    };

    const { encryptedMetadata, metaNonce } = await encryptAttachmentMetadata(
      metadata,
      dek,
      attachmentId,
      userId,
    );

    expect(encryptedMetadata).not.toContain('passport');

    const decryptedMeta = await decryptAttachmentMetadata(
      encryptedMetadata,
      metaNonce,
      dek,
      attachmentId,
      userId,
    );

    expect(decryptedMeta.originalFilename).toBe('passport_scan_2026.pdf');
    expect(decryptedMeta.mimeType).toBe('application/pdf');
    expect(decryptedMeta.originalSize).toBe(1048576);
  });

  it('4. Rejects single-bit tampering on file ciphertext bytes (fails closed)', async () => {
    const dek = await generateDek();
    const attachmentId = crypto.randomUUID();
    const rawData = new TextEncoder().encode('Top secret confidential notes');

    const result = await encryptFileBytes(rawData, dek, attachmentId, userId);

    // Tamper with one byte in the ciphertext
    const tamperedBytes = new Uint8Array(result.fileCiphertextBytes);
    tamperedBytes[0] ^= 0x01; // flip single bit

    await expect(
      decryptFileBytes(
        tamperedBytes,
        result.fileNonce,
        result.wrappedFileKey,
        result.fileKeyNonce,
        dek,
        attachmentId,
        userId,
      ),
    ).rejects.toThrow();
  });

  it('5. Rejects tampering with AAD context (wrong attachment ID or user ID fails closed)', async () => {
    const dek = await generateDek();
    const attachmentId = crypto.randomUUID();
    const attackerUserId = crypto.randomUUID();
    const rawData = new TextEncoder().encode('Personal identity document');

    const result = await encryptFileBytes(rawData, dek, attachmentId, userId);

    // Attempting to decrypt with attacker user ID fails (AAD mismatch on FileKey or Blob)
    await expect(
      decryptFileBytes(
        result.fileCiphertextBytes,
        result.fileNonce,
        result.wrappedFileKey,
        result.fileKeyNonce,
        dek,
        attachmentId,
        attackerUserId, // Tampered AAD
      ),
    ).rejects.toThrow();
  });
});
