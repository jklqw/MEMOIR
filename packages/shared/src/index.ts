import { z } from 'zod';

/**
 * Protocol and cryptographic constants
 */
export const MEMOIR_PROTOCOL_VERSION = 1;
export const CRYPTO_ALGORITHM = 'AES-256-GCM';
export const KDF_ALGORITHM = 'ARGON2ID';
export const BLOCK_PADDING_BYTES = 256;

/**
 * Domain Enums
 */
export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_DELETION = 'PENDING_DELETION',
}

export enum SecurityEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOCKOUT_TRIGGERED = 'LOCKOUT_TRIGGERED',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  VAULT_CREATED = 'VAULT_CREATED',
  VAULT_PASSPHRASE_ROTATED = 'VAULT_PASSPHRASE_ROTATED',
  RECOVERY_KEY_USED = 'RECOVERY_KEY_USED',
  TOTP_ENABLED = 'TOTP_ENABLED',
  TOTP_DISABLED = 'TOTP_DISABLED',
  PASSKEY_ADDED = 'PASSKEY_ADDED',
  PASSKEY_REMOVED = 'PASSKEY_REMOVED',
  SESSION_REVOKED = 'SESSION_REVOKED',
  SUSPICIOUS_LOGIN = 'SUSPICIOUS_LOGIN',
  BACKUP_EXPORTED = 'BACKUP_EXPORTED',
  ACCOUNT_DELETION_REQUESTED = 'ACCOUNT_DELETION_REQUESTED',
}

export enum ApiErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  LOCKED = 'LOCKED',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  VAULT_LOCKED = 'VAULT_LOCKED',
  VAULT_NOT_FOUND = 'VAULT_NOT_FOUND',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  EMAIL_UNVERIFIED = 'EMAIL_UNVERIFIED',
  MFA_REQUIRED = 'MFA_REQUIRED',
  MFA_INVALID = 'MFA_INVALID',
  SESSION_REVOKED = 'SESSION_REVOKED',
  NONCE_REUSED = 'NONCE_REUSED',
  ENVELOPE_INVALID = 'ENVELOPE_INVALID',
  CSRF_INVALID = 'CSRF_INVALID',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
}

/**
 * Standard API Response Shape
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: ApiErrorCode | string;
    message: string;
    details?: unknown;
  };
}

/**
 * Authentication DTO Schemas
 */
export const RegisterSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(255),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(128, 'Password must not exceed 128 characters'),
});
export type RegisterDto = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  totpCode: z.string().trim().length(6, 'TOTP code must be 6 digits').optional(),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const VerifyEmailSchema = z.object({
  token: z.string().trim().min(16, 'Token is required'),
});
export type VerifyEmailDto = z.infer<typeof VerifyEmailSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(10, 'New password must be at least 10 characters')
    .max(128, 'New password must not exceed 128 characters'),
});
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;

/**
 * Vault DTO Schemas
 */
export const CreateVaultSchema = z.object({
  kdfAlgorithm: z.literal(KDF_ALGORITHM),
  kdfSalt: z.string().min(16, 'Salt must be at least 16 characters Base64'),
  kdfMemory: z.number().int().min(1024),
  kdfIterations: z.number().int().min(1),
  kdfParallelism: z.number().int().min(1),
  wrapAlgorithm: z.literal(CRYPTO_ALGORITHM),
  envelopeVersion: z.number().int().min(1),
  wrappedDek: z.string().min(1, 'Wrapped DEK is required'),
  wrappedDekNonce: z.string().min(1, 'Wrapped DEK nonce is required'),
  recoverySalt: z.string().min(16, 'Recovery salt must be at least 16 characters Base64'),
  recoveryWrappedDek: z.string().min(1, 'Recovery wrapped DEK is required'),
  recoveryNonce: z.string().min(1, 'Recovery nonce is required'),
  recoveryKeyFingerprint: z.string().min(1, 'Recovery key fingerprint is required'),
});
export type CreateVaultDto = z.infer<typeof CreateVaultSchema>;

export const RotatePassphraseSchema = z.object({
  kdfSalt: z.string().min(16, 'Salt must be at least 16 characters'),
  kdfMemory: z.number().int().min(1024).optional(),
  kdfIterations: z.number().int().min(1).optional(),
  kdfParallelism: z.number().int().min(1).optional(),
  wrappedDek: z.string().min(1, 'Wrapped DEK is required'),
  wrappedDekNonce: z.string().min(1, 'Wrapped DEK nonce is required'),
});
export type RotatePassphraseDto = z.infer<typeof RotatePassphraseSchema>;

