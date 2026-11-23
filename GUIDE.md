# MEMOIR — Unified Engineering & Security Master Plan

> **Document Purpose:** This is the single, authoritative implementation playbook for the autonomous coding agent. Treat this document as a disciplined engineering specification, not a loose feature wishlist. Work incrementally, verify every milestone against real command output, and create clean, atomic Git commits at each checkpoint.
>
> **Product:** Memoir — *Privacy-First, End-to-End Encrypted Personal Diary Platform*  
> **Tagline:** *Your memories. Your keys. Your privacy.*  
> **Target Standard:** Production-minded, security-engineered, portfolio-grade full-stack repository uniting **Full-Stack Web Engineering**, **Applied Cryptography & Application Security**, and **Privacy Engineering**.

---

## 1. Agent Operating Rules & Execution Discipline

You are acting as the lead full-stack engineer, application security engineer, test engineer, and technical writer for this repository.

### 1.1 Non-Negotiable Working Rules
1. **Inspect before changing:** Always inspect the working directory, Git status, operating system, installed runtimes, and existing files before creating or modifying anything. Never overwrite or delete existing user work without understanding it and receiving explicit approval.
2. **Plan before coding:** Establish the repository layout, workspace standards, architecture boundaries, and threat model before implementing product features.
3. **Cryptography before diary persistence:** Never implement plaintext diary CRUD first and "add encryption later." Design, implement, and test the client-side cryptography engine and vault lifecycle before storing any user memories.
4. **One coherent milestone, one atomic commit:** Follow the Conventional Commits roadmap in Section 10. Never combine unrelated features or multiple distinct security controls into a single commit.
5. **No placeholder stubs or unverified claims:** Every cryptographic primitive, security control, and test must be genuinely implemented and executed. Never claim a check passed unless you actually ran it and inspected its output.
6. **Never fake security:** Do not label the application "zero-knowledge," "E2EE," or "production-ready" until the threat model, implementation, and tests substantiate the claim. Always document residual risks and limitations honestly.
7. **Use audited, maintained libraries only:** Never invent custom cryptographic algorithms, roll custom authentication protocols, or rely on deprecated APIs. Check current official library documentation and security advisories before selecting exact package versions.
8. **Do not silently weaken requirements:** If a dependency, browser API, or deployment environment prevents a stated security property, stop, explain the limitation clearly, and propose a safe alternative.
9. **Intentional, human visual craft:** Follow the editorial design system in Section 8 strictly. Avoid generic AI-generated SaaS dashboards, neon gradients, random glassmorphism, emoji UI clutter, and purposeless decorative charts.
10. **Zero secret leakage:** Never print credentials, passphrases, derived keys, session tokens, cookies, recovery keys, TOTP secrets, or decrypted diary content in logs, test output, error responses, frontend source maps, or screenshots.
11. **Clean Git hygiene:** Never commit `.env` files, generated build outputs, `node_modules/`, local databases, uploaded development files, private keys, certificates, or caches.
12. **Single consolidated report:** Maintain **exactly one** cumulative English engineering and security report at the repository root: `PROJECT_AND_SECURITY_REPORT.md`. Update it in the same commit as the phase or security control it documents.
13. **Ask before destructive or legal operations:** Database resets, force pushes, deleting branches, removing existing files, overwriting user data, or choosing an open-source `LICENSE` require explicit owner approval.

### 1.2 Mandatory 10-Step Milestone Workflow
Execute the following loop for every single milestone/commit:
1. Read the relevant sections of this master plan.
2. State the intended change and the exact files likely to be created or modified.
3. Implement strictly the scope of that milestone.
4. Add or update unit, integration, E2E, and/or security regression tests.
5. Run formatting, linting, strict typechecking, tests, and build checks; inspect actual output.
6. Review `git status` and `git diff` for accidental files, debug `console.log` statements, hardcoded secrets, or unrelated changes.
7. Update relevant documentation (`docs/*`, `README.md`, `CHANGELOG.md`) and append verified evidence to `PROJECT_AND_SECURITY_REPORT.md`.
8. Report a concise summary of changes, exact commands run, test results, and any known limitations.
9. Create the specified Conventional Commit.
10. Confirm `git status` is completely clean before beginning the next milestone.

If a check fails, fix it before committing. If it cannot reasonably be fixed, stop immediately and report the exact failure; never hide or bypass failing checks.

---

## 2. Product Vision, User Journeys & Scope

### 2.1 Core Product Vision & The Zero-Knowledge Invariant
Memoir is a quiet, trustworthy personal archive—not a social network. Each user maintains an encrypted online diary where privacy is enforced architecturally, not merely promised in a policy.

**The Zero-Knowledge Invariant (Absolute Rule):**  
*Even if the PostgreSQL database, private object/file storage, Redis cache, and server logs are completely exfiltrated by an attacker, the attacker must not be able to read any user's memory titles, bodies, private tags, moods, attachment filenames, or uploaded files.*

The application server stores opaque ciphertext envelopes and only the minimum operational metadata required to authenticate sessions, enforce ownership, and synchronize records.

### 2.2 Primary User Journeys

#### A. Account & Identity Journey
- Register with a normalized email address and an **Account Authentication Password**.
- Verify the email address via an expiring, single-use, server-hashed verification token before sensitive account operations are permitted.
- Sign in and sign out using opaque server-managed cookie sessions.
- Enable optional Two-Factor Authentication (**TOTP 2FA**) with single-use backup codes.
- Register and manage optional **WebAuthn Passkeys** for phishing-resistant session sign-in.
- View active sessions (with minimal safe device metadata) and revoke individual devices or all other devices immediately.
- Change or reset the Account Authentication Password (requiring recent re-authentication where appropriate) without affecting vault encryption keys.
- Delete the account through a deliberate multi-step confirmation flow with accurate retention and backup-deletion disclosures.

#### B. Vault Setup, Unlock & Recovery Journey
- On first use after registration, the browser generates a cryptographically random 256-bit **Vault Master Key / Data Encryption Key (DEK)**.
- The user creates a **separate Vault Passphrase**—never reusing the account authentication password by default.
- The browser derives a Key Encryption Key (**KEK**) locally from the Vault Passphrase using **Argon2id** + **HKDF-SHA256** with a unique random salt and versioned parameters.
- The browser wraps the random DEK using `AES-256-GCM` with Associated Authenticated Data (AAD).
- Simultaneously, the browser generates a high-entropy 256-bit **Recovery Key** (encoded in human-readable Crockford Base32 groups with checksum), derives a `RecoveryKEK`, and independently wraps the same DEK.
- The UI displays the Recovery Key once inside a printable/downloadable Recovery Kit modal, requires explicit user confirmation that it has been saved, and warns clearly that the service cannot recover lost keys.
- Only wrapped keys, salt, KDF parameters, nonces, and envelope version metadata are sent to the server.
- To unlock the vault, the browser derives `KEK` locally and unwraps `DEK` into volatile RAM. Locking, logging out, session expiry, or inactivity timeout clears in-memory references immediately.

#### C. Daily Journaling Journey
- Compose memories with title, Markdown body, entry date, optional mood (6 calm states), and optional private tags.
- Encrypt all private fields in the browser before network transmission.
- Open and decrypt memories locally only after the vault is unlocked.
- Edit, pin/unpin, archive, restore, and permanently delete memories.
- Support multiple memories on the same calendar date.
- Provide debounced autosave with an explicit state machine (`Idle`, `Saving`, `Saved`, `Offline`, `Failed` with manual retry) that never silently discards unsaved edits.

#### D. Organization & Local Search Journey
- Browse memories in a chronological **Timeline** and a monthly **Calendar View**.
- Filter by date, pinned status, mood, and private tags locally.
- Execute full-text search across titles, bodies, and tags **100% locally in browser memory** while the vault is unlocked—never sending search terms or decrypted text to the server.

#### E. Encrypted Attachments & Private Vault Journey
- Strip EXIF, GPS, and camera metadata from images client-side before encryption.
- Generate a fresh random 256-bit `FileKey` for every uploaded file, encrypt both file bytes and file metadata (original filename, MIME type) using `AES-256-GCM`, and wrap `FileKey` under the user's `DEK`.
- Store only opaque ciphertext blobs under server-generated UUIDv4 storage keys in private storage—never create public attachment URLs.
- Support both diary-linked attachments and a standalone **Private Vault** section for encrypted personal documents, IDs, and private photos.
- Decrypt and preview attachments in the browser only after authorization and vault unlock, revoking object URLs on unmount.

#### F. Data Portability & Continuity Journey
- Export a portable encrypted backup archive (`.memoir-backup.json`) containing ciphertext envelopes, KDF parameters, wrapped DEK, and a SHA-256 integrity manifest, logging `BACKUP_EXPORTED` in the audit trail.
- Verify and restore an encrypted backup locally using the Vault Passphrase or Recovery Key with ID-based deduplication.
- Allow local plaintext/Markdown export **only** after an explicit user action, local decryption, and a clear security warning.
- Support **Offline-First Mode** via IndexedDB storing **only encrypted ciphertexts** and an encrypted sync queue that flushes safely upon reconnection.

#### G. Differentiating Post-Core Features
- **Client-Side Mood Tracking & Personal Insights:** Compute mood distributions, trends, writing streaks, active-day heatmaps, and top tags strictly in the browser. Explicitly disclaim that mood visualizations are personal reflections, not medical or diagnostic tools.
- **Scheduled Time Capsules:** Allow sealing a memory or Future Letter with a future `unlockAt` timestamp enforced by the API (`423 Locked` until unlock time). Explicitly document that server-clock enforcement is a product feature rather than a cryptographic time-lock that a compromised server cannot bypass.
- **Private Anniversary Reminders ("On This Day"):** Compute memories from the same month/day in previous years client-side. Any optional external notification must remain completely generic and never leak private memory text.

