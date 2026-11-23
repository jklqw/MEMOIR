import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bytesToBase64Url,
  decryptEnvelope,
  derivePassphraseKek,
  encryptEnvelope,
  generateDek,
  validateRecoveryKey,
  wrapDek,
} from '@memoir/crypto';
import type { UserVaultResponse } from '@memoir/shared';
import { api } from '../src/lib/api.js';
import { useVaultStore } from '../src/stores/vaultStore.js';

// Mock localStorage and sessionStorage
const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    getAll: () => ({ ...store }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: storageMock });
Object.defineProperty(globalThis, 'sessionStorage', { value: storageMock });

describe('Browser VaultKeyStore Lifecycle & Zero-Secret Persistence', () => {
  const userId = '11111111-2222-3333-4444-555555555555';
  let serverVaultDb: UserVaultResponse | null = null;

  beforeEach(() => {
    storageMock.clear();
    useVaultStore.getState().lock();
    useVaultStore.setState({
      dek: null,
      vaultMetadata: null,
      isInitialized: false,
      isUnlocked: false,
      isLoading: false,
      error: null,
      idleTimeoutMinutes: 15,
    });
    vi.restoreAllMocks();
    serverVaultDb = null;
  });

  it('1. Initializes vault in browser RAM and verifies Recovery Key checksum', async () => {
    const passphrase = 'Initial-Vault-Passphrase-2026!';

    vi.spyOn(api, 'post').mockImplementation(async (endpoint, body) => {
      if (endpoint === '/api/v1/vault') {
        const payload = body as Record<string, unknown>;
        serverVaultDb = {
          id: 'vault-uuid-1',
          userId,
          kdfAlgorithm: 'ARGON2ID',
          kdfSalt: payload.kdfSalt as string,
          kdfMemory: 65536,
          kdfIterations: 3,
          kdfParallelism: 1,
          wrapAlgorithm: 'AES-256-GCM',
          envelopeVersion: 1,
          wrappedDek: payload.wrappedDek as string,
          wrappedDekNonce: payload.wrappedDekNonce as string,
          recoverySalt: payload.recoverySalt as string,
          recoveryWrappedDek: payload.recoveryWrappedDek as string,
          recoveryNonce: payload.recoveryNonce as string,
          recoveryKeyFingerprint: payload.recoveryKeyFingerprint as string,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return serverVaultDb;
      }
      throw new Error(`Unexpected POST to ${endpoint}`);
    });

    const { recoveryKey } = await useVaultStore.getState().setupVault(passphrase, userId);

    expect(recoveryKey).toBeDefined();
    // Crockford Base32 with checksum: 53 chars formatted into blocks of 4
    const validation = validateRecoveryKey(recoveryKey);
    expect(validation.isValid).toBe(true);
    expect(validation.rawBytes?.length).toBe(32);

    const state = useVaultStore.getState();
    expect(state.isInitialized).toBe(true);
    expect(state.isUnlocked).toBe(true);
    expect(state.dek).toBeDefined();
  });

  it('2. Fails closed when unlocking with an incorrect passphrase', async () => {
    const correctPassphrase = 'Correct-Vault-Passphrase!';
    const wrongPassphrase = 'Wrong-Vault-Passphrase-Guess!';

    // Setup dummy vault
    const dek = await generateDek();
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const kek = await derivePassphraseKek(correctPassphrase, saltBytes);
    const wrapped = await wrapDek(dek, kek, `memoir:v1|dek-wrap|user:${userId}`);

    const vaultMeta: UserVaultResponse = {
      id: 'vault-uuid-2',
      userId,
      kdfAlgorithm: 'ARGON2ID',
      kdfSalt: bytesToBase64Url(saltBytes),
      kdfMemory: 65536,
      kdfIterations: 3,
      kdfParallelism: 1,
      wrapAlgorithm: 'AES-256-GCM',
      envelopeVersion: 1,
      wrappedDek: wrapped.wrappedKey,
      wrappedDekNonce: wrapped.nonce,
      recoverySalt: 'dummy-salt',
      recoveryWrappedDek: 'dummy-wrapped',
      recoveryNonce: 'dummy-nonce',
      recoveryKeyFingerprint: 'dummy-fp',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    useVaultStore.setState({ vaultMetadata: vaultMeta, isInitialized: true });
    vi.spyOn(api, 'get').mockResolvedValue(vaultMeta);

    // Attempt unlock with wrong passphrase
    await expect(useVaultStore.getState().unlock(wrongPassphrase, userId)).rejects.toThrow(
      'Incorrect vault passphrase.',
    );

    const state = useVaultStore.getState();
    expect(state.isUnlocked).toBe(false);
    expect(state.dek).toBeNull();
  });

  it('3. Rescues access via Recovery Key and unwraps the identical DEK', async () => {
    const originalPassphrase = 'Original-Passphrase-2026!';
    let savedRecoveryKey = '';

    vi.spyOn(api, 'post').mockImplementation(async (endpoint, body) => {
      const payload = body as Record<string, unknown>;
      serverVaultDb = {
        id: 'vault-uuid-3',
        userId,
        kdfAlgorithm: 'ARGON2ID',
        kdfSalt: payload.kdfSalt as string,
        kdfMemory: 65536,
        kdfIterations: 3,
        kdfParallelism: 1,
        wrapAlgorithm: 'AES-256-GCM',
        envelopeVersion: 1,
        wrappedDek: payload.wrappedDek as string,
        wrappedDekNonce: payload.wrappedDekNonce as string,
        recoverySalt: payload.recoverySalt as string,
        recoveryWrappedDek: payload.recoveryWrappedDek as string,
        recoveryNonce: payload.recoveryNonce as string,
        recoveryKeyFingerprint: payload.recoveryKeyFingerprint as string,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return serverVaultDb;
    });

    // 1. Initial setup
    const setupResult = await useVaultStore.getState().setupVault(originalPassphrase, userId);
    savedRecoveryKey = setupResult.recoveryKey;
    const initialDek = useVaultStore.getState().dek!;

    // Encrypt test memory with original DEK
    const testSecretMessage = 'Archival Zero-Knowledge Test Memory';
    const aad = `memoir:v1|memory|user:${userId}|id:memory-1`;
    const encryptedMemory = await encryptEnvelope(testSecretMessage, initialDek, aad, true);

    // 2. Lock vault (simulate forgotten passphrase / browser restart)
    useVaultStore.getState().lock();
    expect(useVaultStore.getState().isUnlocked).toBe(false);
    expect(useVaultStore.getState().dek).toBeNull();

    // 3. Unlock with Recovery Key
    await useVaultStore.getState().unlockWithRecovery(savedRecoveryKey, userId);

    const recoveredDek = useVaultStore.getState().dek!;
    expect(useVaultStore.getState().isUnlocked).toBe(true);

    // 4. Verify recovered DEK successfully decrypts the original memory
    const decryptedBytes = await decryptEnvelope(encryptedMemory, recoveredDek, aad, true);
    const decryptedMessage = new TextDecoder().decode(decryptedBytes);
    expect(decryptedMessage).toBe(testSecretMessage);
  });

  it('4. Performs zero-reencryption passphrase rotation without changing the DEK', async () => {
    const oldPassphrase = 'Old-Passphrase-12345!';
    const newPassphrase = 'New-Passphrase-67890!';

    vi.spyOn(api, 'post').mockImplementation(async (endpoint, body) => {
      const payload = body as Record<string, unknown>;
      if (endpoint === '/api/v1/vault') {
        serverVaultDb = {
          id: 'vault-uuid-4',
          userId,
          kdfAlgorithm: 'ARGON2ID',
          kdfSalt: payload.kdfSalt as string,
          kdfMemory: 65536,
          kdfIterations: 3,
          kdfParallelism: 1,
          wrapAlgorithm: 'AES-256-GCM',
          envelopeVersion: 1,
          wrappedDek: payload.wrappedDek as string,
          wrappedDekNonce: payload.wrappedDekNonce as string,
          recoverySalt: payload.recoverySalt as string,
          recoveryWrappedDek: payload.recoveryWrappedDek as string,
          recoveryNonce: payload.recoveryNonce as string,
          recoveryKeyFingerprint: payload.recoveryKeyFingerprint as string,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return serverVaultDb;
      }
      if (endpoint === '/api/v1/vault/rotate-passphrase') {
        serverVaultDb = {
          ...serverVaultDb!,
          kdfSalt: payload.kdfSalt as string,
          wrappedDek: payload.wrappedDek as string,
          wrappedDekNonce: payload.wrappedDekNonce as string,
          updatedAt: new Date().toISOString(),
        };
        return serverVaultDb;
      }
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    });

    await useVaultStore.getState().setupVault(oldPassphrase, userId);
    const originalDek = useVaultStore.getState().dek!;

    // Encrypt memory before rotation
    const testSecret = 'Historical record before passphrase rotation';
    const aad = `memoir:v1|memory|user:${userId}|id:memory-rotated`;
    const encryptedPayload = await encryptEnvelope(testSecret, originalDek, aad, true);

    // Rotate passphrase
    await useVaultStore.getState().rotatePassphrase(newPassphrase, userId);

    // Lock vault
    useVaultStore.getState().lock();

    // Old passphrase must now fail closed
    vi.spyOn(api, 'get').mockResolvedValue(serverVaultDb!);
    await expect(useVaultStore.getState().unlock(oldPassphrase, userId)).rejects.toThrow();

    // New passphrase unlocks original DEK
    await useVaultStore.getState().unlock(newPassphrase, userId);
    expect(useVaultStore.getState().isUnlocked).toBe(true);

    // Decrypt historical memory successfully without re-encryption
    const decrypted = await decryptEnvelope(
      encryptedPayload,
      useVaultStore.getState().dek!,
      aad,
      true,
    );
    expect(new TextDecoder().decode(decrypted)).toBe(testSecret);
  });

  it('5. Enforces zero persistence: locking immediately purges DEK and zero keys enter localStorage', async () => {
    const passphrase = 'Passphrase-For-Storage-Audit!';

    vi.spyOn(api, 'post').mockImplementation(async (_endpoint, body) => {
      const payload = body as Record<string, unknown>;
      return {
        id: 'vault-uuid-5',
        userId,
        kdfAlgorithm: 'ARGON2ID',
        kdfSalt: payload.kdfSalt as string,
        kdfMemory: 65536,
        kdfIterations: 3,
        kdfParallelism: 1,
        wrapAlgorithm: 'AES-256-GCM',
        envelopeVersion: 1,
        wrappedDek: payload.wrappedDek as string,
        wrappedDekNonce: payload.wrappedDekNonce as string,
        recoverySalt: payload.recoverySalt as string,
        recoveryWrappedDek: payload.recoveryWrappedDek as string,
        recoveryNonce: payload.recoveryNonce as string,
        recoveryKeyFingerprint: 'fp-5',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    await useVaultStore.getState().setupVault(passphrase, userId);
    expect(useVaultStore.getState().isUnlocked).toBe(true);

    // Audit localStorage and sessionStorage while unlocked
    const allStorage = {
      local: storageMock.getAll(),
      session: storageMock.getAll(),
    };
    const storageDump = JSON.stringify(allStorage);

    expect(storageDump).not.toContain(passphrase);
    expect(storageDump).not.toContain('dek');
    expect(storageDump).not.toContain('DEK');
    expect(storageDump).not.toContain('CryptoKey');

    // Call lock()
    useVaultStore.getState().lock();

    // Assert volatile state is wiped
    const state = useVaultStore.getState();
    expect(state.dek).toBeNull();
    expect(state.isUnlocked).toBe(false);
  });

  it('6. Triggers auto-lock and clears volatile DEK upon idle timeout', async () => {
    vi.useFakeTimers();

    const passphrase = 'Passphrase-For-Idle-Timer!';
    vi.spyOn(api, 'post').mockResolvedValue({
      id: 'vault-uuid-6',
      userId,
      kdfAlgorithm: 'ARGON2ID',
      kdfSalt: 'salt',
      kdfMemory: 65536,
      kdfIterations: 3,
      kdfParallelism: 1,
      wrapAlgorithm: 'AES-256-GCM',
      envelopeVersion: 1,
      wrappedDek: 'wrapped',
      wrappedDekNonce: 'nonce',
      recoverySalt: 'salt',
      recoveryWrappedDek: 'wrapped',
      recoveryNonce: 'nonce',
      recoveryKeyFingerprint: 'fp-6',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await useVaultStore.getState().setupVault(passphrase, userId);
    expect(useVaultStore.getState().isUnlocked).toBe(true);
    expect(useVaultStore.getState().dek).not.toBeNull();

    // Fast-forward 15 minutes of idle time
    vi.advanceTimersByTime(15 * 60 * 1000 + 100);

    // Vault must now be auto-locked
    expect(useVaultStore.getState().isUnlocked).toBe(false);
    expect(useVaultStore.getState().dek).toBeNull();

    vi.useRealTimers();
  });
});