export const RecoverVaultSchema = z.object({
  kdfSalt: z.string().min(16, 'Salt must be at least 16 characters'),
  kdfMemory: z.number().int().min(1024).optional(),
  kdfIterations: z.number().int().min(1).optional(),
  kdfParallelism: z.number().int().min(1).optional(),
  wrappedDek: z.string().min(1, 'Wrapped DEK is required'),
  wrappedDekNonce: z.string().min(1, 'Wrapped DEK nonce is required'),
  recoverySalt: z.string().min(16).optional(),
  recoveryWrappedDek: z.string().min(1).optional(),
  recoveryNonce: z.string().min(1).optional(),
  recoveryKeyFingerprint: z.string().min(1).optional(),
});
export type RecoverVaultDto = z.infer<typeof RecoverVaultSchema>;

/**
 * Memory DTO Schemas
 */
export const CreateMemorySchema = z.object({
  id: z.string().uuid().optional(),
  entryDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  isPinned: z.boolean().default(false),
  isTimeCapsule: z.boolean().default(false),
  unlockAt: z.string().datetime({ offset: true }).nullable().optional(),
  envelopeVersion: z.number().int().default(MEMOIR_PROTOCOL_VERSION),
  algorithm: z.string().default(CRYPTO_ALGORITHM),
  ciphertext: z.string().min(1, 'Ciphertext is required'),
  nonce: z.string().min(1, 'Nonce is required'),
});
export type CreateMemoryDto = z.infer<typeof CreateMemorySchema>;

export const MemoryPayloadSchema = z.object({
  title: z.string().default(''),
  bodyMarkdown: z.string().default(''),
  mood: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  customMeta: z.record(z.unknown()).optional(),
  schemaVersion: z.number().int().default(1),
});
export type MemoryPayload = z.infer<typeof MemoryPayloadSchema>;

export const UpdateMemorySchema = z.object({
  entryDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
    .optional(),
  isPinned: z.boolean().optional(),
  isTimeCapsule: z.boolean().optional(),
  unlockAt: z.string().datetime({ offset: true }).nullable().optional(),
  envelopeVersion: z.number().int().optional(),
  algorithm: z.string().optional(),
  ciphertext: z.string().min(1, 'Ciphertext is required').optional(),
  nonce: z.string().min(1, 'Fresh nonce is required'),
  isArchived: z.boolean().optional(),
});
export type UpdateMemoryDto = z.infer<typeof UpdateMemorySchema>;

/**
 * User Vault View Response
 */
export interface UserVaultResponse {
  id: string;
  userId: string;
  kdfAlgorithm: string;
  kdfSalt: string;
  kdfMemory: number;
  kdfIterations: number;
  kdfParallelism: number;
  wrapAlgorithm: string;
  envelopeVersion: number;
  wrappedDek: string;
  wrappedDekNonce: string;
  recoverySalt: string;
  recoveryWrappedDek: string;
  recoveryNonce: string;
  recoveryKeyFingerprint: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Memory Item View Response
 */
export interface MemoryItemResponse {
  id: string;
  userId: string;
  entryDate: string;
  isPinned: boolean;
  isTimeCapsule: boolean;
  unlockAt: string | null;
  envelopeVersion: number;
  algorithm: string;
  ciphertext?: string; // Omitted by server if Time Capsule is locked
  nonce?: string;
  isLockedTimeCapsule?: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DecryptedMemory {
  id: string;
  userId: string;
  entryDate: string;
  isPinned: boolean;
  isTimeCapsule: boolean;
  unlockAt: string | null;
  envelopeVersion: number;
  algorithm: string;
  isLockedTimeCapsule?: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Decrypted contents:
  title: string;
  bodyMarkdown: string;
  mood?: string | null;
  tags: string[];
  customMeta?: Record<string, unknown>;
  schemaVersion: number;
}

/**
 * Active Session View Response
 */
export interface SessionResponse {
  id: string;
  deviceLabel: string;
  userAgentSummary: string;
  ipMasked: string;
  lastSeenAt: string;
  isCurrent: boolean;
  createdAt: string;
}