### 2.3 Explicit Non-Goals
Do **not** implement social feeds, public user profiles, public memory sharing links, public comments, third-party analytics/telemetry, advertising, or server-side full-text/searchable encryption in this product.

---

## 3. Technology Stack, Tooling & Infrastructure Philosophy

Build a clean TypeScript-first `pnpm` monorepo structured as a **modular monolith**. Avoid premature infrastructure sprawl (no Kubernetes, no microservices, no message brokers, no Elasticsearch/OpenSearch, no third-party telemetry SDKs).

### 3.1 Authoritative Stack Matrix

| Area | Technology | Engineering Rationale |
| :--- | :--- | :--- |
| **Language** | TypeScript 5.7+ (`strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`) | Shared type safety and strict boundary contracts across frontend, backend, crypto, and shared schemas. |
| **Monorepo & Package Manager** | `pnpm` Workspaces on Node.js LTS (e.g., Node 22 LTS) | Deterministic lockfile, strict dependency isolation, and zero duplicated workspace code. |
| **Frontend Framework** | React 19 + Vite + React Router | Fast builds, explicit client-side routes, minimal runtime overhead. |
| **Styling & Accessibility** | Tailwind CSS v4 + CSS Custom Properties + Radix UI primitives (selectively) | Custom editorial design tokens combined with WCAG 2.2 AA accessible dialogs, popovers, and focus management. |
| **Forms & Schema Validation** | React Hook Form + Zod | Predictable form state, accessible errors, and shared runtime validation. |
| **Client State & Offline** | TanStack Query + Zustand (RAM-only volatile key store) + `idb` (IndexedDB) | Separates server caching, volatile in-memory `CryptoKey` state, and encrypted-only offline persistence. |
| **Markdown & Visualizations** | `react-markdown` + `rehype-sanitize`, Recharts (custom muted styling) | Strict XSS rendering boundary and 100% client-side personal analytics. |
| **Client Cryptography** | Native Web Crypto API (`AES-256-GCM`, `HKDF-SHA256`, `CSPRNG`) + `hash-wasm` (`Argon2id`) | Hardware-accelerated browser AEAD plus audited WASM memory-hard key derivation. |
| **Backend Framework** | NestJS + TypeScript + OpenAPI (`@nestjs/swagger`) | Clean modular DI architecture ideal for guards, validation pipes, throttlers, and documented REST APIs. |
| **Database & ORM** | PostgreSQL 16 + Prisma ORM | Relational integrity, declarative versioned migrations, parameterized SQLi-safe queries. |
| **Cache & Security Store** | Redis 7 (introduced cleanly for distributed rate limiting, lockouts, WebAuthn challenges, and session denylists) | Atomic rate-limit counters, short-TTL challenge storage, and immediate session revocation. |
| **Auth & Security Libraries** | `argon2`, `otplib`, `qrcode`, `@simplewebauthn/server` & `@simplewebauthn/browser`, `helmet`, `ua-parser-js` | Maintained, audited security libraries; zero custom auth primitives. |
| **Structured Logging** | `nestjs-pino` (Pino) with strict default redaction | High-performance JSON operational logs with guaranteed secret/PII redaction. |
| **Testing Pyramid** | Vitest, React Testing Library, Jest + Supertest (or Nest testing), Playwright (E2E) | Covers cryptographic invariants, API integration, security regressions, and real browser flows. |
| **Containers & Proxy** | Docker + Docker Compose v2, Mailpit (dev SMTP), Nginx or Caddy (TLS 1.3 + headers) | Reproducible dev environment, non-root production containers, and hardened edge termination. |
| **CI/CD & DevSecOps** | GitHub Actions + Dependabot + `pnpm audit` + secret scanning | Automated formatting, linting, typechecking, full tests, build verification, and vulnerability gates. |

### 3.2 Runtime Prerequisites & Requirements Documentation
Verify and install using official OS instructions only (never pipe untrusted internet scripts into a shell):
- `git`, Node.js current LTS, `pnpm` (via `corepack enable`), Docker Engine/Desktop + Docker Compose v2, and a Web Crypto-capable browser.
- Record **actual detected versions** in `docs/DEVELOPMENT_SETUP.md` and `docs/REQUIREMENTS.md`.
- Because this is a TypeScript/Node.js project, `package.json` and `pnpm-lock.yaml` are the authoritative dependency manifests, complemented by `docs/REQUIREMENTS.md`. Do **not** create a misleading Python `requirements.txt`.

---

## 4. Architecture, Repository Layout & Data Classification

### 4.1 Repository Structure
Keep the layout clean and intentional—do not create empty placeholder directories or unused abstractions:

```text
memoir/
├── .github/
│   ├── workflows/
│   │   └── ci.yml                       # Format, lint, typecheck, tests, build, audit, secret scan
│   └── dependabot.yml                   # Automated dependency update PRs
├── apps/
│   ├── api/                             # NestJS modular monolith API
│   │   ├── prisma/                      # schema.prisma & SQL migrations
│   │   ├── src/
│   │   └── test/                        # Integration & automated security regression tests
│   └── web/                             # React + Vite editorial web client
│       ├── public/
│       └── src/
├── packages/
│   ├── crypto/                          # Zero-knowledge client crypto engine & vector tests
│   └── shared/                          # Safe shared DTOs, Zod schemas, enums, error codes
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   ├── REQUIREMENTS.md
│   ├── DEVELOPMENT_SETUP.md
│   ├── ARCHITECTURE.md
│   ├── CRYPTOGRAPHY.md
│   ├── THREAT_MODEL.md
│   ├── PRIVACY.md
│   ├── API.md
│   ├── TESTING.md
│   └── DEPLOYMENT.md
├── infra/
│   ├── docker/                          # Hardened multi-stage non-root Dockerfiles
│   └── proxy/                           # Nginx/Caddy TLS 1.3 & strict security header configs
├── scripts/                             # Operational helper scripts (added only when needed)
├── .editorconfig
├── .env.example
├── .gitignore
├── .npmrc
├── .prettierrc.json
├── eslint.config.mjs
├── tsconfig.base.json
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── docker-compose.yml                   # Local dev: PostgreSQL + Mailpit + Redis
├── docker-compose.prod.yml              # Production stack with reverse proxy & isolated networks
├── README.md                            # Honest, portfolio-grade repository showcase
├── CONTRIBUTING.md
├── SECURITY.md
├── CHANGELOG.md
├── PROJECT_AND_SECURITY_REPORT.md       # SINGLE unified English engineering & security report
└── LICENSE                              # Added ONLY after explicit owner license confirmation
```

### 4.2 High-Level Request & Trust Boundary Flow

```text
[User Browser — Trusted Client Boundary]
  │  1. Authenticates session via HTTPS cookie (Account Password / 2FA / Passkey)
  │  2. Unlocks local vault with separate Vault Passphrase (never sent to server)
  │  3. Derives PassphraseKEK via Argon2id + HKDF -> Unwraps random 256-bit DEK in RAM
  │  4. Pads & encrypts memory JSON / strips EXIF & encrypts files with AES-256-GCM + AAD
  │
  ▼ HTTPS (TLS 1.3) — Ciphertext Envelopes + Minimal Operational Metadata Only
[Reverse Proxy (Nginx / Caddy) — TLS Termination, Strict CSP, HSTS, Headers]
  │
  ▼ Internal Network
[NestJS API — Untrusted w.r.t. Plaintext]
  │  - Validates cookie session, CSRF token, rate limits, allowlisted DTOs, & user ownership
  │  - Treats ciphertext envelopes as strictly opaque; rejects malformed/reused nonces
  │  - Redacts all secrets/tokens/ciphertexts from Pino structured logs
  │
  ├──► [PostgreSQL 16]           Stores accounts, wrapped keys, ciphertext envelopes, audit events
  ├──► [Redis 7]                 Stores rate limits, lockouts, WebAuthn challenges, revocation list
  └──► [Private Object Storage]  Stores opaque UUIDv4 .enc encrypted attachment blobs (zero public URLs)
```

### 4.3 Data Classification & Honest Metadata Exposure

| Data Category | Examples | Storage & Protection Policy |
| :--- | :--- | :--- |
| **Public Operational** | App version, public docs | Plaintext, non-sensitive. |
| **Account Identity** | Normalized email, `emailVerifiedAt`, `accountStatus`, `createdAt` | Protected in PostgreSQL; excluded from public APIs; generic auth responses prevent enumeration. |
| **Security Credentials** | Argon2id password hash, hashed session tokens, KMS-encrypted TOTP secret, hashed backup codes, WebAuthn public keys, safe `security_events` | Hashed or server-encrypted at rest; redacted from all logs and error responses. |
| **Encrypted Private Content** | Memory title, Markdown body, private tags, mood, custom notes, original attachment filename, MIME type, file bytes | **Strictly client-side encrypted** (`AES-256-GCM` + AAD + block padding) before leaving the browser. Zero plaintext in API, DB, cache, or logs. |
| **Operational Metadata (Potentially Sensitive)** | Entry counts, coarse `entryDate`, `isPinned`, `isTimeCapsule`, `unlockAt`, padded ciphertext byte sizes, `createdAt`/`updatedAt`, session timestamps | Minimized wherever possible; **explicitly documented** in `docs/PRIVACY.md` and `docs/THREAT_MODEL.md`. Never claim all metadata is invisible to the server. |

---

## 5. Zero-Knowledge Cryptography & Key Management Specification

Implement the complete cryptographic engine in `packages/crypto` before building memory persistence. All primitives must be versioned, strongly typed, and fail closed—never falling back to plaintext on error.

