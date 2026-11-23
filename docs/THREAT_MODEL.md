# Memoir — STRIDE Threat Model & Security Analysis

## 1. Threat Actors & Adversary Profiles

| Actor Profile                               | Description & Capabilities                                                   | In-Scope Mitigations                                                                                                         |
| :------------------------------------------ | :--------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| **Opportunistic Database Exfiltrator**      | Obtains a full SQL backup or snapshot of PostgreSQL and Redis.               | Zero plaintext diary data. DEK wrapped with Argon2id-derived KEK; all records encrypted with AES-256-GCM.                    |
| **Rogue / Subpoenaed Infrastructure Admin** | Has root read access to application servers, object storage, and databases.  | Cannot decrypt diary content or file attachments without user Vault Passphrase or Recovery Key.                              |
| **Network Man-in-the-Middle (MITM)**        | Observes or attempts to tamper with transit traffic.                         | TLS 1.3, strict HSTS (`max-age=31536000; includeSubDomains; preload`), authenticated AEAD payloads with AAD.                 |
| **Cross-User / Malicious Tenant**           | Authenticated user attempting to access or tamper with other users' records. | Strict `req.user.id` scoping in every database query (IDOR prevention), record-bound AAD.                                    |
| **Compromised Client Device / Keylogger**   | Malware or physical access to user's hardware.                               | **OUT OF SCOPE.** Inherent limitation of endpoint execution. Documented honestly.                                            |
| **Malicious Server Serving Modified JS**    | Server code tampered to inject malicious script into Vite bundle.            | **OUT OF SCOPE for web-E2EE.** Mitigated via Subresource Integrity (SRI), CI verification, and future native desktop client. |

---

## 2. STRIDE Threat Analysis Matrix

| Threat Category             | Potential Attack Vector                                                   | Memoir Architectural Defense & Verification                                                                                                  |
| :-------------------------- | :------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spoofing Identity**       | Attacker attempts credential stuffing or session impersonation.           | Server Argon2id password hashing, tiered Redis rate limiting (5 req/min on auth), exponential lockout, TOTP 2FA, WebAuthn Passkeys.          |
| **Tampering with Data**     | Attacker with DB write access swaps ciphertexts between users or records. | **Associated Authenticated Data (AAD):** `memoir:v1                                                                                          | memory | user:{userId} | id:{memoryId}` cryptographically fails AEAD verification if moved. Nonce reuse guards reject stale nonces. |
| **Repudiation**             | User or attacker denies performing security-critical actions.             | Append-only `security_events` audit table logging timestamp, event type, and non-sensitive device summary.                                   |
| **Information Disclosure**  | Server logs or crash traces expose diary text or keys.                    | Client-side encryption before transmission. `nestjs-pino` redaction strips headers, cookies, passwords, tokens, and ciphertexts.             |
| **Denial of Service (DoS)** | Attacker floods upload endpoints or burns server CPU with argon2.         | Rate limiting per IP and user; strict body size limits (10 MB per file, 250 MB quota per account); client-side Argon2id for vault keys.      |
| **Elevation of Privilege**  | Attacker bypasses session checks or manipulates DTOs (mass assignment).   | Opaque server-side sessions; Zod strict DTO parsing (`forbidNonWhitelisted: true`); database queries isolated to verified session principal. |

---

## 3. Explicit Metadata Exposure Inventory

To maintain absolute transparency, Memoir documents all operational metadata that remains visible to the server:

1. **`entryDate` (Operational Calendar Bucket):** Documented coarse date required for chronological index synchronization and server-side range queries without decrypting content.
2. **Ciphertext Byte Lengths:** Padded to 256-byte boundaries to obscure fine-grained text lengths; coarse payload size ranges remain visible.
3. **Record Flags:** `isPinned`, `isTimeCapsule`, and `unlockAt` timestamps are visible to support UI filtering and server-side time-capsule gating (`423 Locked`).
4. **Session Metadata:** Masked IP subnet, User-Agent browser/OS summary, and last-seen timestamps are stored to power the user's Active Sessions dashboard.

---

## 4. Honest Web-E2EE Limitations Disclosure

1. **The Browser Code Delivery Dilemma:** Unlike native binaries with static signatures, web applications fetch application code on each reload. A compromised web server could deliver malicious JavaScript that captures passphrases before encryption.
2. **Browser Extension Risk:** Browser extensions with `<all_urls>` permission have direct DOM and memory read access.
3. **RAM Sanitization in Garbage-Collected Engines:** While Memoir employs `zeroize()` on typed arrays, JavaScript memory management does not provide kernel-level zero-wipe guarantees.
