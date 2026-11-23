import {
  base64UrlToBytes,
  bytesToBase64Url,
  derivePassphraseKek,
  deriveRecoveryKek,
  generateDek,
  generateRecoveryKey,
  unwrapDek,
  validateRecoveryKey,
  wrapDek,
  zeroize,
} from '@memoir/crypto';
import type { UserVaultResponse } from '@memoir/shared';
import { create } from 'zustand';
import { api } from '../lib/api.js';

export interface VaultState {
  dek: CryptoKey | null;
  vaultMetadata: UserVaultResponse | null;
  isInitialized: boolean;
  isUnlocked: boolean;
  isLoading: boolean;
  error: string | null;
  idleTimeoutMinutes: number;

  fetchVault: () => Promise<UserVaultResponse | null>;
  setupVault: (passphrase: string, userId: string) => Promise<{ recoveryKey: string }>;
  unlock: (passphrase: string, userId: string) => Promise<void>;
  unlockWithRecovery: (recoveryKey: string, userId: string) => Promise<void>;
  rotatePassphrase: (newPassphrase: string, userId: string) => Promise<void>;
  recoverVault: (
    recoveryKey: string,
    newPassphrase: string,
    userId: string,
  ) => Promise<{ newRecoveryKey: string }>;
  lock: () => void;
  resetActivityTimer: () => void;
  setIdleTimeoutMinutes: (minutes: number) => void;
}

let idleTimer: ReturnType<typeof setTimeout> | null = null;