### 5.1 Strict Three-Secret Separation
Never conflate account authentication with vault decryption:
1. **Account Authentication Password:** Verified server-side with `Argon2id` and a unique random salt. Used solely to establish authenticated API sessions. **Never** used to encrypt vault data. Resetting the account password or authenticating via WebAuthn Passkeys **must never** reset, replace, or decrypt vault keys.
2. **Separate Vault Passphrase:** Created independently during vault onboarding and processed **exclusively inside the browser**. Never transmitted over the network.
3. **256-Bit Recovery Key:** Generated via `crypto.getRandomValues` (32 random bytes), encoded as 8 groups of Crockford Base32 characters with an embedded checksum (e.g., `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`). Independently wraps the DEK and is never stored in plaintext on the server.

### 5.2 Key Hierarchy & Derivation Pipeline

```text
  [Separate Vault Passphrase]                     [256-bit Random Recovery Key]
               │                                                 │
               ▼                                                 ▼
  Argon2id(passphrase, kdfSalt, v1 params)        HKDF-SHA256(recoveryKeyBytes,
    m = 65536 KiB (64 MiB), t = 3, p = 1,          salt = recoverySalt,
    hashLength = 32 bytes                          info = "memoir:recovery-kek:v1")
               │                                                 │
               ▼                                                 ▼
  HKDF-SHA256(masterSeed,                           [RecoveryKEK (256-bit)]
    info = "memoir:kek:v1")                                      │
               │                                                 │
               ▼                                                 │
     [PassphraseKEK (256-bit)]                                   │
               │                                                 │
               ▼ AES-256-GCM Unwrap + AAD                        ▼ AES-256-GCM Unwrap + AAD
       ┌────────────────────────────────────────────────────────────────────┐
       │   Random 256-bit Vault Master Key / DEK                            │
       │   (Volatile RAM-only while unlocked; zeroized/cleared on lock,     │
       │    logout, session expiry, idle timeout, or tab close)             │
       └────────────────────────────────────────────────────────────────────┘
               │
               ├──► AES-256-GCM + AAD ──► Padded Memory Ciphertext Envelopes
               ├──► AES-256-GCM + AAD ──► Wrap Per-File Random 256-bit FileKeys
               └──► AES-256-GCM + AAD ──► Encrypted Private Metadata & Backups
```

- **Parameter Versioning:** Store `kdfAlgorithm`, `kdfSalt`, `kdfMemory`, `kdfIterations`, `kdfParallelism`, `wrapAlgorithm`, and `envelopeVersion` in `user_vaults` so parameters can be upgraded safely in future versions without breaking existing vaults.
- **Zero-Reencryption Passphrase Rotation:** Because memories and file keys are protected by `DEK` rather than `PassphraseKEK`, changing the Vault Passphrase only derives a fresh `PassphraseKEK_new` with a new random salt and re-wraps the existing `DEK`. Zero memories need re-encryption.
- **Volatile Memory Discipline:** Store the unwrapped `DEK` exclusively inside an in-memory Zustand store (no persistence middleware). Never write raw key material to `localStorage`, `sessionStorage`, `IndexedDB`, cookies, URLs, crash reports, or console logs. Implement a `zeroize(buffer: Uint8Array)` helper to overwrite temporary key byte arrays immediately after wrapping/unwrapping, enforce configurable idle auto-lock (default 15 minutes), and explicitly document in `docs/CRYPTOGRAPHY.md` that JavaScript memory clearing is best-effort rather than forensic RAM erasure.

### 5.3 Versioned Ciphertext Envelope, Block Padding & AAD
Define and enforce a strict, self-describing ciphertext envelope. Reject unsupported versions or malformed fields immediately—never guess decryption parameters:

```json
{
  "version": 1,
  "algorithm": "AES-256-GCM",
  "nonce": "<base64url-encoded 12-byte CSPRNG nonce>",
  "ciphertext": "<base64url-encoded ciphertext concatenated with 16-byte GCM auth tag>"
}
```

- **Fresh Nonces Always:** Generate a new 96-bit (`12-byte`) nonce via `crypto.getRandomValues` for every single encryption operation, including every autosave, edit, retry, and key re-wrap. Never reuse a nonce under the same key.
- **Deterministic Block Padding:** Before encrypting a memory payload JSON (`{ title, bodyMarkdown, mood, tags, customMeta, schemaVersion }`), encode to UTF-8 and apply length-prefixed deterministic padding to the nearest $256\text{-byte}$ boundary (e.g., $\lceil (L + 4) / 256 \rceil \times 256$ bytes) to reduce ciphertext-length side-channel leakage.
- **Associated Authenticated Data (AAD):** Bind every ciphertext cryptographically to its exact context so an attacker with database write access cannot swap ciphertexts between users or records:
  - Vault DEK Wrap AAD: `memoir:v1|dek-wrap|user:{userId}`
  - Recovery DEK Wrap AAD: `memoir:v1|recovery-wrap|user:{userId}`
  - Memory Payload AAD: `memoir:v1|memory|user:{userId}|id:{memoryId}`
  - Attachment Metadata AAD: `memoir:v1|attachment-meta|user:{userId}|id:{attachmentId}`
  - Attachment File Key Wrap AAD: `memoir:v1|file-key-wrap|user:{userId}|id:{attachmentId}`
  - Attachment Bytes AAD: `memoir:v1|attachment-blob|user:{userId}|id:{attachmentId}`

### 5.4 Attachment & File Encryption Specification
1. Strip EXIF, GPS coordinates, and camera serial metadata from uploaded images (`JPEG`/`PNG`/`WebP`) client-side before encryption.
2. Generate a unique random 256-bit `FileKey` per attachment.
3. Encrypt the file bytes with `AES-256-GCM` using `FileKey`, a fresh 96-bit `fileNonce`, and Attachment Bytes AAD.
4. Encrypt the private file metadata (`{ originalFilename, mimeType, originalSize }`) under `DEK` (or `FileKey`) with its own fresh `metaNonce`.
5. Wrap `FileKey` using `DEK` + fresh `fileKeyNonce` + File Key Wrap AAD.
6. Upload opaque ciphertext bytes; the server assigns a fresh random UUIDv4 `storageKey` (`{uuid}.enc`) and never trusts client-provided filenames or MIME types.
7. Never render untrusted HTML or SVG inline; serve encrypted downloads solely with `Content-Type: application/octet-stream`, `Content-Disposition: attachment`, and `X-Content-Type-Options: nosniff`.
8. In the browser, decrypt blobs into memory, create temporary preview URLs via `URL.createObjectURL`, and revoke them immediately on component unmount.

### 5.5 Mandatory Cryptographic Test Requirements (`packages/crypto`)
Write deterministic Vitest tests verifying every security invariant below (never write trivial tests that merely assert encryption returns a non-empty string):
1. Round-trip encryption/decryption for ASCII, Unicode/RTL/Persian text, emojis, empty payloads, and large multi-megabyte Markdown payloads.
2. Deterministic KDF + HKDF domain separation test verifying derived keys match known vectors and different HKDF `info` labels yield distinct keys.
3. Wrong passphrase / wrong DEK rejection (throws authenticated decryption failure).
4. Single-bit tamper rejection across `ciphertext`, `authTag`, `nonce`, and `AAD`.
5. Unsupported envelope `version` and malformed base64/nonce-length rejection.
6. Nonce uniqueness across $10{,}000$ consecutive encryption operations.
7. Deterministic 256-byte block padding verification (distinct short inputs pad to identical ciphertext lengths).
8. Recovery Key generation, Crockford Base32 checksum validation, and DEK unwrap round-trip.
9. Zero-reencryption Vault Passphrase rotation round-trip (old passphrase rejected, new passphrase unlocks original memories).
10. Binary file encryption/decryption and per-file `FileKey` wrapping round-trip.
11. EXIF metadata stripping verification on synthetic JPEG test fixtures.
12. Network boundary assertion confirming zero plaintext diary fields or keys are sent in API requests.
13. Storage boundary assertion confirming zero raw keys or passphrases appear in `localStorage`, `sessionStorage`, `IndexedDB`, cookies, or logs.

---

## 6. Authentication, API, Browser & Privacy Security Engineering

### 6.1 Authentication & Session Lifecycle
- **Password Hashing:** Hash the Account Authentication Password server-side using `argon2` (`Argon2id`) with deployment-appropriate memory/time parameters. Never store plaintext passwords.
- **Opaque Cookie Sessions:** Prefer server-managed opaque sessions (or short-lived access + rotating refresh tokens) delivered strictly via `HttpOnly`, `Secure` (production), `SameSite=Strict` cookies. Never store bearer tokens in `localStorage`.
- **Hashed Session Storage & Reuse Detection:** Store only cryptographic hashes of session/refresh tokens in PostgreSQL. Rotate session IDs on login, MFA verification, and privilege changes. If a previously rotated refresh token is replayed, immediately revoke the entire session family and emit a `SUSPICIOUS_LOGIN` security event.
- **Anti-Enumeration:** Use generic login/recovery error messages and consistent response behavior to mitigate email enumeration.
- **Email Verification & Re-Authentication:** Require verified emails before sensitive account actions. Require recent re-authentication before password change, 2FA removal, Passkey removal, or account deletion.
- **TOTP 2FA:** Implement with `otplib` + `qrcode`. Encrypt TOTP secrets at rest using a server envelope key (`SERVER_KMS_KEY`). Issue 10 single-use backup codes stored exclusively as cryptographic hashes. Use a short-lived `mfa_pending` challenge state during login when 2FA is active.
- **WebAuthn Passkeys:** Implement with `@simplewebauthn/server` and `@simplewebauthn/browser`, storing short-lived challenges (5-minute TTL) in Redis. Make the security boundary explicit in UI and docs: Passkeys authenticate the server session; unless WebAuthn PRF is supported and enabled, the user unlocks the local vault separately with their Vault Passphrase so Zero-Knowledge guarantees are never weakened.

