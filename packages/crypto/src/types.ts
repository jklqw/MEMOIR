/**
 * Versioned Ciphertext Envelope
 */
export interface CiphertextEnvelope {
  version: 1;
  algorithm: 'AES-256-GCM';
  nonce: string; // base64url encoded 12-byte CSPRNG nonce
  ciphertext: string; // base64url encoded ciphertext + 16-byte GCM auth tag
}

export interface WrappedKeyEnvelope {
  wrappedKey: string; // base64url encoded wrapped key bytes
  nonce: string; // base64url encoded 12-byte nonce
}

export interface EncryptedFileResult {
  fileCiphertextBytes: Uint8Array;
  fileNonce: string; // base64url
  wrappedFileKey: string; // base64url
  fileKeyNonce: string; // base64url
}

export interface RecoveryKeyResult {
  formattedKey: string;
  rawBytes: Uint8Array;
  fingerprint: string;
}

export const CRYPTO_ALGORITHM = 'AES-256-GCM' as const;
export const ENVELOPE_VERSION = 1 as const;
export const BLOCK_PADDING_BYTES = 256;

export const HKDF_INFO_PASSPHRASE_KEK = 'memoir:v1|kdf|passphrase-kek';
export const HKDF_INFO_RECOVERY_KEK = 'memoir:v1|kdf|recovery-kek';

export const ARGON2_DEFAULT_MEMORY = 65536; // 64 MiB
export const ARGON2_DEFAULT_ITERATIONS = 3;
export const ARGON2_DEFAULT_PARALLELISM = 1;