export const useVaultStore = create<VaultState>((set, get) => ({
  dek: null,
  vaultMetadata: null,
  isInitialized: false,
  isUnlocked: false,
  isLoading: false,
  error: null,
  idleTimeoutMinutes: 15,

  fetchVault: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.get<UserVaultResponse | null>('/api/v1/vault');
      set({
        vaultMetadata: data,
        isInitialized: !!data,
        isLoading: false,
      });
      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch vault';
      set({ error: message, isLoading: false, isInitialized: false });
      return null;
    }
  },

  setupVault: async (passphrase: string, userId: string) => {
    set({ isLoading: true, error: null });
    try {
      // 1. Generate random 256-bit AES-GCM DEK
      const dek = await generateDek();

      // 2. Generate random 16-byte KDF salt & derive PassphraseKEK
      const kdfSaltBytes = crypto.getRandomValues(new Uint8Array(16));
      const passphraseKek = await derivePassphraseKek(passphrase, kdfSaltBytes);

      // 3. Wrap DEK with PassphraseKEK and user context AAD
      const wrapped = await wrapDek(dek, passphraseKek, `memoir:v1|dek-wrap|user:${userId}`);

      // 4. Generate random 256-bit Crockford Base32 Recovery Key
      const recovery = await generateRecoveryKey();
      const recoverySaltBytes = crypto.getRandomValues(new Uint8Array(16));
      const recoveryKek = await deriveRecoveryKek(recovery.rawBytes, recoverySaltBytes);

      // 5. Wrap DEK with RecoveryKEK and user context AAD
      const recoveryWrapped = await wrapDek(
        dek,
        recoveryKek,
        `memoir:v1|recovery-wrap|user:${userId}`,
      );

      // 6. Overwrite sensitive intermediate recovery entropy in RAM
      zeroize(recovery.rawBytes);

      // 7. Persist wrapped key envelopes to server
      const vaultRecord = await api.post<UserVaultResponse>('/api/v1/vault', {
        kdfAlgorithm: 'ARGON2ID',
        kdfSalt: bytesToBase64Url(kdfSaltBytes),
        kdfMemory: 65536,
        kdfIterations: 3,
        kdfParallelism: 1,
        wrapAlgorithm: 'AES-256-GCM',
        envelopeVersion: 1,
        wrappedDek: wrapped.wrappedKey,
        wrappedDekNonce: wrapped.nonce,
        recoverySalt: bytesToBase64Url(recoverySaltBytes),
        recoveryWrappedDek: recoveryWrapped.wrappedKey,
        recoveryNonce: recoveryWrapped.nonce,
        recoveryKeyFingerprint: recovery.fingerprint,
      });

      set({
        dek,
        vaultMetadata: vaultRecord,
        isInitialized: true,
        isUnlocked: true,
        isLoading: false,
      });

      get().resetActivityTimer();

      return { recoveryKey: recovery.formattedKey };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to setup vault';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  unlock: async (passphrase: string, userId: string) => {
    set({ isLoading: true, error: null });
    try {
      let vault = get().vaultMetadata;
      if (!vault) {
        vault = await get().fetchVault();
      }

      if (!vault) {
        throw new Error('Vault has not been initialized for this account.');
      }

      const kdfSaltBytes = base64UrlToBytes(vault.kdfSalt);
      const passphraseKek = await derivePassphraseKek(
        passphrase,
        kdfSaltBytes,
        vault.kdfMemory,
        vault.kdfIterations,
        vault.kdfParallelism,
      );

      // Fails closed if wrong passphrase or tampered wrapped DEK
      const dek = await unwrapDek(
        vault.wrappedDek,
        vault.wrappedDekNonce,
        passphraseKek,
        `memoir:v1|dek-wrap|user:${userId}`,
      );

      set({
        dek,
        isUnlocked: true,
        isLoading: false,
      });

      get().resetActivityTimer();
    } catch {
      set({
        error: 'Incorrect vault passphrase or corrupted vault envelope.',
        isLoading: false,
      });
      throw new Error('Incorrect vault passphrase.');
    }
  },

  unlockWithRecovery: async (recoveryKey: string, userId: string) => {
    set({ isLoading: true, error: null });
    try {
      let vault = get().vaultMetadata;
      if (!vault) {
        vault = await get().fetchVault();
      }

      if (!vault) {
        throw new Error('Vault has not been initialized for this account.');
      }

      const validation = validateRecoveryKey(recoveryKey);
      if (!validation.isValid || !validation.rawBytes) {
        throw new Error(validation.error || 'Invalid recovery key format or checksum.');
      }
      const rawEntropy = validation.rawBytes;
      const recoverySaltBytes = base64UrlToBytes(vault.recoverySalt);
      const recoveryKek = await deriveRecoveryKek(rawEntropy, recoverySaltBytes);

      const dek = await unwrapDek(
        vault.recoveryWrappedDek,
        vault.recoveryNonce,
        recoveryKek,
        `memoir:v1|recovery-wrap|user:${userId}`,
      );

      zeroize(rawEntropy);

      set({
        dek,
        isUnlocked: true,
        isLoading: false,
      });

      get().resetActivityTimer();
    } catch {
      set({
        error: 'Invalid recovery key or recovery validation failed.',
        isLoading: false,
      });
      throw new Error('Invalid recovery key.');
    }
  },

  rotatePassphrase: async (newPassphrase: string, userId: string) => {
    const { dek } = get();
    if (!dek) {
      throw new Error('Vault must be unlocked to rotate passphrase.');
    }

    set({ isLoading: true, error: null });
    try {
      const newKdfSaltBytes = crypto.getRandomValues(new Uint8Array(16));
      const newPassphraseKek = await derivePassphraseKek(newPassphrase, newKdfSaltBytes);

      const newWrapped = await wrapDek(dek, newPassphraseKek, `memoir:v1|dek-wrap|user:${userId}`);

      const updatedVault = await api.post<UserVaultResponse>('/api/v1/vault/rotate-passphrase', {
        kdfSalt: bytesToBase64Url(newKdfSaltBytes),
        wrappedDek: newWrapped.wrappedKey,
        wrappedDekNonce: newWrapped.nonce,
      });

      set({
        vaultMetadata: updatedVault,
        isLoading: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to rotate passphrase';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  recoverVault: async (recoveryKey: string, newPassphrase: string, userId: string) => {
    set({ isLoading: true, error: null });
    try {
      let vault = get().vaultMetadata;
      if (!vault) {
        vault = await get().fetchVault();
      }
      if (!vault) {
        throw new Error('Vault has not been initialized.');
      }

      // Step 1: Unwrap DEK using recovery key
      const validation = validateRecoveryKey(recoveryKey);
      if (!validation.isValid || !validation.rawBytes) {
        throw new Error(validation.error || 'Invalid recovery key format or checksum.');
      }
      const rawEntropy = validation.rawBytes;
      const recoverySaltBytes = base64UrlToBytes(vault.recoverySalt);
      const recoveryKek = await deriveRecoveryKek(rawEntropy, recoverySaltBytes);

      const dek = await unwrapDek(
        vault.recoveryWrappedDek,
        vault.recoveryNonce,
        recoveryKek,
        `memoir:v1|recovery-wrap|user:${userId}`,
      );
      zeroize(rawEntropy);

      // Step 2: Establish new passphrase
      const newKdfSaltBytes = crypto.getRandomValues(new Uint8Array(16));
      const newPassphraseKek = await derivePassphraseKek(newPassphrase, newKdfSaltBytes);
      const newWrapped = await wrapDek(dek, newPassphraseKek, `memoir:v1|dek-wrap|user:${userId}`);

      // Step 3: Issue fresh Recovery Key to replace the used one
      const newRecovery = await generateRecoveryKey();
      const newRecoverySaltBytes = crypto.getRandomValues(new Uint8Array(16));
      const newRecoveryKek = await deriveRecoveryKek(newRecovery.rawBytes, newRecoverySaltBytes);
      const newRecoveryWrapped = await wrapDek(
        dek,
        newRecoveryKek,
        `memoir:v1|recovery-wrap|user:${userId}`,
      );
      zeroize(newRecovery.rawBytes);

      // Step 4: Persist recovered state
      const updatedVault = await api.post<UserVaultResponse>('/api/v1/vault/recover', {
        kdfSalt: bytesToBase64Url(newKdfSaltBytes),
        wrappedDek: newWrapped.wrappedKey,
        wrappedDekNonce: newWrapped.nonce,
        recoverySalt: bytesToBase64Url(newRecoverySaltBytes),
        recoveryWrappedDek: newRecoveryWrapped.wrappedKey,
        recoveryNonce: newRecoveryWrapped.nonce,
        recoveryKeyFingerprint: newRecovery.fingerprint,
      });

      set({
        dek,
        vaultMetadata: updatedVault,
        isUnlocked: true,
        isLoading: false,
      });

      get().resetActivityTimer();

      return { newRecoveryKey: newRecovery.formattedKey };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to recover vault';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  lock: () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    // Volatile RAM clear: DEK reference is eliminated
    set({
      dek: null,
      isUnlocked: false,
    });
  },

  resetActivityTimer: () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }

    const { idleTimeoutMinutes, isUnlocked, lock } = get();
    if (!isUnlocked) return;

    const timeoutMs = idleTimeoutMinutes * 60 * 1000;
    idleTimer = setTimeout(() => {
      lock();
    }, timeoutMs);
  },

  setIdleTimeoutMinutes: (minutes: number) => {
    set({ idleTimeoutMinutes: minutes });
    get().resetActivityTimer();
  },
}));