### 6.2 API Defense-in-Depth Rules
- **Explicit Allowlisted DTOs:** Validate every request body, query param, and path param using Zod / `class-validator` with whitelist/forbidNonWhitelisted enabled. Never bind arbitrary payloads directly to Prisma models (zero mass assignment).
- **Strict Ownership Enforcement:** Every query or mutation on `memories`, `attachments`, `sessions`, `user_vaults`, `webauthn_credentials`, and `backups` must scope strictly to `req.user.id` and deny cross-user access (IDOR prevention).
- **Nonce Reuse Guard:** On `PATCH /api/v1/memories/:id`, reject the update (`400 Bad Request`) if the submitted `nonce` is identical to the previously persisted `nonce`.
- **CSRF Protection:** Enforce Double-Submit Cookie or session-bound synchronizer CSRF tokens (`X-CSRF-Token` header) plus `Origin`/`Referer` validation on every cookie-authenticated `POST`, `PUT`, `PATCH`, and `DELETE` route.
- **Tiered Proxy-Aware Rate Limiting & Lockout:** Back `@nestjs/throttler` with Redis and configure Express/Fastify `trust proxy` properly:
  - Global API tier: `120 req/min` per IP.
  - Sensitive auth tier (`/login`, `/register`, `/verify-email`, `/forgot-password`, `/vault/recover`): `5 req/min` per IP + normalized email key.
  - 2FA verification tier: `5 attempts / 5 min`.
  - Exponential account lockout (`failedLoginAttempts`, `lockedUntil`) emitting `LOCKOUT_TRIGGERED`.
- **Safe Error Handling & Bounds:** Return consistent structured errors without stack traces, SQL queries, or internal details in production. Enforce strict JSON body limits, file size caps (e.g., 10 MB per attachment), and per-user storage quotas (e.g., 250 MB). Use cursor/stable pagination and versioned routes (`/api/v1/...`) documented via OpenAPI.

### 6.3 Browser Security & Honest Web E2EE Limitations
- **Strict Content Security Policy (CSP):** Test against the actual production Vite bundle:
  - `default-src 'self'`
  - `script-src 'self'` (zero `unsafe-eval`, zero `unsafe-inline` scripts)
  - `style-src 'self' 'unsafe-inline'` (or hashed styles if feasible with Tailwind build)
  - `connect-src 'self'`
  - `img-src 'self' blob:`
  - `font-src 'self'`
  - `frame-ancestors 'none'`
  - `object-src 'none'`
  - `base-uri 'self'`
  - `form-action 'self'`
- **Security Headers:** Enforce `Strict-Transport-Security` (production HTTPS), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and restrictive `Permissions-Policy` (disable camera, microphone, geolocation, payment, USB).
- **Allowlisted CORS:** Explicit origin allowlist with `credentials: true`; never wildcard `*`.
- **XSS Sanitization Boundary:** Render user Markdown exclusively through `react-markdown` + `rehype-sanitize` with a strict allowlist schema blocking raw HTML, `javascript:`/`data:` URLs, and inline event handlers. Never use `dangerouslySetInnerHTML`.
- **Zero Third-Party Scripts or Remote Fonts:** Never load analytics, CDNs, chat widgets, or remote Google Fonts on application pages; bundle all fonts locally via `@fontsource`. Disable public source maps in production deployments.
- **Mandatory Honest Limitation Disclosure:** Document clearly in `README.md`, `docs/THREAT_MODEL.md`, and `PROJECT_AND_SECURITY_REPORT.md` that browser-based E2EE cannot fully defend against a malicious or compromised server serving tampered JavaScript to the user's browser, compromised client devices/keyloggers, or malicious browser extensions. Discuss mitigations such as reproducible builds, signed releases, Subresource Integrity, strict CI/CD controls, and future native desktop wrappers.

### 6.4 Privacy & Logging Redaction Policy
- Configure `nestjs-pino` with default redaction paths covering at minimum:
  `req.headers.authorization`, `req.headers.cookie`, `res.headers['set-cookie']`, `*.password`, `*.currentPassword`, `*.newPassword`, `*.passphrase`, `*.token`, `*.refreshToken`, `*.totpCode`, `*.totpSecret`, `*.backupCode`, `*.recoveryKey`, `*.ciphertext`, `*.wrappedDek`, `*.wrappedFileKey`, `*.encryptedMeta`.
- Log operational events only—never request bodies containing encrypted/private fields, never plaintext titles, bodies, tags, moods, or filenames.
- Define explicit event retention periods in `docs/PRIVACY.md`.

---

## 7. Database Schema Blueprint (`apps/api/prisma/schema.prisma`)

Manage all schema changes through versioned Prisma migrations with UUID primary keys, strict foreign keys, deliberate cascade deletes, composite indexes on `(userId, createdAt)` and `(userId, entryDate)`, and transactional writes for multi-table operations:

1. **`users`**
   - `id` (UUID PK), `email` (normalized, unique), `passwordHash`, `emailVerifiedAt`, `emailVerifyTokenHash`, `emailVerifyExpiresAt`, `accountStatus` (`ACTIVE`, `SUSPENDED`, `PENDING_DELETION`), `totpSecretEncrypted`, `totpEnabled` (boolean, default `false`), `totpBackupCodesHash` (JSON array of hashes), `failedLoginAttempts` (int), `lockedUntil` (DateTime?), `createdAt`, `updatedAt`.
2. **`user_vaults`**
   - `id` (UUID PK), `userId` (unique FK -> `users`), `kdfAlgorithm` (`ARGON2ID`), `kdfSalt`, `kdfMemory`, `kdfIterations`, `kdfParallelism`, `wrapAlgorithm` (`AES-256-GCM`), `envelopeVersion` (int), `wrappedDek`, `wrappedDekNonce`, `recoverySalt`, `recoveryWrappedDek`, `recoveryNonce`, `recoveryKeyFingerprint`, `createdAt`, `updatedAt`.
3. **`memories`**
   - `id` (UUID PK), `userId` (FK -> `users`), `entryDate` (Date/DateTime operational bucket — documented in `PRIVACY.md`), `isPinned` (boolean), `isTimeCapsule` (boolean), `unlockAt` (DateTime?), `envelopeVersion` (int), `algorithm`, `ciphertext` (Bytes or Text), `nonce`, `archivedAt` (DateTime?), `deletedAt` (DateTime?), `createdAt`, `updatedAt`.
   - *Invariant:* Zero plaintext content columns (`title`, `body`, `tags`, `mood` must NEVER exist in this table).
4. **`attachments`**
   - `id` (UUID PK), `userId` (FK -> `users`), `memoryId` (nullable FK -> `memories` for Private Vault items), `isVaultItem` (boolean), `storageKey` (unique UUIDv4), `envelopeVersion` (int), `encryptedMeta`, `metaNonce`, `wrappedFileKey`, `fileKeyNonce`, `fileNonce`, `ciphertextByteSize` (int), `deletedAt` (DateTime?), `createdAt`.
5. **`sessions`**
   - `id` (UUID PK), `userId` (FK -> `users`), `tokenHash` (unique), `familyId` (UUID), `deviceLabel`, `userAgentSummary`, `ipMaskedOrHash`, `lastSeenAt`, `expiresAt`, `revokedAt` (DateTime?), `createdAt`.
6. **`webauthn_credentials`**
   - `id` (UUID PK), `userId` (FK -> `users`), `credentialId` (unique), `publicKey` (Bytes), `counter` (BigInt), `transports` (String[]), `deviceName`, `createdAt`, `lastUsedAt`.
