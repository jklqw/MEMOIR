# Memoir — Privacy Architecture & Data Protection Policy

## 1. Privacy-by-Design Principles

Memoir treats personal thoughts and memories with sacred confidentiality. Our privacy commitments are enforced by mathematical architecture rather than legal disclaimers.

1. **Zero Third-Party Telemetry:** We do not include Google Analytics, Meta Pixel, PostHog, Mixpanel, Sentry remote reporting, or any third-party marketing/tracking scripts.
2. **Zero Remote Fonts or CDNs:** All typography and icons are self-hosted within the application package (`@fontsource`).
3. **Zero Plaintext Content Storage:** All diary titles, bodies, tags, moods, and file attachments are encrypted client-side using keys only the user controls.
4. **Data Minimization:** We collect only the bare minimum technical data necessary to maintain your session and synchronize encrypted envelopes.

---

## 2. Data Classification Matrix

| Classification Level          | Data Elements                                                                                                               | Storage Location                                           | Protection Mechanism                                                                               |
| :---------------------------- | :-------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------- | :------------------------------------------------------------------------------------------------- |
| **Public Operational**        | Application documentation, version manifest                                                                                 | Static bundle                                              | Publicly accessible.                                                                               |
| **Account Identity**          | Normalized email address, `emailVerifiedAt`, account status                                                                 | PostgreSQL `users` table                                   | Server-side protection, generic non-enumerating auth responses.                                    |
| **Security Credentials**      | Server Argon2id password hash, hashed session tokens, KMS-encrypted TOTP secrets, hashed backup codes, WebAuthn public keys | PostgreSQL `users`, `sessions`, `webauthn_credentials`     | One-way hashing (`Argon2id`, `SHA-256`), AES-256-GCM server envelope encryption.                   |
| **Private Encrypted Content** | Diary title, Markdown body, private tags, mood selection, attachment filenames, file MIME types, file bytes                 | PostgreSQL `memories`, `attachments`, private disk storage | **Client-side AES-256-GCM + AAD + 256-byte block padding.** Server possesses zero decryption keys. |
| **Operational Metadata**      | Coarse `entryDate`, padded ciphertext size, `isPinned`, `isTimeCapsule`, `unlockAt`, session timestamps, masked IP          | PostgreSQL `memories`, `sessions`, `security_events`       | Minimized; strictly necessary for sync, locking, and session auditing.                             |

---

## 3. Data Retention & Deletion Schedule

| Data Category                        | Active Retention                                  | Retention Post-Account-Deletion                                  |
| :----------------------------------- | :------------------------------------------------ | :--------------------------------------------------------------- |
| **Encrypted Memories & Attachments** | Duration of active account                        | **Permanently purged immediately** upon confirmed deletion.      |
| **Private Storage Blobs (`.enc`)**   | Duration of active account                        | **Unlinked and deleted from disk immediately**.                  |
| **Active Sessions & Tokens**         | Expire after 30 days of inactivity                | **Revoked and deleted immediately**.                             |
| **Security Audit Events**            | 90-day rolling window                             | **Permanently purged immediately** upon account deletion.        |
| **Encrypted Database Backups**       | 14-day rolling automated disaster recovery backup | Purged automatically as backup snapshots roll off (14 days max). |

---

## 4. Transparent Disclosure on "On This Day" & Email Notifications

- **"On This Day" Anniversary Reminders:** Computed **100% locally in browser memory** by comparing the current month and day against decrypted client records. The server never queries or calculates anniversary events.
- **Transactional Emails:** Restricted strictly to email verification and password reset links. Notification emails will **never** contain diary text, titles, or decrypted memory snippets.
