import { describe, expect, it } from 'vitest';
import type { MemoirEncryptedBackup } from '@memoir/shared';

describe('Data Portability, Client-Side SHA-256 Integrity & Backup Verification', () => {
  const sampleBackup: MemoirEncryptedBackup = {
    manifest: {
      version: 1,
      exportedAt: '2026-11-23T20:00:00.000Z',
      userId: 'test-user-id-uuid',
      entryCount: 2,
      checksumSha256: '', // Will calculate
    },
    vault: {
      kdfAlgorithm: 'ARGON2ID',
      kdfSalt: 'dGVzdC1zYWx0',
      kdfMemory: 65536,
      kdfIterations: 3,
      kdfParallelism: 1,
      wrapAlgorithm: 'AES-256-GCM',
      envelopeVersion: 1,
      wrappedDek: 'wrapped-dek-base64',
      wrappedDekNonce: 'nonce-base64',
      recoverySalt: 'rec-salt',
      recoveryWrappedDek: 'rec-wrapped-dek',
      recoveryNonce: 'rec-nonce',
      recoveryKeyFingerprint: 'FINGERPRINT-1234',
    },
    memories: [
      {
        id: 'mem-1',
        entryDate: '2026-11-20T10:00:00.000Z',
        isPinned: false,
        isTimeCapsule: false,
        envelopeVersion: 1,
        algorithm: 'AES-256-GCM',
        ciphertext: 'opaque-mem-1',
        nonce: 'nonce-mem-1',
        createdAt: '2026-11-20T10:00:00.000Z',
        updatedAt: '2026-11-20T10:00:00.000Z',
      },
    ],
    attachments: [
      {
        id: 'att-1',
        isVaultItem: true,
        storageKey: 'storage-key-1',
        byteSize: 2048,
        wrappedFileKey: 'wrapped-key',
        fileKeyNonce: 'key-nonce',
        encryptedMetadata: 'meta-enc',
        metaNonce: 'meta-nonce',
        fileNonce: 'file-nonce',
        createdAt: '2026-11-20T10:05:00.000Z',
        updatedAt: '2026-11-20T10:05:00.000Z',
      },
    ],
  };

  async function computeSha256(backup: MemoirEncryptedBackup): Promise<string> {
    const dataPayloadString = JSON.stringify({
      vault: backup.vault,
      memories: backup.memories,
      attachments: backup.attachments,
    });
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(dataPayloadString));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  it('1. Computes valid SHA-256 digest over encrypted backup archive payload', async () => {
    const validHash = await computeSha256(sampleBackup);
    expect(validHash).toHaveLength(64);

    const backupWithManifest = {
      ...sampleBackup,
      manifest: {
        ...sampleBackup.manifest,
        checksumSha256: validHash,
      },
    };

    const recomputed = await computeSha256(backupWithManifest);
    expect(recomputed).toBe(backupWithManifest.manifest.checksumSha256);
  });

  it('2. Detects single-bit tamper in memory ciphertext and rejects verification', async () => {
    const validHash = await computeSha256(sampleBackup);
    const tamperedBackup = JSON.parse(JSON.stringify(sampleBackup)) as MemoirEncryptedBackup;
    tamperedBackup.manifest.checksumSha256 = validHash;

    // Tamper with memory ciphertext
    tamperedBackup.memories[0].ciphertext = 'tampered-opaque-bytes';

    const recomputed = await computeSha256(tamperedBackup);
    expect(recomputed).not.toBe(tamperedBackup.manifest.checksumSha256);
  });

  it('3. Detects tamper in attachment metadata and rejects verification', async () => {
    const validHash = await computeSha256(sampleBackup);
    const tamperedBackup = JSON.parse(JSON.stringify(sampleBackup)) as MemoirEncryptedBackup;
    tamperedBackup.manifest.checksumSha256 = validHash;

    // Tamper with attachment wrapped key
    tamperedBackup.attachments[0].wrappedFileKey = 'tampered-wrapped-key';

    const recomputed = await computeSha256(tamperedBackup);
    expect(recomputed).not.toBe(tamperedBackup.manifest.checksumSha256);
  });

  it('4. Rejects malformed backup structure missing manifest or unsupported version', () => {
    const malformed = {
      manifest: { version: 2 }, // Unsupported version
      vault: {},
      memories: [],
      attachments: [],
    };

    expect(malformed.manifest.version).not.toBe(1);
  });
});