7. **`security_events`**
   - `id` (UUID PK), `userId` (FK -> `users`), `eventType` (enum: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOCKOUT_TRIGGERED`, `EMAIL_VERIFIED`, `PASSWORD_CHANGED`, `VAULT_CREATED`, `VAULT_PASSPHRASE_ROTATED`, `RECOVERY_KEY_USED`, `TOTP_ENABLED`, `TOTP_DISABLED`, `PASSKEY_ADDED`, `PASSKEY_REMOVED`, `SESSION_REVOKED`, `SUSPICIOUS_LOGIN`, `BACKUP_EXPORTED`, `ACCOUNT_DELETION_REQUESTED`), `safeMetadata` (JSON — strictly non-PII, non-secret), `createdAt`.
8. **`backups`**
   - `id` (UUID PK), `userId` (FK -> `users`), `checksumSha256`, `entryCount`, `byteSize`, `createdAt`.

---

## 8. Editorial UI/UX & Accessibility System (Anti-AI-Slop Mandate)

Craft a calm, tactile web application that feels like a **bespoke literary writing tool and Swiss-engineered privacy vault**—never a generic AI-generated admin dashboard.

### 8.1 Design Tokens & Visual Language
- **Light Mode — Archival Paper & Ink (Default):**
  - Canvas Background: Warm Alabaster `#FAF8F5`
  - Elevated Surface / Sidebar: Soft Stone `#F2EFE9`
  - Subtle Borders: Warm Hairline `#E4DFD6`
  - Primary Ink Text: Deep Charcoal `#1C1B19`
  - Muted Metadata Text: Slate Stone `#6B6862`
  - Primary Accent (Restrained): Deep Forest Pine `#2D4F43` (hover `#223D34`)
  - Destructive / Security Warning Accent: Terracotta Clay `#A65D47`
  - Time Capsule Sealed Accent: Warm Ochre `#B3833A`
- **Dark Mode — Obsidian Ink:**
  - Canvas `#141413` | Surface `#1C1B1A` | Border `#2B2926` | Primary Ink `#ECE9E2` | Muted Ink `#9A968E` | Primary Accent `#6E9E8B`.
- **Self-Hosted Typography (`@fontsource` only — zero external font tracking):**
  - Journal Titles & Long-Form Prose: Editorial Serif (`@fontsource/newsreader` or `@fontsource/lora`).
  - Navigation, Controls & Forms: Humanist Sans (`@fontsource/plus-jakarta-sans` or `@fontsource/inter`).
  - Recovery Keys, Cipher Fingerprints, Audit Logs: Monospace (`@fontsource/jetbrains-mono`).
- **Spatial Craftsmanship:**
  - Centered `68ch` optimal reading/writing column with generous whitespace and subtle `150ms ease-out` transitions.
  - Whisper-quiet encryption & autosave status indicator (e.g., `Encrypted locally · Saved 14:22`) announced via `aria-live="polite"`.
  - Clean, purposeful navigation: `Journal`, `Timeline`, `Calendar`, `Time Capsules`, `Private Vault`, `Insights`, `Security`, and `Settings`.
- **Strictly Forbidden ("AI-Slop" Blacklist):**
  - NO purple/indigo/cyan neon gradients or glowing borders.
  - NO gratuitous glassmorphism (`backdrop-blur` cards floating over noisy blobs).
  - NO emojis used as UI icons (use crisp thin-stroke `lucide-react` icons at `1.5px` stroke width).
  - NO cliché AI landing copy ("Supercharge your memories with next-gen..."). Write calm, clear, human copy.
  - NO rainbow pastel tag overload; use subtle earthy dots or minimal monochrome-to-muted badges for moods and tags.

### 8.2 Complete Screen Inventory
1. **Landing Page:** Restrained overview of privacy guarantees, honest architecture summary, and clear sign-up CTA.
2. **Registration, Login & Email Verification** (with accessible validation and non-enumerating errors).
3. **Vault Onboarding & Recovery Kit Modal** (separate Vault Passphrase, printable Recovery Kit, mandatory confirmation).
4. **Vault Unlock & Vault Recovery Screens** (with idle-lock state and Cryptographic Inspector popover).
5. **Main Journal / Distraction-Free Editor** (serif title, Markdown body, autosave states, tags, mood, encrypted attachments).
6. **Chronological Timeline & Archive View** (pagination, pinning, archive/restore, delete confirmation).
7. **Monthly Calendar View** (entry density indicators, multi-entry day selection).
8. **Memory Detail & Attachment Viewer** (sanitized Markdown preview, decrypted in-memory image/PDF preview).
9. **Local Search Results** (unlocked vault only; clear locked-vault prompt otherwise).
10. **Private Vault** (standalone encrypted documents & photos).
11. **Time Capsules View** (sealed countdown state and unlocked reveal state).
12. **Personal Insights** (100% client-side mood trends, writing streaks, non-diagnostic notice).
13. **Security Dashboard** (security posture checklist, active sessions with one-click revoke, suspicious login banner, 2FA/Passkey management, filterable monospace Security Audit Log).
14. **Data Portability & Account Settings** (encrypted backup export/restore, warned plaintext export, password/passphrase rotation, deliberate account deletion).
15. **Resilient Edge States** (Loading skeletons, meaningful empty states, offline banner, network retry, 404, and safe error boundaries).

### 8.3 Accessibility (WCAG 2.2 AA Target)
- Full keyboard navigation (`Tab`, `Escape`, `Cmd/Ctrl + S`, `Cmd/Ctrl + K`) with visible focus rings.
- Semantic HTML landmarks (`<header>`, `<nav>`, `<main>`, `<article>`) and explicit `<label>` associations on every control.
- `aria-live="polite"` announcements for autosave, lock/unlock, and error statuses.
- Strict contrast compliance ($\ge 4.5:1$ for normal text), `prefers-reduced-motion` support, mobile/tablet/desktop responsiveness, and never relying on color alone to indicate status.

---

## 9. Repository Quality Standards & Documentation Suite

### 9.1 Required Root & Engineering Documentation
- **`README.md`:** Honest, clean, portfolio-grade overview containing product vision, architecture & Mermaid crypto diagram, feature matrix, honest security limitations, tech stack, copy-pasteable local setup, environment variables, dev/test commands, deployment overview, and links to all `docs/`. **Never include fake badges, fake test coverage numbers, fake live URLs, or unverified claims.**
- **`CONTRIBUTING.md`:** Branch naming, Conventional Commits rules, local setup, formatting/linting, testing expectations, PR checklist, and rules for security-sensitive contributions.
- **`SECURITY.md`:** Supported versions, private vulnerability reporting process, expected triage timeline, what not to post in public issues, and known web-E2EE limitations.
- **`CHANGELOG.md`:** Keep-a-Changelog format tracking user-visible milestones by semantic version.
- **`LICENSE`:** Ask the repository owner before selecting a license; do not assume open-source licensing without confirmation.
- **`.gitignore` & `.env.example`:** Comprehensive ignore rules plus fully commented `.env.example` files containing safe dummy placeholders only.
- **`docs/` Suite:** `IMPLEMENTATION_PLAN.md`, `REQUIREMENTS.md`, `DEVELOPMENT_SETUP.md`, `ARCHITECTURE.md`, `CRYPTOGRAPHY.md`, `THREAT_MODEL.md`, `PRIVACY.md`, `API.md`, `TESTING.md`, and `DEPLOYMENT.md`.

### 9.2 Code Quality & Conventional Commits
- Strict TypeScript across all packages; avoid `any` (justify any unavoidable edge case with an inline comment).
- Small, cohesive modules; zero duplicate business logic; zero dead code or unused packages; zero debug `console.log` in production code paths.
- Commit format: `<type>(<scope>): <imperative concise subject>` using types `feat`, `fix`, `security`, `docs`, `test`, `build`, `ci`, `chore`, `refactor`. Never use vague messages like `update`, `wip`, or `final`.

---

## 10. Step-by-Step, Commit-by-Commit Roadmap (46 Atomic Commits)

Execute strictly in numerical order. Every phase ends with verified checks and an update to `PROJECT_AND_SECURITY_REPORT.md`.

> **FIRST SESSION EXECUTION GATE:** During the initial agent session, execute **only Phase 0 (Commits 01–04)**, report the environment inspection, commit hashes, files created, and verification results, and **STOP to wait for user review** before starting Phase 1.

---

### Phase 0 — Environment Inspection, Planning & Clean Foundation *(First Session Only)*

#### Step 0.0 — Machine & Repository Inspection
Run and report actual output before making changes:
```bash
pwd
git status --short --branch
git --version
node --version
pnpm --version
docker --version
docker compose version
```
If a required tool is missing, explain the official installation method for the detected OS and install only if permissions allow. Confirm directory name `memoir` and ask the owner for their preferred `LICENSE` choice.

#### Commit 01 — `chore(repo): initialize git repository, workspace layout, and gitignore`
- Run `git init -b main` only if not already a Git repo.
- Create `.gitignore`, `.editorconfig`, `.npmrc`, `pnpm-workspace.yaml`, and initial directory skeleton.

#### Commit 02 — `docs(plan): define implementation plan, requirements, and repository standards`
- Create `docs/IMPLEMENTATION_PLAN.md`, `docs/REQUIREMENTS.md`, `docs/DEVELOPMENT_SETUP.md` (recording exact detected runtime versions), `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, and initial honest `README.md`.

#### Commit 03 — `chore(tooling): configure pnpm TypeScript monorepo, ESLint, Prettier, and commit hooks`
- Initialize root `package.json` with scripts (`dev`, `build`, `lint`, `format:check`, `typecheck`, `test`, `test:security`, `test:e2e`, `audit`) and workspace package manifests (`apps/web`, `apps/api`, `packages/crypto`, `packages/shared`).
- Configure `tsconfig.base.json` (strict flags), ESLint flat config (`eslint.config.mjs`), `.prettierrc.json`, Husky `pre-commit` (`lint-staged`) and `commit-msg` (`@commitlint/cli`).
- Verify clean install, format check, lint, and typecheck pass.

#### Commit 04 — `docs(report): initialize unified PROJECT_AND_SECURITY_REPORT.md with Phase 0 baseline`
- Create `PROJECT_AND_SECURITY_REPORT.md` using the full 15-section template in Section 13 and record Phase 0 verified outputs.
- **STOP HERE AND WAIT FOR OWNER REVIEW BEFORE PHASE 1.**

*Phase 0 Acceptance:* Clean `pnpm install`, formatting/lint/typecheck pass, zero untracked junk or secrets, clean `git status`.

---

### Phase 1 — Architecture Boundaries, App Shells & Local Services

#### Commit 05 — `docs(architecture): document system boundaries, STRIDE threat model, and privacy policy`
- Author `docs/ARCHITECTURE.md` (trust boundaries, request/encryption flows, Mermaid diagrams), `docs/THREAT_MODEL.md` (assets, attackers, STRIDE analysis, assumptions, metadata exposure, malicious-JS out-of-scope threats), and `docs/PRIVACY.md`.

#### Commit 06 — `chore(infra): add reproducible local Docker Compose services and env templates`
- Create `docker-compose.yml` running `postgres:16-alpine` (healthcheck + persistent volume), `axllent/mailpit` (local verification email UI/SMTP), and `redis:7-alpine` (password-protected + healthcheck).
- Create `.env.example`, `apps/api/.env.example`, and `apps/web/.env.example` with safe placeholders only.
- Verify `docker compose up -d` starts cleanly and all services report healthy.

#### Commit 07 — `feat(api): scaffold NestJS foundation, Zod env validation, OpenAPI, and redacted logging`
- Initialize `packages/shared` (shared Zod schemas, enums, safe error codes).
- Scaffold NestJS in `apps/api` with `config` (fail-fast Zod env validation), `health` (`/api/v1/health` checking DB/Redis), global validation pipe (`whitelist: true`, `forbidNonWhitelisted: true`), non-leaking global exception filter, Swagger/OpenAPI setup, and `nestjs-pino` with strict default redaction paths.

#### Commit 08 — `feat(web): build responsive application shell and Archival Paper & Ink design system`
- Scaffold Vite + React 19 + TypeScript + Tailwind CSS v4 in `apps/web`.
- Install self-hosted fonts (`@fontsource/newsreader`, `@fontsource/plus-jakarta-sans`, `@fontsource/jetbrains-mono`), `lucide-react`, Radix UI primitives as needed, `react-router-dom`, `@tanstack/react-query`, `react-hook-form`, `zod`, `zustand`.
- Implement Archival Paper & Ink (light) and Obsidian Ink (dark) tokens (`src/styles/tokens.css`), theme toggle, restrained landing page, responsive navigation shell, and accessible button/input/dialog primitives adhering strictly to Section 8.

#### Commit 09 — `docs(report): append Phase 1 architecture and shell verification to report`
- Update `PROJECT_AND_SECURITY_REPORT.md` with Phase 1 deliverables, commands run, and verification results.

*Phase 1 Acceptance:* Web and API boot independently, `/api/v1/health` returns OK, PostgreSQL/Redis/Mailpit are healthy, zero production secrets committed.

---

### Phase 2 — Database & Account Authentication

#### Commit 10 — `feat(database): add initial Prisma schema and migrations for accounts, sessions, and audit events`
- Configure Prisma in `apps/api` with `users`, `sessions`, and `security_events` models, strict foreign keys, unique constraints, and composite indexes.
- Run `prisma migrate dev --name init_auth_schema` and verify clean migration from an empty DB.

#### Commit 11 — `feat(auth): implement registration, server Argon2id hashing, and email verification`
- Build `POST /api/v1/auth/register` and `POST /api/v1/auth/verify-email` with server-side `Argon2id` password hashing, expiring hashed one-time verification tokens, generic non-enumerating responses, and local Mailpit SMTP delivery.

#### Commit 12 — `feat(auth): implement opaque cookie sessions, rotation, and reuse detection`
- Build `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, and `GET /api/v1/auth/me` using `HttpOnly`, `Secure` (prod), `SameSite=Strict` cookies, hashed tokens in DB, rotation on login/refresh, and full session-family revocation on replay detection.
- Add integration tests covering auth lifecycle and reuse revocation.

#### Commit 13 — `feat(web): build accessible registration, login, and email verification screens`
- Implement Registration, Login, Email Verification, and protected route guards in `apps/web` with accessible labels, non-enumerating errors, and loading states.

#### Commit 14 — `feat(auth): add active session management and remote device revocation`
- Implement `SessionsModule` (`GET /api/v1/sessions`, `DELETE /api/v1/sessions/:id`, `POST /api/v1/sessions/revoke-all`) with `ua-parser-js` device labels, masked/hashed IP display, Redis immediate revocation check, and cross-user denial tests.
- Add Active Sessions UI in `apps/web`.

#### Commit 15 — `docs(report): append Phase 2 authentication verification to report`
- Update `PROJECT_AND_SECURITY_REPORT.md` with Phase 2 evidence and commit ledger.

*Phase 2 Acceptance:* Zero plaintext passwords stored, proper cookie flags verified, session rotation & reuse revocation tested, cross-user session access denied.

---

### Phase 3 — Zero-Knowledge Cryptography & Vault Lifecycle *(Strictly Before Memory CRUD)*

#### Commit 16 — `docs(crypto): specify versioned client-side encryption, key hierarchy, and recovery`
- Author `docs/CRYPTOGRAPHY.md` specifying exact library versions, Argon2id parameters & benchmarks, HKDF domain strings, AES-256-GCM nonce/AAD formats, 256-byte block padding, versioned envelopes, Crockford Base32 recovery keys, zero-reencryption passphrase rotation, and JS memory limitations.

#### Commit 17 — `feat(crypto): implement versioned Argon2id, HKDF, AES-256-GCM, padding, and recovery engine`
- Install `hash-wasm` in `packages/crypto`.
- Implement pure, strictly typed primitives: `derivePassphraseKek`, `deriveRecoveryKek`, `generateDek`, `wrapDek`, `unwrapDek`, `encryptEnvelope`, `decryptEnvelope`, `padPayload`, `unpadPayload`, `generateRecoveryKey`, `validateRecoveryKey`, `encryptFileBytes`, `decryptFileBytes`, and `zeroize`.

#### Commit 18 — `test(crypto): verify cryptographic invariants, tamper rejection, nonce uniqueness, and recovery`
- Implement the full 13-point Vitest cryptographic suite defined in Section 5.5 (round-trips, wrong keys, 1-bit tamper on ciphertext/tag/nonce/AAD, unsupported versions, $10{,}000$ unique nonces, block padding, recovery unwrap, passphrase rotation, file encryption).

#### Commit 19 — `feat(vault): add user_vaults persistence and browser vault setup, unlock, lock, and recovery UI`
- Add `user_vaults` Prisma migration and `VaultModule` (`POST /api/v1/vault`, `GET /api/v1/vault`, `POST /api/v1/vault/rotate-passphrase`, `POST /api/v1/vault/recover`).
- Create volatile RAM-only `VaultKeyStore` (Zustand, no persistence) with manual Lock and configurable idle auto-lock (default 15 minutes).
- Build first-time Vault Setup (separate Vault Passphrase + printable Recovery Kit with mandatory confirmation checkbox), Vault Unlock, Vault Recovery, Passphrase Rotation, and a transparent **Cryptographic Inspector** header popover.

#### Commit 20 — `test(vault): verify vault lifecycle, wrong passphrase, recovery, and zero secret persistence`
- Add frontend + integration tests verifying wrong passphrase rejection, Recovery Key rescue, lock/logout/session-expiry key clearing, and zero secret presence in API requests, `localStorage`, `sessionStorage`, `IndexedDB`, or logs.

#### Commit 21 — `docs(report): append Phase 3 zero-knowledge cryptography report and test evidence`
- Update `PROJECT_AND_SECURITY_REPORT.md` Section 5 & Phase 3 ledger with actual test evidence.

*Phase 3 Acceptance:* Browser-only key handling verified, zero secrets transmitted or persisted in browser storage, tampered ciphertexts fail closed, recovery flow tested end-to-end.

---

### Phase 4 — Encrypted Diary Core

#### Commit 22 — `feat(memory): add encrypted memory schema and opaque persistence API`
- Add `memories` Prisma migration and `MemoriesModule` (`GET /api/v1/memories`, `GET /api/v1/memories/:id`, `POST`, `PATCH`, `DELETE`, archive/restore/pin).
- Enforce strict `userId` ownership, payload size limits, envelope schema/version validation, and nonce-reuse rejection on `PATCH`.

#### Commit 23 — `feat(memory): implement browser-side memory encryption service with AAD binding`
- Wire `packages/crypto` into `apps/web` memory API hooks so titles, Markdown bodies, tags, and moods are padded and encrypted with record-bound AAD before leaving the browser, with a fresh nonce on every save/retry.

#### Commit 24 — `feat(web): build distraction-free Markdown editor with autosave state machine and XSS sanitization`
- Build the `68ch` archival diary editor with serif titles, multi-entry day support, pinning, private tags, optional mood selector, debounced autosave state machine (`Saving`, `Saved`, `Offline`, `Failed` + retry), unsaved-change navigation guard, keyboard shortcuts (`Cmd/Ctrl + S`), and `react-markdown` + `rehype-sanitize` preview.

#### Commit 25 — `feat(memory): add chronological timeline, memory detail, calendar view, and local search`
- Implement paginated **Timeline** grouped cleanly by month/year, Memory Detail view, archive/restore/delete confirmation modals, interactive monthly **Calendar View** (documenting visible `entryDate` metadata), and **100% Client-Side Local Search** across unlocked decrypted entries (never sending queries to the server).

#### Commit 26 — `test(memory): cover encrypted diary CRUD, ownership isolation, autosave races, and local search`
- Write integration and frontend tests verifying CRUD, cross-user IDOR denial, autosave race handling, local search isolation, and a direct PostgreSQL assertion confirming zero plaintext strings exist in `memories` rows.

#### Commit 27 — `docs(report): append Phase 4 encrypted diary core verification to report`
- Update `PROJECT_AND_SECURITY_REPORT.md` with Phase 4 evidence.

*Phase 4 Acceptance:* Zero plaintext persisted in PostgreSQL, cross-user access denied, local search never hits the network with queries, autosave never silently drops edits.

---

### Phase 5 — Encrypted Attachments, Private Vault & Data Portability

#### Commit 28 — `feat(storage): add private attachment storage abstraction and quota enforcement`
- Add `attachments` Prisma migration and `StorageProvider` interface with a local development disk adapter (outside public web roots) and a production private S3-compatible object storage adapter.
- Enforce per-file size limits (10 MB), per-user storage quotas (250 MB), server-generated UUIDv4 storage keys (eliminating path traversal), and zero public URLs.

#### Commit 29 — `feat(attachments): implement client-side EXIF stripping and per-file AES-256-GCM encryption`
- Add client-side EXIF/GPS stripping for JPEG/PNG/WebP uploads.
- Encrypt file bytes and original filename/MIME metadata under fresh random per-file `FileKey`s wrapped with `DEK`.
- Build `AttachmentsModule` (`POST`, `GET`, `DELETE`) serving encrypted blobs strictly with `Content-Type: application/octet-stream`, `Content-Disposition: attachment`, and `X-Content-Type-Options: nosniff`.
- Integrate decrypted in-memory image/document previews in the editor, revoking object URLs on unmount.

#### Commit 30 — `feat(vault): add Private Vault UI for standalone encrypted documents and photos`
- Build the dedicated **Private Vault** page (`isVaultItem: true`) for independently encrypted personal files, plus upload, ownership, quota, and ciphertext-tamper tests.

#### Commit 31 — `feat(portability): add encrypted backup export/import and warning-gated plaintext export`
- Add `backups` Prisma migration and `.memoir-backup.json` export containing ciphertext envelopes, KDF params, wrapped DEK, and SHA-256 integrity manifest, logging `BACKUP_EXPORTED`.
- Build local Backup Verification & Restore UI (validating checksums, envelope versions, and deduplicating by ID).
- Add explicit warning-gated local plaintext/Markdown export after local decryption.

#### Commit 32 — `docs(report): append Phase 5 attachments and portability verification to report`
- Update `PROJECT_AND_SECURITY_REPORT.md` with Phase 5 evidence.

*Phase 5 Acceptance:* Files encrypted before upload with stripped EXIF, zero public URLs, safe binary download headers, malformed backup imports rejected safely.

---

### Phase 6 — Application Security Hardening *(One Dedicated Commit Per Control)*

> **CRITICAL:** Every security control in Phase 6 MUST receive its own atomic commit, automated tests, and immediate update to `PROJECT_AND_SECURITY_REPORT.md`.

#### Commit 33 — `security(headers): enforce strict CSP, HSTS, Helmet headers, and allowlisted CORS`
- Configure `helmet` and reverse-proxy header parity with strict CSP (verified against the production Vite build), HSTS, `nosniff`, `no-referrer`, `frame-ancestors 'none'`, `Permissions-Policy`, and allowlisted CORS (`credentials: true`).
- Add automated header verification tests and update `PROJECT_AND_SECURITY_REPORT.md`.

#### Commit 34 — `security(csrf-validation): enforce CSRF protection, strict DTO allowlists, and XSS regression tests`
- Enforce CSRF protection (`X-CSRF-Token` + `Origin`/`Referer` check) on all cookie-authenticated mutations.
- Audit all API DTOs against mass assignment and add regression tests for CSRF rejection (`403`), XSS-shaped Markdown inputs, and SQLi-shaped parameters.
- Update `PROJECT_AND_SECURITY_REPORT.md`.

#### Commit 35 — `security(ratelimit): enforce proxy-aware Redis rate limiting and exponential account lockout`
- Configure `@nestjs/throttler` backed by Redis with strict auth/2FA/recovery tiers and proper proxy IP resolution.
- Implement exponential account lockout (`failedLoginAttempts`, `lockedUntil`) and `LOCKOUT_TRIGGERED` events with automated `429` and lockout tests.
- Update `PROJECT_AND_SECURITY_REPORT.md`.

#### Commit 36 — `security(2fa): implement TOTP 2FA, KMS-encrypted secrets, hashed backup codes, and password lifecycle`
- Implement `POST /api/v1/auth/2fa/setup`, `/enable`, `/verify`, `/disable` using `otplib` + `qrcode`, `SERVER_KMS_KEY`-encrypted TOTP secrets, 10 hashed single-use backup codes, and short-lived `mfa_pending` login tokens.
- Implement re-authenticated Account Password change and Account Password reset (verifying and testing that resetting the account password never modifies or decrypts `user_vaults`).
- Build 2FA enrollment/verification UI and update `PROJECT_AND_SECURITY_REPORT.md`.

#### Commit 37 — `security(passkeys): implement WebAuthn Passkeys with explicit zero-knowledge vault boundary`
- Integrate `@simplewebauthn/server` and `@simplewebauthn/browser` with `webauthn_credentials` migration, Redis 5-minute TTL challenges, registration/authentication/management endpoints, and Passkey UI.
- Document and verify that Passkey login authenticates the server session while local vault unlocking remains protected by the separate Vault Passphrase (or optional WebAuthn PRF where supported).
- Update `PROJECT_AND_SECURITY_REPORT.md`.

#### Commit 38 — `security(audit): add logging redaction tests, suspicious login detection, and Security Dashboard UI`
- Add automated tests proving passwords, cookies, tokens, recovery keys, and ciphertexts never enter Pino logs.
- Implement suspicious login heuristics (new device/IP subnet or login following failed attempts) emitting `SUSPICIOUS_LOGIN`.
- Build the **Security Dashboard** UI displaying connected devices, active sessions, suspicious login alerts, security posture checklist, and filterable monospace Security Audit Log.
- Update `PROJECT_AND_SECURITY_REPORT.md`.

#### Commit 39 — `test(security): add comprehensive automated security regression test suite`
- Create `apps/api/test/security/` verifying:
  1. Cross-user IDOR attempts across memories, attachments, vaults, and sessions.
  2. SQL injection payloads in params/queries.
  3. CSRF token enforcement.
  4. Security header assertions.
  5. Rate limiting (`429`) and lockout enforcement.
  6. Refresh-token reuse family revocation.
  7. Oversized uploads, malformed envelopes, and path-traversal attempts.
  8. Direct PostgreSQL zero-knowledge plaintext absence checks.
- Update `PROJECT_AND_SECURITY_REPORT.md`.

#### Commit 40 — `security(ci): add dependency vulnerability audit, secret scanning, and static analysis checks`
- Add automated `pnpm audit --audit-level=high`, secret scanning (e.g., Gitleaks/TruffleHog in CI), and security lint checks. Review every finding—never blindly suppress alerts.
- Update `PROJECT_AND_SECURITY_REPORT.md`.

*Phase 6 Acceptance:* Every security control has dedicated tests and verified report entries; zero unaddressed high/critical vulnerabilities.

---

### Phase 7 — Accessibility, Resilient Offline Mode & Differentiating Features

#### Commit 41 — `feat(ux): complete WCAG 2.2 AA accessibility pass, resilient error states, and account deletion`
- Audit and polish keyboard navigation, focus traps, contrast, mobile drawer layouts, `prefers-reduced-motion`, loading skeletons, empty states, and network retry flows.
- Implement deliberate **Account Deletion** flow (requiring recent re-authentication and explicit confirmation) removing user records and private storage blobs, with honest backup-retention disclosure.

#### Commit 42 — `feat(offline): implement encrypted-only IndexedDB cache and conflict-safe offline sync queue`
- Implement offline persistence in `apps/web` using `idb`: cache **only encrypted ciphertext envelopes + nonces** in IndexedDB (never plaintext).
- Queue offline creates/edits/deletes encrypted with the unlocked in-memory `DEK` and flush automatically on `online` with optimistic version/timestamp conflict handling and clear sync UI feedback.

#### Commit 43 — `feat(features): add client-side Mood Insights, Time Capsules, and private Anniversary Reminders`
- Build **Personal Insights** (Recharts with muted archival palette, 100% client-side computation, explicit non-diagnostic notice).
- Implement **Time Capsules**: server omits ciphertext in lists and returns `423 Locked` on `GET /api/v1/memories/:id` until `Date.now() >= unlockAt` (explicitly documented as a product feature rather than a cryptographic time-lock).
- Add **On This Day** private anniversary card computed strictly client-side; ensure optional reminder emails contain zero memory content.
- Update `PROJECT_AND_SECURITY_REPORT.md` with Phase 7 evidence.

---

### Phase 8 — Production Hardening, CI/CD & Final Release Documentation

#### Commit 44 — `build(docker): add hardened non-root Dockerfiles, reverse proxy TLS config, and production compose`
- Create multi-stage non-root `infra/docker/api.Dockerfile` and `infra/docker/web.Dockerfile` with minimal runtime images, read-only root filesystems where possible, and explicit `HEALTHCHECK` directives.
- Create `infra/proxy/memoir.conf` (Nginx or Caddy with TLS 1.3, strict CSP/HSTS/security headers, reverse proxy, hashed static asset caching).
- Create `docker-compose.prod.yml` isolating PostgreSQL and Redis on private internal networks with zero public DB/Redis port exposure.

#### Commit 45 — `ci(github): configure full GitHub Actions CI pipeline and Dependabot`
- Create `.github/workflows/ci.yml` executing on push and PR:
  1. Checkout + Node LTS + pnpm cache + `pnpm install --frozen-lockfile`.
  2. `pnpm format:check && pnpm lint && pnpm typecheck`.
  3. Unit, crypto, and frontend tests (`packages/crypto`, `apps/web`).
  4. Backend integration and security regression suites against ephemeral PostgreSQL + Redis service containers.
  5. Production build (`pnpm build`).
  6. Dependency audit (`pnpm audit --audit-level=high`) and secret scanning.
- Add `.github/dependabot.yml`.

#### Commit 46 — `docs(release): complete operational docs, portfolio README.md, and finalize PROJECT_AND_SECURITY_REPORT.md`
- Complete and verify accuracy of `docs/API.md`, `docs/TESTING.md`, and `docs/DEPLOYMENT.md` (covering topology, env inventory, secret generation via `openssl rand`, TLS, cookie domains, CORS, private object storage, encrypted DB backups, tested restore procedure, log retention, monitoring, secret rotation, and rollback).
- Polish `README.md` with honest architecture/Mermaid crypto diagrams, accurate feature matrix, copy-pasteable 4-command quick-start, real commands, and links to every doc—zero fake badges or unverified claims.
- Finalize `PROJECT_AND_SECURITY_REPORT.md` (Executive Summary, full testing/scanning tables, residual risks, commit history, and honest Final Engineering Assessment).

---

## 11. Testing Strategy & Verification Commands

Use synthetic test fixtures exclusively—never include real personal diary entries in tests.

### 11.1 Required Test Layers
1. **Unit Tests (Vitest / Jest):** `packages/crypto` (all 13 cryptographic invariants), validation schemas, date/calendar utilities, autosave state machine, API services.
2. **Integration Tests (Jest + Supertest + PostgreSQL/Redis):** Migrations from empty DB, auth & cookie sessions, refresh reuse detection, ownership/IDOR isolation, memory CRUD, nonce reuse rejection, attachments/quotas, rate limits, CSRF.
3. **End-to-End Tests (Playwright):** Register & verify -> Login -> Setup Vault & confirm Recovery Key -> Save & reopen encrypted memory -> Lock & unlock vault -> Wrong passphrase failure -> Recovery Key rescue -> Upload & preview encrypted attachment -> Revoke session -> Export & restore backup -> Delete account.
4. **Security Regression Tests (`apps/api/test/security/`):** IDOR, XSS payload rendering, CSRF rejection, brute-force rate limits/lockout, malformed/tampered envelopes, oversized uploads, path traversal, Pino log redaction, and direct DB zero-knowledge assertions.

### 11.2 Authoritative Root Scripts
```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:security
pnpm test:e2e
pnpm build
pnpm audit --audit-level=high
```

---

## 12. CI/CD, Deployment & Release Checklist

- Never auto-deploy from unreviewed pull requests; document main-branch protection rules.
- **Production Deployment Invariants (`docs/DEPLOYMENT.md`):** HTTPS-only, `Secure`/`HttpOnly`/`SameSite` cookies, allowlisted CORS, private DB/Redis network access, private object storage, least-privilege DB credentials, encrypted-at-rest database backups with tested restore drills, zero default credentials, zero secrets baked into container images, zero verbose production errors, and no unverified "production-ready" marketing claims merely because Docker runs.
- **Release Checklist:** Update `CHANGELOG.md` -> verify clean migrations -> test backup & restore -> verify production env vars, TLS, headers, private storage, and log redaction -> confirm zero debug endpoints/test credentials -> tag semantic release (`v1.0.0`).

---

## 13. Consolidated Report Specification (`PROJECT_AND_SECURITY_REPORT.md`)

Maintain **one single cumulative English report** at the repository root: `PROJECT_AND_SECURITY_REPORT.md`.

### Mandatory Reporting Rules
- Never invent a scan result or claim a penetration test occurred when it did not.
- Always distinguish **"Implemented"** from **"Verified"**.
- Record exact commands executed, tool versions, dates, and real pass/fail outcomes (including any failed tests or unresolved findings).
- Never include secrets, private user data, or exploit payloads targeting live systems.
- Update the report in the same commit as each phase or security hardening change.

### Required 15-Section Template
```markdown
# Memoir — Unified Engineering & Security Implementation Report

## 1. Executive Summary
- Current engineering & security posture
- Implemented vs. verified controls summary
- Key limitations and honest scope boundaries
- Review date and application version

## 2. Scope, Toolchain & Verification Method
- Monorepo components reviewed (`apps/web`, `apps/api`, `packages/crypto`, `packages/shared`, `infra`)
- Exact detected runtime & tool versions
- Environments tested and test layers executed

## 3. Threat Model & Trust Boundaries
- Protected assets, trust boundaries, threat actors
- Explicit assumptions, metadata exposure inventory, out-of-scope threats

## 4. Phase-by-Phase Engineering & Commit Ledger
(For Phases 0 through 8: Objective, Implementation Summary, Security/Privacy Controls, Verification Commands & Results, Atomic Commit Ledger)

## 5. Cryptography & Key Management
- Algorithms, exact library versions, key hierarchy diagram
- Argon2id parameters & rationale, HKDF domain strings
- Nonce, 256-byte padding, AAD, and versioned envelope specification
- Recovery Key, zero-reencryption rotation, RAM-only lifecycle, and crypto test evidence

## 6. Authentication, Sessions, 2FA & Passkeys
- Server Argon2id password hashing, email verification, opaque cookie settings
- Session rotation & reuse detection, CSRF, tiered Redis rate limits & lockout
- TOTP 2FA (encrypted secrets + hashed backup codes) & WebAuthn Passkeys boundary

## 7. API, Database & Attachment Security
- Allowlisted DTO validation, ownership/IDOR enforcement, parameterized queries
- EXIF stripping, per-file encryption, upload quotas, safe binary download headers, private storage

## 8. Browser, Frontend & Logging Privacy
- Production-tested CSP & security headers, Markdown `rehype-sanitize` XSS boundary
- Zero third-party scripts/fonts policy, Pino redaction rules & automated log verification

## 9. Automated Testing Matrix
| Test Suite / Layer | Command | Result | Date | Notes |
|---|---|---|---|---|

## 10. Dependency, Secret & Static Analysis
| Tool | Version | Command | Result | Findings / Action |
|---|---|---|---|---|

## 11. Findings & Remediation Log
| ID | Severity | Finding | Fix / Mitigation | Status |
|---|---|---|---|---|

## 12. Residual Risks & Honest Limitations
- Compromised client device / keylogger / OS malware
- Malicious or compromised server serving tampered JavaScript in browser
- Malicious browser extensions
- JavaScript best-effort memory clearing limitations
- Operational metadata leakage (`entryDate`, record counts, access timing)
- Denial of service, permanent loss of both Vault Passphrase and Recovery Key
- Time Capsule server-clock trust (product feature, not cryptographic time-lock)

## 13. Security Commit History
| Commit Hash | Conventional Commit Message | Security Control | Verification Status |
|---|---|---|---|

## 14. Operational & Deployment Readiness
- Container hardening, reverse proxy TLS/headers, DB backup/restore verification, secret rotation

## 15. Final Engineering Assessment
- What is verified vs. what is not verified
- What requires independent external cryptographic & penetration review
- Honest production deployment recommendation
```

---

## 14. Definition of Done, First Session Protocol & Final Principles

### 14.1 Per-Feature Definition of Done
- [ ] Acceptance criteria met with strict TypeScript types (no unjustified `any`).
- [ ] Unit, integration, security, and/or E2E tests added and passing with real inspected output.
- [ ] Accessible (WCAG 2.2 AA), responsive, and handles loading, empty, offline, and error states cleanly.
- [ ] Verified that zero plaintext diary content or secrets are persisted unencrypted or logged.
- [ ] Relevant docs and `PROJECT_AND_SECURITY_REPORT.md` updated in the same commit.
- [ ] `git diff` reviewed; Conventional Commit created; `git status` clean.

### 14.2 Full-Project Pre-Completion Audit
- [ ] `git log --oneline` shows ~46 clean, atomic Conventional Commits in phase order (zero `wip`/`fixup` clutter).
- [ ] Fresh developer setup succeeds from `README.md`; Prisma migrations apply cleanly to an empty database; GitHub Actions CI passes from a clean checkout.
- [ ] `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:security && pnpm build` all exit with code `0`.
- [ ] Direct inspection of PostgreSQL `memories` and `attachments` confirms zero plaintext titles, bodies, tags, moods, filenames, or file bytes.
- [ ] Recovery Key unlock, zero-reencryption passphrase rotation, and encrypted backup export/restore are verified end-to-end.
- [ ] UI verified in both Warm Alabaster (Light) and Obsidian Ink (Dark) themes using self-hosted editorial fonts with zero AI-slop clichés.
- [ ] `PROJECT_AND_SECURITY_REPORT.md` contains honest, command-verified evidence across all 15 sections and Phases 0–8.
- [ ] Repository owner has reviewed `docs/THREAT_MODEL.md`, vault recovery behavior, and `LICENSE` selection.

### 14.3 First Agent Session — Exact Starting Instructions
Execute **only** these steps in Session 1. Do not implement auth, encryption, or diary features yet:
1. Inspect the working directory and Git status (`pwd`, `git status --short --branch`).
2. Detect the operating system and installed versions of `git`, `node`, `pnpm`, `docker`, and `docker compose`.
3. If any prerequisite tool is missing, state the official OS installation steps and install only if permitted.
4. Confirm repository directory `memoir` without overwriting any existing non-empty work; ask the owner for their preferred `LICENSE`.
5. Execute **Commits 01–04 (Phase 0)** strictly in order.
6. Run available formatting, lint, typecheck, and clean-install checks.
7. Review `git status` and `git diff` after each commit.
8. Report commit hashes, files created, exact checks executed, actual versions recorded, and any blockers.
9. **Stop and wait for owner review before starting Phase 1.**

### 14.4 Ten Final Engineering Principles
1. **Privacy by design:** Private content is encrypted before leaving the browser.
2. **Security over convenience:** Never weaken key separation or recovery honesty for artificial convenience.
3. **Honest guarantees:** Clearly document metadata exposure and browser E2EE trust boundaries.
4. **Simplicity over sprawl:** Build a disciplined modular monolith, not unnecessary distributed complexity.
5. **Writing-first craft:** The distraction-free editor is the heart of Memoir.
6. **Human visual restraint:** Warm archival typography, generous whitespace, zero neon AI clichés.
7. **Accessible by default:** Keyboard and screen-reader usability are required for completion.
8. **Verify every boundary:** Test authentication, ownership, encryption, recovery, uploads, and log redaction.
9. **Reviewable Git history:** One coherent milestone or security control per atomic commit.
10. **Documentation as code:** Architecture, threat model, cryptography spec, setup, and the unified report stay synchronized with every change.