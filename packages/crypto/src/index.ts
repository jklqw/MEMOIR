/**
 * @memoir/crypto
 * Zero-knowledge client cryptography engine.
 */

export interface CiphertextEnvelope {
  version: number;
  algorithm: string;
  nonce: string;
  ciphertext: string;
}

export const CRYPTO_ALGORITHM = 'AES-256-GCM';
export const ENVELOPE_VERSION = 1;
export const BLOCK_PADDING_BYTES = 256;
