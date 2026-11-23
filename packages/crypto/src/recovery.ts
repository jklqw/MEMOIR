import { bytesToBase64Url } from './encoding.util.js';
import type { RecoveryKeyResult } from './types.js';

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CROCKFORD_CHECKSUM_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U';

/**
 * Encodes 32 bytes of entropy into Crockford Base32 with a Modulo-37 checksum.
 */
export function encodeCrockford(bytes: Uint8Array): string {
  if (bytes.length !== 32) {
    throw new Error('Recovery key entropy must be exactly 32 bytes (256 bits).');
  }

  // Convert 32 bytes to binary bit string
  let bits = '';
  for (let i = 0; i < bytes.length; i++) {
    bits += bytes[i]!.toString(2).padStart(8, '0');
  }
  // Pad bit string to nearest 5-bit multiple (256 -> 260 bits)
  while (bits.length % 5 !== 0) {
    bits += '0';
  }

  let encoded = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5);
    encoded += CROCKFORD_ALPHABET[parseInt(chunk, 2)];
  }

  // Compute Modulo-37 checksum on the 256-bit integer
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  const bigNum = BigInt(`0x${hex}`);
  const checksumChar = CROCKFORD_CHECKSUM_CHARS[Number(bigNum % 37n)]!;

  return encoded + checksumChar;
}

/**
 * Decodes a Crockford Base32 string with checksum verification back to 32 bytes entropy.
 * Fails closed if the format is invalid or checksum mismatches.
 */
export function decodeCrockford(formattedKey: string): Uint8Array {
  // Normalize: uppercase, remove hyphens/spaces, alias I/L -> 1, O -> 0
  const clean = formattedKey
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');

  if (clean.length !== 53) {
    throw new Error(
      `Invalid recovery key length: expected 53 characters, received ${clean.length}.`,
    );
  }

  const body = clean.slice(0, 52);
  const providedChecksum = clean.slice(52);

  let bits = '';
  for (const char of body) {
    const val = CROCKFORD_ALPHABET.indexOf(char);
    if (val === -1) {
      throw new Error(`Invalid character '${char}' in recovery key.`);
    }
    bits += val.toString(2).padStart(5, '0');
  }

  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, (i + 1) * 8), 2);
  }

  // Verify Modulo-37 checksum
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  const bigNum = BigInt(`0x${hex}`);
  const expectedChecksum = CROCKFORD_CHECKSUM_CHARS[Number(bigNum % 37n)];

  if (providedChecksum !== expectedChecksum) {
    throw new Error(
      'Recovery key checksum verification failed. The key was mistyped or corrupted.',
    );
  }

  return bytes;
}

/**
 * Formats a raw 53-character Crockford string into readable 4-character blocks.
 */
export function formatCrockfordKey(rawString: string): string {
  const clean = rawString.replace(/[\s-]/g, '');
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    chunks.push(clean.slice(i, i + 4));
  }
  return chunks.join('-');
}

/**
 * Generates a fresh 256-bit CSPRNG Recovery Key with checksum and fingerprint.
 */
export async function generateRecoveryKey(): Promise<RecoveryKeyResult> {
  const rawBytes = crypto.getRandomValues(new Uint8Array(32));
  const rawString = encodeCrockford(rawBytes);
  const formattedKey = formatCrockfordKey(rawString);

  // Compute a non-sensitive SHA-256 fingerprint for vault display
  const digest = await crypto.subtle.digest('SHA-256', rawBytes);
  const fingerprint = bytesToBase64Url(new Uint8Array(digest)).slice(0, 12);

  return {
    formattedKey,
    rawBytes,
    fingerprint,
  };
}

/**
 * Validates a formatted Crockford Recovery Key string.
 */
export function validateRecoveryKey(formattedKey: string): {
  isValid: boolean;
  rawBytes?: Uint8Array;
  error?: string;
} {
  try {
    const rawBytes = decodeCrockford(formattedKey);
    return { isValid: true, rawBytes };
  } catch (err) {
    return { isValid: false, error: (err as Error).message };
  }
}
