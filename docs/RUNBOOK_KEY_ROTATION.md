# Operational Runbook: Secret & Cryptographic Key Rotation

> **Components:** Server KMS Key, Vault Passphrases, Crockford Base32 Recovery Keys, Session Secrets, Database Credentials  
> **Classification:** Security Operations Runbook  
> **Frequency:** Annual / Incident-Triggered

---

## 1. Key Hierarchy & Rotation Mechanics

Memoir adheres to strict Three-Secret Separation. The blast radius and rotation procedure differ based on the key type:

| Key Type             | Storage Location            | Blast Radius on Rotation             | Requires Re-Encrypting Memories?     |
| :------------------- | :-------------------------- | :----------------------------------- | :----------------------------------- |
| **Account Password** | Argon2id Hash in PostgreSQL | Invalidates active user sessions     | ❌ No                                |
| **Vault Passphrase** | Client-Only (never stored)  | Re-wraps Master DEK only             | ❌ No                                |
| **Recovery Key**     | Client-Only (never stored)  | Re-wraps Master DEK only             | ❌ No                                |
| **Master DEK**       | Wrapped in DB (`UserVault`) | All memories & attachments           | ⚠️ Requires full vault re-encryption |
| **Server KMS Key**   | `.env.prod`                 | Encrypted TOTP 2FA seeds             | ❌ No (DB re-encrypt script)         |
| **Session Secret**   | `.env.prod`                 | Invalidates all logged-in cookies    | ❌ No                                |
| **CSRF Secret**      | `.env.prod`                 | Requires page refresh for new tokens | ❌ No                                |

---

## 2. Vault Passphrase Rotation (Client-Side, Zero Re-Encryption)

When a user requests a passphrase change:

1. User enters **Current Vault Passphrase** in browser.
2. WebCrypto un-wraps the Master Data Encryption Key (DEK) into RAM.
3. User enters **New Vault Passphrase**.
4. Client derives new `PassphraseKEK` using Argon2id (`m=64MiB`, `t=3`, `p=1`) + HKDF-SHA256 (`memoir:v1|kdf|passphrase-kek`).
5. Client wraps the Master DEK using `AES-256-GCM` with a fresh 96-bit nonce and AAD `memoir:v1|dek-wrap|user:{userId}`.
6. Client posts new wrapped envelope to `POST /api/v1/vault/rotate`.
7. Server atomically updates the `UserVault` record.
8. **Result:** Diary entries, photos, attachments, and backups remain intact under the original DEK without expensive or risky bulk re-encryption.

---

## 3. Recovery Key Rotation

If a user suspects their 53-character Recovery Key was exposed:

1. User enters their Vault Passphrase in `/settings` -> "Rotate Recovery Key".
2. WebCrypto unwraps the Master DEK.
3. Client generates 32 fresh bytes of CSPRNG entropy.
4. Generates a new 53-character Crockford Base32 key with Modulo-37 checksum.
5. Derives new `RecoveryKEK` via HKDF-SHA256 (`memoir:v1|kdf|recovery-kek`).
6. Re-wraps Master DEK under `RecoveryKEK` with AAD `memoir:v1|recovery-wrap|user:{userId}`.
7. Submits new envelope to API.
8. User is instructed to print or write down the new Recovery Key and securely shred the old one.

---

## 4. Server KMS Key Rotation (`SERVER_KMS_KEY`)

The `SERVER_KMS_KEY` is a 256-bit AES key used by the backend to encrypt sensitive credentials at rest, specifically TOTP 2FA base32 seeds in the `users.twoFactorSecret` database column.

### Rotation Procedure:

1. Generate new 32-byte key:
   ```bash
   NEW_KEY=$(openssl rand -hex 32)
   echo "New KMS Key: ${NEW_KEY}"
   ```
2. Run database re-encryption script:
   ```bash
   docker compose -f docker-compose.prod.yml run --rm \
     -e OLD_SERVER_KMS_KEY="${CURRENT_KMS_KEY}" \
     -e NEW_SERVER_KMS_KEY="${NEW_KEY}" \
     api pnpm --filter @memoir/api exec node -e '
       const { PrismaClient } = require("@prisma/client");
       const { decryptSecret, encryptSecret } = require("./dist/common/security/kms.util");
       const prisma = new PrismaClient();
       async function rotate() {
         const users = await prisma.user.findMany({ where: { twoFactorEnabled: true } });
         for (const user of users) {
           if (user.twoFactorSecret) {
             const plaintext = decryptSecret(user.twoFactorSecret, process.env.OLD_SERVER_KMS_KEY);
             const reencrypted = encryptSecret(plaintext, process.env.NEW_SERVER_KMS_KEY);
             await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: reencrypted } });
           }
         }
         console.log(`Successfully rotated KMS secrets for ${users.length} users.`);
       }
       rotate().finally(() => prisma.$disconnect());
     '
   ```
3. Update `SERVER_KMS_KEY` in `.env.prod`.
4. Perform rolling restart of the API containers:
   ```bash
   docker compose -f docker-compose.prod.yml restart api
   ```

---

## 5. Session & Cookie Secret Rotation

In the event of suspected session compromise or routine maintenance:

1. Generate new 32-byte secret:
   ```bash
   NEW_SESSION_SECRET=$(openssl rand -base64 32)
   ```
2. Update `SESSION_SECRET` in `.env.prod`.
3. Restart API service.
4. **Impact:** All active user sessions are immediately invalidated, forcing re-authentication across all clients.
