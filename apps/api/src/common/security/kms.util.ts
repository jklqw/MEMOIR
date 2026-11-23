import crypto from 'node:crypto';

const KMS_AAD = Buffer.from('memoir:kms:v1', 'utf8');

/**
 * Derives a deterministic 256-bit symmetric key from SERVER_KMS_KEY via SHA-256.
 */
function deriveKmsKey(kmsKeyString: string): Buffer {
  return crypto.createHash('sha256').update(kmsKeyString).digest();
}

/**
 * Encrypts sensitive server-managed secrets (e.g. TOTP secrets) at rest using AES-256-GCM.
 * Formats output as: <nonce_b64url>.<tag_b64url>.<ciphertext_b64url>
 */
export function encryptWithKms(plaintext: string, kmsKeyString: string): string {
  const key = deriveKmsKey(kmsKeyString);
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(KMS_AAD);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${nonce.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

/**
 * Decrypts a KMS-encrypted secret with authenticity verification.
 * Fails closed if the ciphertext has been modified or tampered with.
 */
export function decryptWithKms(payload: string, kmsKeyString: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error('Invalid KMS ciphertext format');
  }

  const [nonceB64, tagB64, cipherB64] = parts;
  const key = deriveKmsKey(kmsKeyString);
  const nonce = Buffer.from(nonceB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const ciphertext = Buffer.from(cipherB64, 'base64url');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(KMS_AAD);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
