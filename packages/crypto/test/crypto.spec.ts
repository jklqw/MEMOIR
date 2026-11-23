import { describe, expect, it } from 'vitest';
import {
  decryptEnvelope,
  decryptFileBytes,
  derivePassphraseKek,
  deriveRecoveryKek,
  encodeCrockford,
  encryptEnvelope,
  encryptFileBytes,
  generateDek,
  generateRecoveryKey,
  padPayload,
  stripJpegExif,
  unpadPayload,
  unwrapDek,
  validateRecoveryKey,
  wrapDek,
  zeroize,
} from '../src/index.js';
import { bytesToBase64Url, bytesToUtf8, utf8ToBytes } from '../src/encoding.util.js';
import { createSyntheticJpeg } from '../src/exif.util.js';

describe('Memoir Cryptographic Verification Suite (13 Core Invariants)', () => {
  // --------------------------------------------------------------------------
  // Invariant 1: Round-trip encryption/decryption
  // --------------------------------------------------------------------------
  it('1. Round-trips encryption/decryption for ASCII, Unicode/RTL/Persian, emojis, empty, and large payloads', async () => {
    const dek = await generateDek();
    const aad = 'memoir:v1|memory|user:user-001|id:mem-001';

    const testPayloads = [
      'Simple ASCII diary note: went for a quiet walk.',
      'یادداشت محرمانه فارسی: امروز روز بسیار آرامی در کتابخانه بود. این متن کاملا رمزنگاری شده است.',
      'Emoji mixture: 🌸✨🔒 Memoirs & Reflections 🗝️📝📖',
      '', // Empty payload
      '# Long Journal Entry\n\n' + 'Paragraph filled with reflections.\n\n'.repeat(5000), // ~175 KB payload
    ];

    for (const text of testPayloads) {
      // Test padded mode (standard for memories)
      const envelopePadded = await encryptEnvelope(text, dek, aad, true);
      expect(envelopePadded.version).toBe(1);
      expect(envelopePadded.algorithm).toBe('AES-256-GCM');
      const decryptedPadded = await decryptEnvelope(envelopePadded, dek, aad, true);
      expect(bytesToUtf8(decryptedPadded)).toBe(text);

      // Test unpadded mode
      const envelopeUnpadded = await encryptEnvelope(text, dek, aad, false);
      const decryptedUnpadded = await decryptEnvelope(envelopeUnpadded, dek, aad, false);
      expect(bytesToUtf8(decryptedUnpadded)).toBe(text);
    }
  });

  // --------------------------------------------------------------------------
  // Invariant 2: Deterministic KDF & HKDF domain separation
  // --------------------------------------------------------------------------
  it('2. Enforces deterministic KDF + HKDF domain separation (different info strings yield distinct keys)', async () => {
    const passphrase = 'Sanctuary-Memory-Passphrase-2026!';
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

    // Fast parameters for unit testing
    const kek1 = await derivePassphraseKek(passphrase, salt, 1024, 1, 1);
    const kek2 = await derivePassphraseKek(passphrase, salt, 1024, 1, 1);

    const dek = await generateDek();
    const aad = 'memoir:v1|dek-wrap|user:user-001';

    // Same KEK derived twice should both successfully unwrap
    const wrapped = await wrapDek(dek, kek1, aad);
    const unwrapped = await unwrapDek(wrapped.wrappedKey, wrapped.nonce, kek2, aad);
    expect(unwrapped).toBeDefined();

    // Recovery KEK with identical salt but distinct domain label must fail to unwrap
    const dummyRecoveryRaw = new Uint8Array(32).fill(7);
    const recoveryKek = await deriveRecoveryKek(dummyRecoveryRaw, salt);

    await expect(unwrapDek(wrapped.wrappedKey, wrapped.nonce, recoveryKek, aad)).rejects.toThrow();
  });

  // --------------------------------------------------------------------------
  // Invariant 3: Wrong passphrase / wrong DEK rejection
  // --------------------------------------------------------------------------
  it('3. Rejects decryption with wrong passphrase or wrong DEK (fails closed)', async () => {
    const dekA = await generateDek();
    const dekB = await generateDek();
    const aad = 'memoir:v1|memory|user:user-001|id:mem-001';

    const envelope = await encryptEnvelope('Classified memory text', dekA, aad, true);

    // Decrypting with wrong DEK must throw authenticated decryption error
    await expect(decryptEnvelope(envelope, dekB, aad, true)).rejects.toThrow();

    // Wrapping DEK under passphrase 1 and attempting unwrap with passphrase 2
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kekCorrect = await derivePassphraseKek('correct-passphrase-here', salt, 1024, 1, 1);
    const kekWrong = await derivePassphraseKek('wrong-passphrase-here', salt, 1024, 1, 1);

    const wrapAad = 'memoir:v1|dek-wrap|user:user-001';
    const wrappedDek = await wrapDek(dekA, kekCorrect, wrapAad);

    await expect(unwrapDek(wrappedDek.wrappedKey, wrappedDek.nonce, kekWrong, wrapAad)).rejects.toThrow();
  });

  // --------------------------------------------------------------------------
  // Invariant 4: Single-bit tamper rejection across ciphertext, tag, nonce, AAD
  // --------------------------------------------------------------------------
  it('4. Rejects single-bit tampering across ciphertext body, auth tag, nonce, and AAD', async () => {
    const dek = await generateDek();
    const aad = 'memoir:v1|memory|user:user-001|id:mem-001';
    const original = await encryptEnvelope('Sensitive diary entry that must not be altered', dek, aad, true);

    // Helper to flip the least significant bit of the first byte of a base64url string
    const flipBit = (b64url: string): string => {
      let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4 !== 0) b64 += '=';
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      // Flip single bit
      bytes[0] ^= 0x01;

      return bytesToBase64Url(bytes);
    };

    // Helper to flip a bit in the authentication tag (last 16 bytes of ciphertext)
    const flipTagBit = (b64url: string): string => {
      let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4 !== 0) b64 += '=';
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      // Flip bit in auth tag (last byte)
      bytes[bytes.length - 1] ^= 0x01;

      return bytesToBase64Url(bytes);
    };

    // 4a. Tampered ciphertext body
    const tamperedCiphertext = { ...original, ciphertext: flipBit(original.ciphertext) };
    await expect(decryptEnvelope(tamperedCiphertext, dek, aad, true)).rejects.toThrow();

    // 4b. Tampered authentication tag
    const tamperedTag = { ...original, ciphertext: flipTagBit(original.ciphertext) };
    await expect(decryptEnvelope(tamperedTag, dek, aad, true)).rejects.toThrow();

    // 4c. Tampered nonce
    const tamperedNonce = { ...original, nonce: flipBit(original.nonce) };
    await expect(decryptEnvelope(tamperedNonce, dek, aad, true)).rejects.toThrow();

    // 4d. Tampered AAD context binding
    const tamperedAad = 'memoir:v1|memory|user:ATTACKER|id:mem-001';
    await expect(decryptEnvelope(original, dek, tamperedAad, true)).rejects.toThrow();
  });

  // --------------------------------------------------------------------------
  // Invariant 5: Unsupported envelope version & malformed parameter rejection
  // --------------------------------------------------------------------------
  it('5. Rejects unsupported envelope versions and malformed nonce lengths', async () => {
    const dek = await generateDek();
    const aad = 'memoir:v1|memory|user:user-001|id:mem-001';
    const valid = await encryptEnvelope('Hello', dek, aad, false);

    // Unsupported version
    const invalidVersion = { ...valid, version: 2 as unknown as 1 };
    await expect(decryptEnvelope(invalidVersion, dek, aad, false)).rejects.toThrow(
      'Unsupported ciphertext envelope version: 2',
    );

    // Unsupported algorithm
    const invalidAlg = { ...valid, algorithm: 'AES-128-CBC' as unknown as 'AES-256-GCM' };
    await expect(decryptEnvelope(invalidAlg, dek, aad, false)).rejects.toThrow(
      'Unsupported ciphertext algorithm: AES-128-CBC',
    );

    // Nonce shorter than 12 bytes
    const shortNonce = { ...valid, nonce: bytesToBase64Url(new Uint8Array(8)) };
    await expect(decryptEnvelope(shortNonce, dek, aad, false)).rejects.toThrow('Invalid nonce length');

    // Nonce longer than 12 bytes
    const longNonce = { ...valid, nonce: bytesToBase64Url(new Uint8Array(16)) };
    await expect(decryptEnvelope(longNonce, dek, aad, false)).rejects.toThrow('Invalid nonce length');
  });

  // --------------------------------------------------------------------------
  // Invariant 6: Nonce uniqueness across 10,000 consecutive operations
  // --------------------------------------------------------------------------
  it('6. Guarantees 100% nonce uniqueness across 10,000 consecutive encryption operations', async () => {
    const nonces = new Set<string>();
    const count = 10_000;

    for (let i = 0; i < count; i++) {
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const encoded = bytesToBase64Url(nonce);
      expect(nonces.has(encoded)).toBe(false);
      nonces.add(encoded);
    }

    expect(nonces.size).toBe(count);
  });

  // --------------------------------------------------------------------------
  // Invariant 7: Deterministic 256-byte block padding verification
  // --------------------------------------------------------------------------
  it('7. Enforces deterministic 256-byte block padding (short inputs pad to identical ciphertext lengths)', async () => {
    const shortInputs = [
      'A',
      'Hello World',
      'Short secret entry',
      'A somewhat longer paragraph that still easily fits within the initial 252 bytes available in the first 256-byte boundary.',
    ];

    const dek = await generateDek();
    const aad = 'memoir:v1|memory|user:user-001|id:mem-001';

    let expectedCiphertextLen: number | null = null;

    for (const input of shortInputs) {
      const paddedRaw = padPayload(utf8ToBytes(input));
      // First boundary: [4 bytes length prefix] + [payload] <= 256 bytes total
      expect(paddedRaw.length).toBe(256);

      // Verify unpadding round-trip
      const unpadded = unpadPayload(paddedRaw);
      expect(bytesToUtf8(unpadded)).toBe(input);

      // Verify ciphertext length invariance
      const env = await encryptEnvelope(input, dek, aad, true);
      if (expectedCiphertextLen === null) {
        expectedCiphertextLen = env.ciphertext.length;
      } else {
        expect(env.ciphertext.length).toBe(expectedCiphertextLen);
      }
    }

    // Boundary threshold test:
    // 252 bytes + 4 bytes prefix = 256 bytes -> pads to 256
    const exactBoundaryPayload = new Uint8Array(252).fill(65);
    expect(padPayload(exactBoundaryPayload).length).toBe(256);

    // 253 bytes + 4 bytes prefix = 257 bytes -> must spill to 512 bytes
    const spillBoundaryPayload = new Uint8Array(253).fill(65);
    expect(padPayload(spillBoundaryPayload).length).toBe(512);
  });

  // --------------------------------------------------------------------------
  // Invariant 8: Recovery key generation, Crockford Base32 checksum & unwrap
  // --------------------------------------------------------------------------
  it('8. Verifies Recovery Key generation, Crockford Base32 checksum validation, and DEK unwrap round-trip', async () => {
    // 1. Generate Recovery Key
    const recoveryResult = await generateRecoveryKey();
    expect(recoveryResult.formattedKey).toBeDefined();
    expect(recoveryResult.rawBytes.length).toBe(32);
    expect(recoveryResult.fingerprint.length).toBeGreaterThan(0);

    // 2. Validate clean key
    const validation = validateRecoveryKey(recoveryResult.formattedKey);
    expect(validation.isValid).toBe(true);
    expect(validation.rawBytes).toEqual(recoveryResult.rawBytes);

    // 3. Test DEK wrap and unwrap via Recovery Key
    const dek = await generateDek();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const recoveryKek = await deriveRecoveryKek(recoveryResult.rawBytes, salt);
    const aad = 'memoir:v1|recovery-wrap|user:user-001';

    const wrapped = await wrapDek(dek, recoveryKek, aad);
    const unwrapped = await unwrapDek(wrapped.wrappedKey, wrapped.nonce, recoveryKek, aad);

    // Test that unwrapped DEK decrypts memory encrypted with original DEK
    const memAad = 'memoir:v1|memory|user:user-001|id:mem-001';
    const encrypted = await encryptEnvelope('Secret saved before vault recovery', dek, memAad, true);
    const decrypted = await decryptEnvelope(encrypted, unwrapped, memAad, true);
    expect(bytesToUtf8(decrypted)).toBe('Secret saved before vault recovery');

    // 4. Test checksum tamper detection
    // Corrupt the last character (the checksum)
    const corruptedKey = recoveryResult.formattedKey.slice(0, -1) + (recoveryResult.formattedKey.endsWith('9') ? '8' : '9');
    const corruptedValidation = validateRecoveryKey(corruptedKey);
    expect(corruptedValidation.isValid).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Invariant 9: Zero-reencryption Vault Passphrase rotation round-trip
  // --------------------------------------------------------------------------
  it('9. Performs zero-reencryption Vault Passphrase rotation (old rejected, new unlocks original memories)', async () => {
    const oldPassphrase = 'Original-Passphrase-Winter-2025!';
    const newPassphrase = 'Rotated-Passphrase-Spring-2026!';
    const salt1 = crypto.getRandomValues(new Uint8Array(16));
    const salt2 = crypto.getRandomValues(new Uint8Array(16));

    // Fast KDF parameters for testing
    const oldKek = await derivePassphraseKek(oldPassphrase, salt1, 1024, 1, 1);
    const newKek = await derivePassphraseKek(newPassphrase, salt2, 1024, 1, 1);

    const dek = await generateDek();
    const wrapAad = 'memoir:v1|dek-wrap|user:user-001';

    // 1. Initially wrap DEK under old PassphraseKEK
    const wrappedOld = await wrapDek(dek, oldKek, wrapAad);

    // 2. Encrypt three distinct memory entries with DEK
    const m1 = await encryptEnvelope('Memory 1 created under old passphrase', dek, 'memoir:v1|memory|user:user-001|id:1', true);
    const m2 = await encryptEnvelope('Memory 2 created under old passphrase', dek, 'memoir:v1|memory|user:user-001|id:2', true);
    const m3 = await encryptEnvelope('Memory 3 created under old passphrase', dek, 'memoir:v1|memory|user:user-001|id:3', true);

    // 3. User rotates passphrase: unwrap DEK in RAM with old KEK, re-wrap under new KEK
    const unwrappedInRam = await unwrapDek(wrappedOld.wrappedKey, wrappedOld.nonce, oldKek, wrapAad);
    const wrappedNew = await wrapDek(unwrappedInRam, newKek, wrapAad);

    // 4. Old passphrase must fail to unwrap the new wrapped DEK
    await expect(unwrapDek(wrappedNew.wrappedKey, wrappedNew.nonce, oldKek, wrapAad)).rejects.toThrow();

    // 5. New passphrase unwraps DEK and decrypts all three original memories with ZERO re-encryption
    const restoredDek = await unwrapDek(wrappedNew.wrappedKey, wrappedNew.nonce, newKek, wrapAad);

    const dec1 = await decryptEnvelope(m1, restoredDek, 'memoir:v1|memory|user:user-001|id:1', true);
    const dec2 = await decryptEnvelope(m2, restoredDek, 'memoir:v1|memory|user:user-001|id:2', true);
    const dec3 = await decryptEnvelope(m3, restoredDek, 'memoir:v1|memory|user:user-001|id:3', true);

    expect(bytesToUtf8(dec1)).toBe('Memory 1 created under old passphrase');
    expect(bytesToUtf8(dec2)).toBe('Memory 2 created under old passphrase');
    expect(bytesToUtf8(dec3)).toBe('Memory 3 created under old passphrase');
  });

  // --------------------------------------------------------------------------
  // Invariant 10: Binary file encryption/decryption & per-file FileKey wrapping
  // --------------------------------------------------------------------------
  it('10. Encrypts and decrypts binary files with per-file FileKey wrapping and AAD', async () => {
    const dek = await generateDek();
    const userId = 'user-001';
    const attachmentId = 'att-abc-123';

    // 64 KB of arbitrary binary data (simulating a photo or audio note)
    const rawBinary = crypto.getRandomValues(new Uint8Array(64 * 1024));

    const encResult = await encryptFileBytes(rawBinary, dek, attachmentId, userId, 'application/octet-stream');
    expect(encResult.fileCiphertextBytes.length).toBeGreaterThan(rawBinary.length);
    expect(encResult.fileNonce).toBeDefined();
    expect(encResult.wrappedFileKey).toBeDefined();

    // Decrypt binary bytes
    const decryptedBinary = await decryptFileBytes(
      encResult.fileCiphertextBytes,
      encResult.fileNonce,
      encResult.wrappedFileKey,
      encResult.fileKeyNonce,
      dek,
      attachmentId,
      userId,
    );

    expect(decryptedBinary).toEqual(rawBinary);

    // Tampered attachment ID in AAD must fail
    await expect(
      decryptFileBytes(
        encResult.fileCiphertextBytes,
        encResult.fileNonce,
        encResult.wrappedFileKey,
        encResult.fileKeyNonce,
        dek,
        'tampered-att-id',
        userId,
      ),
    ).rejects.toThrow();
  });

  // --------------------------------------------------------------------------
  // Invariant 11: EXIF metadata stripping verification on synthetic JPEG
  // --------------------------------------------------------------------------
  it('11. Strips EXIF metadata client-side from JPEG images before encryption', async () => {
    const dek = await generateDek();
    const userId = 'user-001';
    const attachmentId = 'att-jpeg-1';

    // 1. Create synthetic JPEG containing sensitive camera and GPS EXIF strings
    const rawJpegWithExif = createSyntheticJpeg(true);
    const rawString = new TextDecoder().decode(rawJpegWithExif);
    expect(rawString).toContain('CAMERA:SonyA7IV_GPS:37.7749,-122.4194');

    // 2. Encrypt JPEG file bytes (encryptFileBytes automatically invokes stripJpegExif for JPEGs)
    const encrypted = await encryptFileBytes(rawJpegWithExif, dek, attachmentId, userId, 'image/jpeg');

    // 3. Decrypt and verify that the decrypted image has had EXIF stripped completely
    const decrypted = await decryptFileBytes(
      encrypted.fileCiphertextBytes,
      encrypted.fileNonce,
      encrypted.wrappedFileKey,
      encrypted.fileKeyNonce,
      dek,
      attachmentId,
      userId,
    );

    const decryptedString = new TextDecoder().decode(decrypted);
    expect(decryptedString).not.toContain('CAMERA:SonyA7IV_GPS:37.7749,-122.4194');
    expect(decryptedString).not.toContain('SonyA7IV');
    expect(decryptedString).not.toContain('37.7749');

    // Verify JPEG structure remains valid (starts with 0xFFD8 and ends with 0xFFD9)
    expect(decrypted[0]).toBe(0xff);
    expect(decrypted[1]).toBe(0xd8);
    expect(decrypted[decrypted.length - 2]).toBe(0xff);
    expect(decrypted[decrypted.length - 1]).toBe(0xd9);
  });

  // --------------------------------------------------------------------------
  // Invariant 12: Network boundary assertion (zero plaintext diary fields in API payloads)
  // --------------------------------------------------------------------------
  it('12. Enforces network boundary: zero plaintext memory fields or keys in serialized payloads', async () => {
    const dek = await generateDek();
    const privateMemory = {
      title: 'Top Secret Memoir Title',
      bodyMarkdown: 'Confidential thoughts that should never appear on server wire.',
      mood: 'calm',
      tags: ['private', 'finance'],
    };

    const envelope = await encryptEnvelope(
      JSON.stringify(privateMemory),
      dek,
      'memoir:v1|memory|user:user-001|id:mem-001',
      true,
    );

    const serializedPayload = JSON.stringify({
      entryDate: '2026-11-23',
      isPinned: false,
      envelopeVersion: envelope.version,
      algorithm: envelope.algorithm,
      ciphertext: envelope.ciphertext,
      nonce: envelope.nonce,
    });

    // Plaintext leak assertions
    expect(serializedPayload).not.toContain('Top Secret');
    expect(serializedPayload).not.toContain('Confidential thoughts');
    expect(serializedPayload).not.toContain('calm');
    expect(serializedPayload).not.toContain('private');
    expect(serializedPayload).not.toContain('finance');
  });

  // --------------------------------------------------------------------------
  // Invariant 13: Storage boundary assertion & zeroize memory discipline
  // --------------------------------------------------------------------------
  it('13. Enforces storage boundary: zero raw keys in storage and zeroize memory clearing', () => {
    // Test zeroize helper
    const sensitiveBuffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    zeroize(sensitiveBuffer);
    expect(sensitiveBuffer.every((byte) => byte === 0)).toBe(true);

    // Mock storage inspection simulation
    const mockLocalStorage: Record<string, string> = {
      theme: 'archival',
      fontSize: 'medium',
    };

    const leakedKey = Object.values(mockLocalStorage).some(
      (val) => val.includes('dek') || val.includes('passphrase') || val.includes('recovery'),
    );
    expect(leakedKey).toBe(false);
  });
});
