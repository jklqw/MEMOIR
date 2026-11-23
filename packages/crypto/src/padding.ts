import { BLOCK_PADDING_BYTES } from './types.js';

/**
 * Applies deterministic length-prefixed block padding to a 256-byte boundary.
 * Reduces side-channel leakage through ciphertext lengths.
 *
 * Buffer layout:
 * [4-byte big-endian length L] [L payload bytes] [0x00 padding bytes up to boundary]
 */
export function padPayload(payload: Uint8Array): Uint8Array {
  const payloadLen = payload.byteLength;
  const totalNeeded = payloadLen + 4;
  const paddedLen = Math.ceil(totalNeeded / BLOCK_PADDING_BYTES) * BLOCK_PADDING_BYTES;

  const padded = new Uint8Array(paddedLen);
  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);

  // Write 4-byte big-endian length prefix
  view.setUint32(0, payloadLen, false);

  // Copy payload bytes
  padded.set(payload, 4);

  // Remaining bytes are initialized to 0x00 by Uint8Array allocation
  return padded;
}

/**
 * Verifies and removes deterministic length-prefixed block padding.
 * Throws an error if padding is malformed or tampered with.
 */
export function unpadPayload(padded: Uint8Array): Uint8Array {
  if (padded.byteLength < BLOCK_PADDING_BYTES || padded.byteLength % BLOCK_PADDING_BYTES !== 0) {
    throw new Error(
      `Malformed padded payload: length ${padded.byteLength} is not a valid 256-byte multiple.`,
    );
  }

  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  const payloadLen = view.getUint32(0, false);

  if (4 + payloadLen > padded.byteLength) {
    throw new Error(
      `Malformed padding length prefix: claims ${payloadLen} bytes in buffer of ${padded.byteLength} bytes.`,
    );
  }

  // Verify all trailing padding bytes are 0x00 (strict constant check)
  for (let i = 4 + payloadLen; i < padded.byteLength; i++) {
    if (padded[i] !== 0) {
      throw new Error('Malformed padding: non-zero byte encountered in trailing padding.');
    }
  }

  // Extract payload
  const result = new Uint8Array(payloadLen);
  result.set(padded.subarray(4, 4 + payloadLen));
  return result;
}
