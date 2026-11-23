import { argon2id } from 'hash-wasm';
import { toBufferSource, utf8ToBytes, zeroize } from './encoding.util.js';
import {
  ARGON2_DEFAULT_ITERATIONS,
  ARGON2_DEFAULT_MEMORY,
  ARGON2_DEFAULT_PARALLELISM,
  HKDF_INFO_PASSPHRASE_KEK,
  HKDF_INFO_RECOVERY_KEK,
} from './types.js';

/**
 * Derives a 256-bit AES-GCM Key Encryption Key (PassphraseKEK) from the user's
 * Vault Passphrase using Argon2id and HKDF-SHA256 domain separation.
 */
export async function derivePassphraseKek(
  passphrase: string,
  salt: Uint8Array,
  memoryCost = ARGON2_DEFAULT_MEMORY,
  iterations = ARGON2_DEFAULT_ITERATIONS,
  parallelism = ARGON2_DEFAULT_PARALLELISM,
): Promise<CryptoKey> {
  // Step 1: Memory-hard Argon2id key derivation via WebAssembly
  const masterSecretBytes = await argon2id({
    password: passphrase,
    salt,
    memorySize: memoryCost,
    iterations,
    parallelism,
    hashLength: 32,
    outputType: 'binary',
  });

  try {
    // Step 2: Import intermediate key into WebCrypto HKDF
    const hkdfMasterKey = await crypto.subtle.importKey(
      'raw',
      toBufferSource(masterSecretBytes),
      'HKDF',
      false,
      ['deriveKey'],
    );

    // Step 3: HKDF-SHA256 domain expansion to PassphraseKEK
    const passphraseKek = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: toBufferSource(salt),
        info: toBufferSource(utf8ToBytes(HKDF_INFO_PASSPHRASE_KEK)),
      },
      hkdfMasterKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false, // Never extractable
      ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
    );

    return passphraseKek;
  } finally {
    // Overwrite intermediate master secret in volatile memory
    zeroize(masterSecretBytes);
  }
}

/**
 * Derives a 256-bit AES-GCM Key Encryption Key (RecoveryKEK) from raw 256-bit
 * recovery key entropy using HKDF-SHA256 domain separation.
 */
export async function deriveRecoveryKek(
  recoveryRawEntropy: Uint8Array,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const hkdfMasterKey = await crypto.subtle.importKey(
    'raw',
    toBufferSource(recoveryRawEntropy),
    'HKDF',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toBufferSource(salt),
      info: toBufferSource(utf8ToBytes(HKDF_INFO_RECOVERY_KEK)),
    },
    hkdfMasterKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
  );
}
