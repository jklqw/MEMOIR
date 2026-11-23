import {
  base64UrlToBytes,
  bytesToBase64Url,
  toBufferSource,
  utf8ToBytes,
} from './encoding.util.js';
import { padPayload, unpadPayload } from './padding.js';
import {
  type CiphertextEnvelope,
  CRYPTO_ALGORITHM,
  ENVELOPE_VERSION,
  type WrappedKeyEnvelope,
} from './types.js';

/**
 * Generates a fresh random 256-bit AES-GCM Data Encryption Key (DEK).
 */
export async function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // Extractable only for wrapping operations
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
  );
}

/**
 * Wraps a DEK under a Key Encryption Key (PassphraseKEK or RecoveryKEK) using AES-256-GCM
 * with a fresh 12-byte CSPRNG nonce and cryptographically bound AAD.
 */
export async function wrapDek(
  dek: CryptoKey,
  wrappingKey: CryptoKey,
  aadString: string,
): Promise<WrappedKeyEnvelope> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aad = utf8ToBytes(aadString);

  const wrappedBuffer = await crypto.subtle.wrapKey('raw', dek, wrappingKey, {
    name: 'AES-GCM',
    iv: toBufferSource(nonce),
    additionalData: toBufferSource(aad),
  });

  return {
    wrappedKey: bytesToBase64Url(new Uint8Array(wrappedBuffer)),
    nonce: bytesToBase64Url(nonce),
  };
}

/**
 * Unwraps a DEK using a Key Encryption Key (PassphraseKEK or RecoveryKEK) and AAD.
 * Fails closed with an error if key, nonce, or AAD does not authenticate.
 */
export async function unwrapDek(
  wrappedKeyBase64: string,
  nonceBase64: string,
  unwrappingKey: CryptoKey,
  aadString: string,
): Promise<CryptoKey> {
  const wrappedKeyBytes = base64UrlToBytes(wrappedKeyBase64);
  const nonceBytes = base64UrlToBytes(nonceBase64);

  if (nonceBytes.length !== 12) {
    throw new Error(`Invalid nonce length: expected 12 bytes, got ${nonceBytes.length}.`);
  }

  const aad = utf8ToBytes(aadString);

  return crypto.subtle.unwrapKey(
    'raw',
    toBufferSource(wrappedKeyBytes),
    unwrappingKey,
    {
      name: 'AES-GCM',
      iv: toBufferSource(nonceBytes),
      additionalData: toBufferSource(aad),
    },
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
  );
}

/**
 * Encrypts a payload into a versioned self-describing CiphertextEnvelope.
 * Generates a fresh 12-byte CSPRNG nonce for every single call.
 */
export async function encryptEnvelope(
  data: Uint8Array | string,
  key: CryptoKey,
  aadString: string,
  shouldPad = false,
): Promise<CiphertextEnvelope> {
  const rawBytes = typeof data === 'string' ? utf8ToBytes(data) : data;
  const bytesToEncrypt = shouldPad ? padPayload(rawBytes) : rawBytes;

  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aad = utf8ToBytes(aadString);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toBufferSource(nonce),
      additionalData: toBufferSource(aad),
    },
    key,
    toBufferSource(bytesToEncrypt),
  );

  return {
    version: ENVELOPE_VERSION,
    algorithm: CRYPTO_ALGORITHM,
    nonce: bytesToBase64Url(nonce),
    ciphertext: bytesToBase64Url(new Uint8Array(encryptedBuffer)),
  };
}

/**
 * Decrypts a versioned CiphertextEnvelope with AAD binding.
 * Rejects unsupported versions, malformed nonces, or tampered ciphertexts.
 */
export async function decryptEnvelope(
  envelope: CiphertextEnvelope,
  key: CryptoKey,
  aadString: string,
  wasPadded = false,
): Promise<Uint8Array> {
  if (envelope.version !== ENVELOPE_VERSION) {
    throw new Error(`Unsupported ciphertext envelope version: ${envelope.version}.`);
  }

  if (envelope.algorithm !== CRYPTO_ALGORITHM) {
    throw new Error(`Unsupported ciphertext algorithm: ${envelope.algorithm}.`);
  }

  const nonceBytes = base64UrlToBytes(envelope.nonce);
  if (nonceBytes.length !== 12) {
    throw new Error(
      `Invalid nonce length in envelope: expected 12 bytes, got ${nonceBytes.length}.`,
    );
  }

  const ciphertextBytes = base64UrlToBytes(envelope.ciphertext);
  const aad = utf8ToBytes(aadString);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toBufferSource(nonceBytes),
      additionalData: toBufferSource(aad),
    },
    key,
    toBufferSource(ciphertextBytes),
  );

  const decryptedBytes = new Uint8Array(decryptedBuffer);
  return wasPadded ? unpadPayload(decryptedBytes) : decryptedBytes;
}
