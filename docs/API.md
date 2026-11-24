# Memoir — REST API Specification & Integration Guide

> **Base URL:** `/api/v1`  
> **Protocol:** HTTPS (TLS 1.3 / hardened TLS 1.2)  
> **Format:** JSON (`application/json`) / Multipart (`multipart/form-data` for encrypted attachments)  
> **Authentication:** `HttpOnly`, `SameSite=Lax`, `Secure` Cookie Sessions (`memoir_session`)  
> **CSRF Protection:** Double-Submit Cookie / Signed Header (`X-CSRF-Token`) on state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`)

---

## 1. Zero-Knowledge API Invariant

Under **NO** circumstances does the Memoir REST API accept, process, index, search, or return plaintext memory contents, diary titles, user tags, moods, filenames, or raw unencrypted file bytes.

- All memory payloads are stored and exchanged as opaque AEAD ciphertext envelopes (`ciphertext`, `nonce`, `aad`, `tag`).
- All attachments are stored and served as opaque AES-256-GCM encrypted byte streams with stripped EXIF metadata and encrypted JSON metadata.
- Vault credentials (Vault Passphrase, Recovery Key, unwrapped Data Encryption Keys) never transit the network and are rejected by input validation schemas.

---

## 2. Global Request & Response Schema

### Standard Response Envelope

All non-streaming API responses adhere to the standard envelope format:

```json
// Successful Response (2xx)
{
  "success": true,
  "data": { ... }
}

// Error Response (4xx / 5xx)
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | RATE_LIMITED | LOCKED | CONFLICT | INTERNAL_SERVER_ERROR",
    "message": "Human-readable description of error (redacted of sensitive details)",
    "details": [ ... ]
  }
}
```

### Required Headers

| Header         | Description                                   | Required On                                               |
| :------------- | :-------------------------------------------- | :-------------------------------------------------------- |
| `Content-Type` | `application/json` (or `multipart/form-data`) | Requests with body                                        |
| `X-CSRF-Token` | Value from `memoir_csrf` cookie               | State-changing methods (`POST`, `PATCH`, `DELETE`, `PUT`) |

---

## 3. Authentication & Account Management

### `POST /api/v1/auth/register`

Creates a new Memoir user account. Hashes the account password server-side using Argon2id. Generates an email verification token.

- **Rate Limit:** 5 requests / 15 min per IP.
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "CorrectHorseBatteryStaple123!"
  }
  ```
- **Response (`201 Created`):**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "c1f7a0b2-...",
        "email": "user@example.com",
        "emailVerifiedAt": null
      }
    }
  }
  ```

### `POST /api/v1/auth/verify-email`

Verifies account email using single-use verification token.

- **Request Body:** `{ "token": "..." }`
- **Response (`200 OK`):** `{ "success": true, "data": { "verified": true } }`

### `POST /api/v1/auth/login`

Authenticates user with email and account password. If TOTP 2FA is active, returns a temporary challenge token (`requires2fa: true`). On success, issues a cryptographically random, opaque session cookie (`memoir_session`).

- **Rate Limit:** 5 failed attempts before exponential lockout (15 min -> 1 hr -> 24 hr).
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "CorrectHorseBatteryStaple123!",
    "twoFactorCode": "123456" // optional if 2FA enabled
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "c1f7a0b2-...",
        "email": "user@example.com",
        "twoFactorEnabled": false
      }
    }
  }
  ```

### `POST /api/v1/auth/logout`

Revokes current session in Redis and PostgreSQL and clears cookies.

- **Response (`200 OK`):** `{ "success": true, "data": { "loggedOut": true } }`

### `GET /api/v1/auth/me`

Returns current authenticated user profile, active sessions summary, and 2FA status.

- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "c1f7a0b2-...",
        "email": "user@example.com",
        "twoFactorEnabled": true,
        "emailVerified": true,
        "createdAt": "2026-11-23T04:00:00.000Z"
      }
    }
  }
  ```

### `POST /api/v1/auth/change-password`

Validates current password and updates to new Argon2id hash. Automatically revokes all existing active sessions except the current one.

- **Request Body:**
  ```json
  {
    "currentPassword": "OldPassword123!",
    "newPassword": "NewSecurePassword456!"
  }
  ```

### `POST /api/v1/auth/delete-account`

Irreversibly deletes the user account, all encrypted memories, attachments, vault envelopes, sessions, and audit entries. Requires explicit password verification.

- **Request Body:**
  ```json
  {
    "password": "CorrectHorseBatteryStaple123!",
    "confirmationPhrase": "DELETE MY ACCOUNT IRREVERSIBLY"
  }
  ```

---

## 4. Multi-Factor Authentication (MFA) & WebAuthn

### `POST /api/v1/auth/2fa/setup`

Initializes TOTP 2FA. Generates a base32 secret encrypted with Server KMS Key (`memoir:kms:v1`) in PostgreSQL, returns `otpauth://` URI and QR code SVG.

### `POST /api/v1/auth/2fa/verify`

Confirms TOTP setup by validating 6-digit TOTP code. Generates 10 single-use recovery backup codes (Argon2id hashed in DB).

### `POST /api/v1/auth/2fa/disable`

Disables TOTP 2FA upon password and TOTP code verification.

### Passkey Authentication (`/api/v1/auth/passkeys/*`)

- `POST /api/v1/auth/passkeys/register-options`: Generates WebAuthn registration challenge options.
- `POST /api/v1/auth/passkeys/register-verify`: Validates client authenticator attestation response.
- `POST /api/v1/auth/passkeys/login-options`: Generates WebAuthn login assertion options.
- `POST /api/v1/auth/passkeys/login-verify`: Validates authentication assertion response.

---

## 5. Active Session Management

### `GET /api/v1/sessions`

Lists all active sessions for current user (IP redacted, User-Agent parsed to OS/Browser, last active timestamp, `isCurrent` boolean).

### `DELETE /api/v1/sessions/:id`

Revokes a specific session remotely.

### `DELETE /api/v1/sessions`

Revokes all other sessions except the current caller.

---

## 6. Zero-Knowledge Vault Lifecycle

### `GET /api/v1/vault`

Returns wrapped DEK envelopes and KDF salt parameters. Returns `404` if vault has not been initialized.

- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "version": 1,
      "kdfSalt": "base64...",
      "kdfIterations": 3,
      "kdfMemory": 65536,
      "kdfParallelism": 1,
      "wrappedDek": "base64...",
      "wrappedDekNonce": "base64...",
      "wrappedDekTag": "base64...",
      "recoverySalt": "base64...",
      "recoveryWrappedDek": "base64...",
      "recoveryWrappedDekNonce": "base64...",
      "recoveryWrappedDekTag": "base64...",
      "recoveryKeyChecksum": "M",
      "updatedAt": "2026-11-23T16:00:00.000Z"
    }
  }
  ```

### `POST /api/v1/vault`

Initializes a new vault with wrapped DEK envelopes.

### `POST /api/v1/vault/rotate`

Atomically updates the `wrappedDek` envelope and KDF salt during passphrase rotation. The master DEK is never changed—preventing expensive re-encryption of diary archives.

### `POST /api/v1/vault/recover`

Atomically updates `wrappedDek` using the recovery-unwrapped DEK without needing the previous passphrase.

---

## 7. Encrypted Memories

### `GET /api/v1/memories`

Returns paginated list of encrypted memory envelopes.

- **Query Parameters:**
  - `page` (integer, default 1)
  - `limit` (integer, default 20, max 100)
  - `startDate` (ISO 8601 string, optional)
  - `endDate` (ISO 8601 string, optional)
  - `isEncrypted` (boolean, default true)
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "9b1deb4d-...",
          "version": 1,
          "ciphertext": "base64...",
          "nonce": "base64...",
          "tag": "base64...",
          "aad": "memoir:v1|memory|user:c1f7a0b2-...|id:9b1deb4d-...",
          "entryDate": "2026-11-23T00:00:00.000Z",
          "isEncrypted": true,
          "unlockAt": null,
          "createdAt": "2026-11-23T17:00:00.000Z",
          "updatedAt": "2026-11-23T17:00:00.000Z"
        }
      ],
      "meta": {
        "page": 1,
        "limit": 20,
        "total": 42,
        "totalPages": 3
      }
    }
  }
  ```

### `POST /api/v1/memories`

Creates a new encrypted memory envelope.

- **Request Body:**
  ```json
  {
    "version": 1,
    "ciphertext": "base64...",
    "nonce": "base64...",
    "tag": "base64...",
    "aad": "memoir:v1|memory|user:c1f7a0b2-...|id:9b1deb4d-...",
    "entryDate": "2026-11-23T00:00:00.000Z",
    "unlockAt": "2027-11-23T00:00:00.000Z" // Optional Time Capsule lock
  }
  ```

### `GET /api/v1/memories/:id`

Retrieves a specific memory envelope. If `unlockAt` is in the future, the server returns `423 Locked` withholding the ciphertext payload until the unlock timestamp arrives.

- **Locked Response (`423 Locked`):**
  ```json
  {
    "success": false,
    "error": {
      "code": "TIME_CAPSULE_LOCKED",
      "message": "This memory is a sealed Time Capsule and cannot be retrieved until 2027-11-23T00:00:00.000Z.",
      "details": {
        "unlockAt": "2027-11-23T00:00:00.000Z"
      }
    }
  }
  ```

### `PATCH /api/v1/memories/:id`

Updates an existing memory envelope. Rejects nonce reuse.

### `DELETE /api/v1/memories/:id`

Deletes memory and associated encrypted attachments.

---

## 8. Encrypted Attachments & Private Vault

### `POST /api/v1/attachments/upload`

Uploads a client-side encrypted attachment (`multipart/form-data`).

- **Form Fields:**
  - `file`: Opaque encrypted binary payload (`application/octet-stream`).
  - `metadataCiphertext`: Encrypted JSON metadata (original filename, MIME type, file size).
  - `metadataNonce`: 96-bit nonce for metadata.
  - `metadataTag`: 128-bit GCM tag for metadata.
  - `fileKeyWrapped`: Wrapped file key (encrypted with user DEK).
  - `fileKeyNonce`: Nonce for wrapped key.
  - `fileKeyTag`: Tag for wrapped key.
  - `fileNonce`: Nonce for raw encrypted file stream.
  - `fileTag`: Tag for raw encrypted file stream.
  - `memoryId`: Optional UUID of memory to bind attachment to.

### `GET /api/v1/attachments/:id/download`

Streams raw encrypted binary stream (`application/octet-stream`).

### `GET /api/v1/attachments/storage/usage`

Returns storage quota status:

```json
{
  "success": true,
  "data": {
    "totalBytesUsed": 10485760,
    "quotaBytes": 1073741824,
    "percentUsed": 0.97
  }
}
```

---

## 9. Backups & Portability

### `GET /api/v1/backups/export`

Generates a comprehensive encrypted archive envelope of all memories, attachments, and metadata bound under the user's master DEK.

### `POST /api/v1/backups/import`

Restores an encrypted backup archive into the user's vault, validating envelope checksums and schema integrity.

---

## 10. Audit Logging & Security Intelligence

### `GET /api/v1/audit/events`

Returns paginated, redacted security audit logs for the authenticated user (login attempts, password updates, 2FA changes, session revocations, IP prefix, user agent). Zero sensitive inputs (passwords, tokens, keys) are ever written to audit logs.
