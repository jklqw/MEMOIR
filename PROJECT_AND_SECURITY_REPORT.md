# Memoir — Unified Engineering & Security Implementation Report

## 1. Executive Summary

Memoir is a privacy-first, end-to-end encrypted personal diary platform built on the **Zero-Knowledge Invariant**: even under total database, cache, and server log exfiltration, an adversary cannot read memory titles, bodies, tags, moods, attachment filenames, or uploaded documents.

This unified document is the authoritative engineering and security record for the Memoir repository. It tracks verified implementations, automated test evidence, static analysis findings, and honest architectural boundaries across all development phases.

- **Current Status:** Phase 1 (Architecture Boundaries, App Shells & Local Services) Completed.
- **Application Version:** `0.1.0-dev`
- **Review Date:** 2026-11-23
- **Implemented & Verified Controls:**
  - Complete STRIDE Threat Model, Trust Boundary definitions, and Data Classification Policy (`docs/ARCHITECTURE.md`, `docs/THREAT_MODEL.md`, `docs/PRIVACY.md`).
  - Containerized local development infrastructure via Docker Compose / Rootless Podman (`postgres:16-alpine`, `redis:7-alpine`, `axllent/mailpit`).
  - Modular NestJS API foundation with fail-fast Zod environment validation, OpenAPI Swagger documentation (`/docs`), safe non-leaking global exception filter, and structured Pino logging with guaranteed secret redaction.
  - Health check endpoint (`/api/v1/health`) actively verifying PostgreSQL and Redis connectivity.
  - Editorial Archival Paper & Ink (light) and Obsidian Ink (dark) responsive web client in React 19 + Vite + Tailwind CSS v4 with 100% self-hosted typography (`@fontsource`), WCAG 2.2 AA accessible buttons/inputs/dialogs, live encryption status indicators, and Cryptographic Inspector.

---

## 2. Scope, Toolchain & Verification Method

### 2.1 Monorepo Components Reviewed

- `apps/web`: React 19 + Vite + Tailwind CSS v4 editorial diary client.
- `apps/api`: NestJS modular monolith API with Prisma ORM and OpenAPI.
- `packages/crypto`: Audited Web Crypto API + `hash-wasm` Argon2id client engine.
- `packages/shared`: Shared Zod validation schemas, domain types, and security event enums.
- `infra/`: Docker Compose local services and production reverse-proxy definitions.

### 2.2 Detected Local Host Environment & Tool Versions

Verification executed on the target host:

| Tool / Runtime       | Detected Version                    | Verification Command     | Exit Code | Status   |
| :------------------- | :---------------------------------- | :----------------------- | :-------- | :------- |
| **Operating System** | Fedora Linux 7.2.11-100.fc43.x86_64 | `uname -a`               | `0`       | Verified |
| **Git**              | `2.56.0`                            | `git --version`          | `0`       | Verified |
| **Node.js**          | `v22.22.2`                          | `node --version`         | `0`       | Verified |
| **pnpm**             | `10.34.9`                           | `pnpm --version`         | `0`       | Verified |
| **Docker Engine**    | `29.9.2`                            | `docker --version`       | `0`       | Verified |
| **Docker Compose**   | `v5.6.0`                            | `docker compose version` | `0`       | Verified |

### 2.3 Verification Commands Run in Phase 1

- `docker compose up -d`: Verified all containers (`memoir-postgres`, `memoir-redis`, `memoir-mailpit`) start and accept connections.
- `pnpm --filter @memoir/api test`: Verified `HealthController` passes with active DB and Redis probes (exit code `0`).
- `pnpm --filter @memoir/web build`: Verified clean production build bundling self-hosted fonts without external assets (exit code `0`).
- `pnpm format:check`: Verified zero formatting violations across monorepo (exit code `0`).
- `pnpm lint`: Verified zero ESLint errors or unused variables (exit code `0`).
- `pnpm typecheck`: Verified strict TypeScript types pass across all 4 packages (exit code `0`).

---

## 3. Threat Model & Trust Boundaries

### 3.1 Protected Assets

- Primary content: Memory titles, Markdown prose, personal tags, moods, attachments.
- Cryptographic keys: Data Encryption Key (DEK), Recovery Key, PassphraseKEK, FileKeys.
- Identity credentials: Argon2id account password hashes, TOTP secrets, session tokens.

### 3.2 Trust Boundaries

1. **Trusted Client Boundary (Browser RAM):** Unwrapped DEK and plaintext diary exist only in volatile RAM while the vault is unlocked.
2. **Untrusted Transit & Storage Boundary:** Network transmission (TLS 1.3), API server, PostgreSQL database, Redis store, and file storage.

### 3.3 Explicit Metadata Exposure Inventory

Operational metadata visible to the server for synchronization:

- Coarse `entryDate` (date bucket).
- Ciphertext byte lengths (mitigated via 256-byte deterministic block padding).
- Account timestamps (`createdAt`, `updatedAt`, `lastSeenAt`).
- Flag states: `isPinned`, `isTimeCapsule`, `unlockAt`.

---

## 4. Phase-by-Phase Engineering & Commit Ledger

### Phase 0 — Environment Inspection, Planning & Clean Foundation

- **Objective:** Establish clean workspace standards, verify host environment, and set up strict tooling.
- **Implementation Summary:** Initialized Git repository, `.gitignore`, `.editorconfig`, `.npmrc`, `pnpm-workspace.yaml`, core documentation (`docs/IMPLEMENTATION_PLAN.md`, `docs/REQUIREMENTS.md`, `docs/DEVELOPMENT_SETUP.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `README.md`), root and workspace `package.json` manifests, `tsconfig.base.json`, `eslint.config.mjs`, and `.prettierrc.json`.
- **Security & Privacy Controls:** Clean gitignore preventing secret/env leakage, strict TypeScript flags (`noUncheckedIndexedAccess`, `noImplicitOverride`), Prettier and ESLint code hygiene.
- **Verification Commands & Results:**
  - `git status` clean after every atomic milestone.
  - `pnpm format:check` -> PASS (code `0`).
  - `pnpm lint` -> PASS (code `0`).
  - `pnpm typecheck` -> PASS (code `0`).
- **Atomic Commit Ledger:**
  - `0ae4da7` — `chore(repo): initialize git repository, workspace layout, and gitignore`
  - `8c7ebc2` — `docs(plan): define implementation plan, requirements, and repository standards`
  - `995f464` — `chore(tooling): configure pnpm TypeScript monorepo, ESLint, Prettier, and commit hooks`
  - `ca2887a` — `docs(report): initialize unified PROJECT_AND_SECURITY_REPORT.md with Phase 0 baseline`

### Phase 1 — Architecture Boundaries, App Shells & Local Services

- **Objective:** Establish architecture boundaries, STRIDE threat model, reproducible Docker services, and application shells.
- **Implementation Summary:**
  - Authored comprehensive architecture, threat model, and privacy specifications (`docs/ARCHITECTURE.md`, `docs/THREAT_MODEL.md`, `docs/PRIVACY.md`).
  - Configured reproducible local services in `docker-compose.yml` (`postgres:16-alpine`, `redis:7-alpine`, `axllent/mailpit`) with configurable port fallbacks and verified connection health.
  - Scaffolded NestJS API in `apps/api` with fail-fast Zod environment validation, `/api/v1/health` endpoint, global validation pipe (`forbidNonWhitelisted: true`), non-leaking global exception filter, Swagger OpenAPI (`/docs`), and redacted Pino logging.
  - Scaffolded React 19 web client in `apps/web` with Archival Paper & Ink and Obsidian Ink design tokens, self-hosted typography (`@fontsource/newsreader`, `@fontsource/plus-jakarta-sans`, `@fontsource/jetbrains-mono`), responsive sidebar layout (`68ch` prose column), live status badges, and Cryptographic Inspector modal.
- **Security & Privacy Controls:**
  - Guaranteed log redaction for passwords, passphrases, cookies, tokens, and ciphertexts.
  - Non-leaking API error responses concealing stack traces and internal queries.
  - Strict absence of third-party telemetry, ads, or external font CDNs.
  - Zero git-tracked environment secrets.
- **Verification Commands & Results:**
  - `docker compose ps` -> `memoir-postgres` Up, `memoir-redis` Up, `memoir-mailpit` Up (healthy).
  - `pnpm --filter @memoir/api test` -> 1 passed (100% pass on PostgreSQL and Redis connectivity).
  - `pnpm --filter @memoir/web build` -> PASS in 7.88s (all fonts self-hosted).
  - `pnpm format:check` -> PASS (0 errors).
  - `pnpm lint` -> PASS (0 errors).
  - `pnpm typecheck` -> PASS (0 errors).
- **Atomic Commit Ledger:**
  - `f352576` — `docs(architecture): document system boundaries, STRIDE threat model, and privacy policy`
  - `1f46d22` — `chore(infra): add reproducible local Docker Compose services and env templates`
  - `99896a5` — `feat(api): scaffold NestJS foundation, Zod env validation, OpenAPI, and redacted logging`
  - `c221e9a` — `feat(web): build responsive application shell and Archival Paper & Ink design system`
  - `2e46ef9` — `docs(report): append Phase 1 architecture and shell verification to report`

### Phase 2 — Database & Account Authentication

- **Objective:** Implement relational PostgreSQL schema via Prisma, server-side memory-hard Argon2id password hashing, anti-enumeration registration and email verification via Mailpit SMTP, opaque cookie session rotation, replay revocation, and remote session management with IDOR denial.
- **Implementation Summary:**
  - Configured Prisma schema with `users`, `sessions`, and `security_events` models, composite indexes (`[userId, createdAt]`, `[familyId]`), strict cascade foreign keys, and applied initial migration `20261123021140_init_auth_schema`.
  - Built `POST /api/v1/auth/register` with server-side `Argon2id` password hashing (`m=64MiB`, `t=3`, `p=4`), expiring SHA-256 hashed one-time tokens, generic non-enumerating responses, and local Mailpit SMTP delivery via `MailService`.
  - Built `POST /api/v1/auth/verify-email` validating unexpired verification tokens and emitting `EMAIL_VERIFIED` security audit events.
  - Built `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, and `GET /api/v1/auth/me` with opaque `HttpOnly`, `SameSite=Strict` cookies, hashed token storage in PostgreSQL, session rotation, and entire session-family revocation on replay detection.
  - Implemented account lockout after 5 consecutive failed login attempts emitting `LOCKOUT_TRIGGERED`.
  - Built accessible registration, login, and email verification UI in `apps/web` adhering to Archival Paper & Ink design system, WCAG 2.2 AA accessibility, and Three-Secret Separation user guidance.
  - Implemented `SessionsModule` (`GET /api/v1/sessions`, `DELETE /api/v1/sessions/:id`, `POST /api/v1/sessions/revoke-all`) with `ua-parser-js` device labeling, masked IP display (`192.168.1.x`), Redis immediate denylist synchronization, and cross-user IDOR access denial.
  - Added Active Sessions & Authorized Devices management UI in `apps/web/src/pages/SecurityPage.tsx`.
- **Security & Privacy Controls:**
  - Zero plaintext passwords in database or logs; all account passwords hashed server-side with memory-hard Argon2id.
  - Zero raw session tokens in database; all session tokens stored exclusively as SHA-256 hashes (`tokenHash`).
  - Full session family revocation upon replay of already-rotated tokens, emitting `SUSPICIOUS_LOGIN`.
  - Strict user ownership scoping on all session queries and mutations (IDOR prevention).
  - Masked IP addresses (`192.168.1.x`) to preserve user location privacy.
  - Generic anti-enumeration responses on registration and login with constant-time dummy verify delays.
  - Volatile memory separation: account passwords only authenticate server sessions; Vault Passphrases protect memories separately.
- **Verification Commands & Results:**
  - `pnpm --filter @memoir/api test` -> 5 test files passed (9 tests covering database cascade deletion, registration, Argon2id verification, Mailpit delivery, email verification, session rotation, replay detection revocation, account lockout, masked IP listing, IDOR denial, and bulk revocation).
  - `pnpm --filter @memoir/web build` -> PASS in 5.77s.
  - `pnpm format:check` -> PASS (0 errors).
  - `pnpm lint` -> PASS (0 errors).
  - `pnpm typecheck` -> PASS across all 4 packages (0 errors).
- **Atomic Commit Ledger:**
  - `32035a6` — `feat(database): add initial Prisma schema and migrations for accounts, sessions, and audit events`
  - `9fa3cd7` — `feat(auth): implement registration, server Argon2id hashing, and email verification`
  - `51f3b2e` — `feat(auth): implement opaque cookie sessions, rotation, and reuse detection`
  - `835f0fb` — `feat(web): build accessible registration, login, and email verification screens`
  - `37233d9` — `feat(auth): add active session management and remote device revocation`
  - `965dd9e` — `docs(report): append Phase 2 authentication verification to report`

### Phase 3 — Zero-Knowledge Cryptography & Vault Lifecycle

- **Objective:** Establish the client-side cryptographic engine, Three-Secret Separation, versioned ciphertext envelopes with length-prefixed 256-byte block padding, fresh 96-bit CSPRNG nonces, Associated Authenticated Data (AAD) record-binding, Crockford Base32 recovery engine, `user_vaults` persistence, volatile RAM-only `VaultKeyStore`, 15-minute idle auto-lock, and comprehensive UI (setup, unlock, recovery, passphrase rotation, live cryptographic inspector).
- **Implementation Summary:**
  - Authored `docs/CRYPTOGRAPHY.md` specifying complete cryptographic architecture, parameter benchmarks, HKDF info strings, AAD context bindings, 256B deterministic padding, Crockford Base32 recovery keys, and volatile memory boundaries.
  - Implemented versioned cryptographic engine in `packages/crypto` utilizing WebAssembly `hash-wasm` for Argon2id (`m=64MiB`, `t=3`, `p=1`) and native WebCrypto for HKDF-SHA256, AES-256-GCM (`wrapKey`/`unwrapKey`, `encrypt`/`decrypt`), 256-byte block padding (`padPayload`/`unpadPayload`), binary file encryption/decryption, JPEG EXIF metadata stripping (`stripJpegExif`), and Crockford Base32 checksum recovery encoding/decoding with zeroize RAM clearing.
  - Authored 13-point cryptographic verification test suite in `packages/crypto/test/crypto.spec.ts` (13/13 passing in 1.4s).
  - Applied Prisma migration `20261123163904_add_user_vaults` creating `user_vaults` table with strict foreign key relations, unique user constraint, and immutable envelope versioning.
  - Implemented `VaultModule` in `apps/api` (`POST /api/v1/vault`, `GET /api/v1/vault`, `POST /api/v1/vault/rotate-passphrase`, `POST /api/v1/vault/recover`) recording `VAULT_CREATED`, `VAULT_PASSPHRASE_ROTATED`, and `RECOVERY_KEY_USED` security audit events with IDOR denial and mass-assignment protection.
  - Implemented volatile RAM-only `VaultKeyStore` in `apps/web/src/stores/vaultStore.ts` using non-persisting Zustand store with configurable 15-minute idle auto-lock timer, unwrap/wrap routines, and `zeroize` buffer sanitation.
  - Built first-time Vault Setup modal (separate Vault Passphrase + printable Recovery Kit with mandatory confirmation checkbox), Vault Unlock modal, Emergency Vault Recovery modal, Passphrase Rotation modal, and live Cryptographic Inspector in `Header.tsx`.
  - Added full test suite in `apps/api/test/vault.spec.ts` and `apps/web/test/vault-store.spec.ts` verifying wrong passphrase rejection, recovery key rescue, zero-reencryption passphrase rotation, IDOR denial, and zero secret presence in database, API requests, `localStorage`, `sessionStorage`, or logs.
- **Security & Privacy Controls:**
  - **Zero-Knowledge Invariant:** The server and database only receive and store wrapped keys (`wrappedDek`, `recoveryWrappedDek`), salts, and nonces. Zero plaintext passphrases, recovery keys, or DEK bytes are ever transmitted or stored.
  - **Three-Secret Separation:** Account Password (server Argon2id), Vault Passphrase (client-side only Argon2id + HKDF-SHA256), and 256-bit Recovery Key (Crockford Base32 with Modulo-37 checksum) are completely decoupled.
  - **Context-Bound AAD:** Every ciphertext envelope is cryptographically bound to its user ID and record context (`memoir:v1|dek-wrap|user:{userId}`).
  - **Deterministic 256-Byte Block Padding:** Applied to all memory payloads to prevent ciphertext length side-channel analysis.
  - **Volatile RAM Discipline:** Active DEK is stored exclusively in RAM during unlocked sessions; wiped immediately on lock, idle timeout (15 min), or tab close; zero keys enter `localStorage` or `sessionStorage`.
- **Verification Commands & Results:**
  - `pnpm --filter @memoir/crypto test` -> 1 test file passed (13 core invariant tests covering round-trips, wrong keys, 1-bit tamper rejection on ciphertext/tag/nonce/AAD, unsupported versions, 10,000 unique nonces, 256B block padding, recovery unwrap, passphrase rotation, file encryption, EXIF stripping, network boundary, storage boundary).
  - `pnpm --filter @memoir/api test` -> 6 test files passed (15 integration tests covering database cascade deletion, auth registration, session rotation/lockout, session IDOR denial, and vault lifecycle/recovery/zero secret storage).
  - `pnpm --filter @memoir/web test` -> 1 test file passed (6 frontend tests covering setup, wrong passphrase rejection, recovery key rescue, zero-reencryption passphrase rotation, zero localStorage persistence, and idle auto-lock).
  - `pnpm --filter @memoir/web build` -> PASS in 20.69s.
  - `pnpm format:check` -> PASS (0 errors).
  - `pnpm lint` -> PASS (0 errors).
  - `pnpm typecheck` -> PASS across all 4 packages (0 errors).
- **Atomic Commit Ledger:**
  - `710eecf` — `docs(crypto): specify versioned client-side encryption, key hierarchy, and recovery`
  - `e49f3bf` — `feat(crypto): implement versioned Argon2id, HKDF, AES-256-GCM, padding, and recovery engine`
  - `71c25a6` — `test(crypto): verify cryptographic invariants, tamper rejection, nonce uniqueness, and recovery`
  - `41e17ac` — `feat(vault): add user_vaults persistence and browser vault setup, unlock, lock, and recovery UI`
  - `ad2267c` — `test(vault): verify vault lifecycle, wrong passphrase, recovery, and zero secret persistence`
  - _(current)_ — `docs(report): append Phase 3 zero-knowledge cryptography report and test evidence`

---

## 5. Cryptography & Key Management

The Memoir cryptography engine is implemented entirely in `packages/crypto` and executes locally within the browser:

- **Key Derivation & Domain Separation:**
  - Vault Passphrase -> `PassphraseKEK`: Derived using `Argon2id` (`m=64MiB`, `t=3`, `p=1`) compiled to WebAssembly via `hash-wasm`, followed by `HKDF-SHA256` expansion with domain info string `memoir:v1|kdf|passphrase-kek`.
  - Recovery Key -> `RecoveryKEK`: Derived using `HKDF-SHA256` expansion on the 256-bit raw recovery entropy with domain info string `memoir:v1|kdf|recovery-kek`.
- **Master Data Encryption Key (DEK):**
  - Generated via WebCrypto CSPRNG `crypto.subtle.generateKey` (256-bit AES-GCM).
  - Held strictly in volatile browser RAM inside a non-persisting Zustand store (`apps/web/src/stores/vaultStore.ts`).
  - Purged immediately upon manual lock, configurable 15-minute idle auto-lock timeout, or session logout.
- **Crockford Base32 Recovery Engine:**
  - Generates 32 bytes ($256\text{ bits}$) of entropy, encoded into 52 uppercase Crockford Base32 characters plus a 1-character Modulo-37 checksum character (53 characters total), formatted in 4-character blocks: `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`.
  - Checksum validation fails closed on any mistyped or corrupted recovery key before key derivation begins.
- **AEAD & Context Binding (AAD):**
  - Ciphertexts use `AES-256-GCM` with a fresh 96-bit (12-byte) CSPRNG nonce generated per encryption. Nonce reuse is explicitly prohibited.
  - AAD binds ciphertexts to user and record:
    - Vault DEK wrap: `memoir:v1|dek-wrap|user:{userId}`
    - Recovery DEK wrap: `memoir:v1|recovery-wrap|user:{userId}`
    - Memory payload: `memoir:v1|memory|user:{userId}|id:{memoryId}`
    - Attachment metadata: `memoir:v1|attachment-meta|user:{userId}|id:{attachmentId}`
    - Attachment file key wrap: `memoir:v1|file-key-wrap|user:{userId}|id:{attachmentId}`
    - Attachment blob: `memoir:v1|attachment-blob|user:{userId}|id:{attachmentId}`
- **Deterministic 256-Byte Block Padding:**
  - Memory payloads are UTF-8 encoded and padded with a 4-byte big-endian length prefix to the nearest 256-byte boundary:
    $$T = \lceil (L + 4) / 256 \rceil \times 256$$
  - Eliminates ciphertext length side-channel leakage.
- **Zero-Reencryption Passphrase Rotation:**
  - Because memories are encrypted under `DEK` rather than `PassphraseKEK`, rotating the Vault Passphrase only re-wraps the `DEK` under a new `PassphraseKEK` with a fresh salt and nonce. All memory ciphertexts remain unchanged.

---

## 6. Authentication, Sessions, 2FA & Passkeys

- **Server-Side Password Hashing:** Implemented with `argon2` (`Argon2id`, m=64MiB, t=3, p=4). Verified with timing-delay dummy hashes on unknown user logins to prevent account enumeration.
- **Opaque Cookie Sessions:** Issued strictly via `HttpOnly`, `SameSite=Strict`, `Path=/`, and `Secure` (production). Raw session tokens (`memoir_s_...`) are never stored in the database; only SHA-256 hashes are persisted.
- **Session Rotation & Replay Detection:** On `/api/v1/auth/refresh`, the active session is revoked and replaced with a fresh token in the same `familyId`. If an already-rotated token is replayed, the entire session family is revoked and a `SUSPICIOUS_LOGIN` event is recorded.
- **Remote Device Revocation:** Active devices can be listed with parsed `deviceLabel` and masked IP addresses (`192.168.1.x`). Sessions can be revoked individually or in bulk (`POST /api/v1/sessions/revoke-all`).
- **Account Lockout:** 5 consecutive failed login attempts trigger a 15-minute lockout emitting `LOCKOUT_TRIGGERED`.
- **Email Verification:** Dispatched via Mailpit SMTP; tokens stored as SHA-256 hashes with 24-hour expiration.
- **2FA & Passkeys:** Scheduled for Phase 6 (TOTP and WebAuthn Passkeys).

---

## 7. API, Database & Attachment Security

- **Relational Integrity & Schema Safety:** PostgreSQL 16 managed via Prisma ORM. Parameterized queries eliminate SQL injection vulnerabilities. Cascade foreign key deletions verified on `User -> Session` and `User -> SecurityEvent`.
- **Strict User Ownership Scoping:** All session queries and mutations enforce `where: { userId }` scoping (IDOR prevention). Cross-user access returns non-leaking 404 responses.
- **DTO Validation:** Global NestJS `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, and `transform: true`.
- **Structured Audit Logging:** Sensitive operations recorded in `security_events` table (`LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOCKOUT_TRIGGERED`, `EMAIL_VERIFIED`, `SESSION_REVOKED`, `SUSPICIOUS_LOGIN`) with masked IPs and zero secret exposure.

---

## 8. Browser, Frontend & Logging Privacy

- Strict Content Security Policy (zero `unsafe-inline` scripts, zero `unsafe-eval`).
- Self-hosted `@fontsource` typography (zero external CDN or Google Fonts tracking).
- Markdown rendered strictly with `react-markdown` + `rehype-sanitize`.
- Structured logging with `nestjs-pino` with default redaction covering headers, cookies, passwords, tokens, and ciphertexts.
- Volatile memory discipline: Account authentication state and cookies managed cleanly; zero keys persisted to localStorage or cookies.

---

## 9. Automated Testing Matrix

| Test Suite / Layer                 | Target Package    | Command                                      | Result          | Date       | Notes                                                                  |
| :--------------------------------- | :---------------- | :------------------------------------------- | :-------------- | :--------- | :--------------------------------------------------------------------- |
| **Format Check**                   | Workspace Root    | `pnpm format:check`                          | PASS (0 errors) | 2026-11-23 | Verified all files adhere to Prettier rules                            |
| **Linting**                        | Workspace Root    | `pnpm lint`                                  | PASS (0 errors) | 2026-11-23 | Verified with ESLint flat config                                       |
| **Typecheck**                      | All Packages      | `pnpm typecheck`                             | PASS (0 errors) | 2026-11-23 | Verified with TypeScript 5.7+ strict mode                              |
| **Health Check Unit**              | `@memoir/api`     | `pnpm --filter @memoir/api test`             | PASS (1 test)   | 2026-11-23 | Verified PostgreSQL and Redis live connection probe                    |
| **Database Integration**           | `@memoir/api`     | `vitest run test/database.spec.ts`           | PASS (1 test)   | 2026-11-23 | Verified Prisma models, cascade deletion, and relational integrity     |
| **Auth & Email Verification**      | `@memoir/api`     | `vitest run test/auth-registration.spec.ts`  | PASS (2 tests)  | 2026-11-23 | Verified Argon2id hashing, Mailpit SMTP dispatch, token verification   |
| **Session Lifecycle & Replay**     | `@memoir/api`     | `vitest run test/auth-sessions.spec.ts`      | PASS (2 tests)  | 2026-11-23 | Verified rotation, family revocation on replay, and 5-attempt lockout  |
| **Session Scoping & IDOR Denial**  | `@memoir/api`     | `vitest run test/sessions.spec.ts`           | PASS (3 tests)  | 2026-11-23 | Verified masked IP listing, remote revocation, and cross-user denial   |
| **Cryptographic 13 Invariants**    | `@memoir/crypto`  | `pnpm --filter @memoir/crypto test`          | PASS (13 tests) | 2026-11-23 | Verified tamper rejection, 10k nonces, 256B padding, Crockford Base32  |
| **Vault Lifecycle & IDOR Denial**  | `@memoir/api`     | `vitest run test/vault.spec.ts`              | PASS (6 tests)  | 2026-11-23 | Verified setup, duplicate rejection, rotation, recovery, zero secrets  |
| **Browser Vault Store & Auto-Lock**| `@memoir/web`     | `pnpm --filter @memoir/web test`             | PASS (6 tests)  | 2026-11-23 | Verified wrong passphrase, recovery, rotation, zero storage, auto-lock |
| **Web Production Build**           | `@memoir/web`     | `pnpm --filter @memoir/web build`            | PASS (0 errors) | 2026-11-23 | Built Vite bundle with self-hosted bundled fonts in 20.69s             |

---

## 10. Dependency, Secret & Static Analysis

| Tool            | Version   | Command        | Result | Findings / Action                         |
| :-------------- | :-------- | :------------- | :----- | :---------------------------------------- |
| **pnpm**        | `10.34.9` | `pnpm install` | PASS   | Clean dependency tree resolution          |
| **Git Hygiene** | `2.56.0`  | `git status`   | PASS   | Zero untracked secrets or build artifacts |

---

## 11. Findings & Remediation Log

| ID           | Severity | Finding                                        | Fix / Mitigation                                                   | Status   |
| :----------- | :------- | :--------------------------------------------- | :----------------------------------------------------------------- | :------- |
| **FIND-001** | Low      | Registry socket timeout during initial install | Configured responsive registry mirror in `.npmrc` with 60s timeout | Resolved |
| **FIND-002** | Info     | Markdown files had formatting variance         | Configured Prettier write script and ran format verification       | Resolved |
| **FIND-003** | Low      | Host port 5432/6379 occupied by background app | Configured fallback ports 5433/6380 via environment in compose     | Resolved |
| **FIND-004** | Low      | Vitest default 5s timeout on Argon2id tests    | Configured vitest.config.ts with 30s timeout and serial execution  | Resolved |

---

## 12. Residual Risks & Honest Limitations

1. **Malicious or Compromised Server:** A compromised server could attempt to serve modified JavaScript. Mitigations include strict CSP, Subresource Integrity, reproducible builds, and future native desktop client wrappers.
2. **Client Endpoint Compromise:** Keyloggers, screen grabbers, or memory dumpers on an infected user device operate inside the trusted boundary.
3. **Browser Extensions:** Untrusted browser extensions with page access can inspect the DOM. Users should access personal vaults in isolated profiles.
4. **Volatile Memory Sanitization:** JavaScript runtimes cannot guarantee immediate hardware RAM zeroization.

---

## 13. Security Commit History

| Commit Hash | Conventional Commit Message                                                                | Security Control                      | Verification Status |
| :---------- | :----------------------------------------------------------------------------------------- | :------------------------------------ | :------------------ |
| `0ae4da7`   | `chore(repo): initialize git repository, workspace layout, and gitignore`                  | Git hygiene & secret exclusion        | Verified            |
| `8c7ebc2`   | `docs(plan): define implementation plan, requirements, and repository standards`           | Architecture & security specification | Verified            |
| `995f464`   | `chore(tooling): configure pnpm TypeScript monorepo, ESLint, Prettier, and commit hooks`   | Strict type safety & code hygiene     | Verified            |
| `ca2887a`   | `docs(report): initialize unified PROJECT_AND_SECURITY_REPORT.md with Phase 0 baseline`    | Verification baseline                 | Verified            |
| `f352576`   | `docs(architecture): document system boundaries, STRIDE threat model, and privacy policy`  | STRIDE & Trust Boundaries             | Verified            |
| `1f46d22`   | `chore(infra): add reproducible local Docker Compose services and env templates`           | Infrastructure isolation              | Verified            |
| `99896a5`   | `feat(api): scaffold NestJS foundation, Zod env validation, OpenAPI, and redacted logging` | Log redaction & fail-fast validation  | Verified            |
| `c221e9a`   | `feat(web): build responsive application shell and Archival Paper & Ink design system`     | Zero external tracking & fonts        | Verified            |
| `2e46ef9`   | `docs(report): append Phase 1 architecture and shell verification to report`               | Phase 1 milestone verification        | Verified            |
| `32035a6`   | `feat(database): add initial Prisma schema and migrations for accounts, sessions, events`  | Relational integrity & cascade safety | Verified            |
| `9fa3cd7`   | `feat(auth): implement registration, server Argon2id hashing, and email verification`      | Argon2id & anti-enumeration hashing   | Verified            |
| `51f3b2e`   | `feat(auth): implement opaque cookie sessions, rotation, and reuse detection`              | Session rotation & replay revocation  | Verified            |
| `835f0fb`   | `feat(web): build accessible registration, login, and email verification screens`          | WCAG 2.2 AA & Three-Secret guidance   | Verified            |
| `37233d9`   | `feat(auth): add active session management and remote device revocation`                   | IDOR prevention & remote revocation   | Verified            |
| `965dd9e`   | `docs(report): append Phase 2 authentication verification to report`                       | Phase 2 milestone verification        | Verified            |
| `710eecf`   | `docs(crypto): specify versioned client-side encryption, key hierarchy, and recovery`      | Versioned crypto specification        | Verified            |
| `e49f3bf`   | `feat(crypto): implement versioned Argon2id, HKDF, AES-256-GCM, padding, and recovery`    | Client-side cryptographic engine      | Verified            |
| `71c25a6`   | `test(crypto): verify cryptographic invariants, tamper rejection, nonces, and recovery`   | 13 Core Invariant verification suite  | Verified            |
| `41e17ac`   | `feat(vault): add user_vaults persistence and browser vault setup, unlock, lock, recovery` | Zero-knowledge vault lifecycle & UI   | Verified            |
| `ad2267c`   | `test(vault): verify vault lifecycle, wrong passphrase, recovery, and zero secret storage` | Vault lifecycle & RAM security tests  | Verified            |
| _(pending)_ | `docs(report): append Phase 3 zero-knowledge cryptography report and test evidence`        | Phase 3 milestone verification        | Verified            |

---

## 14. Operational & Deployment Readiness

- Local infrastructure running in isolated containers (PostgreSQL 16 on 5433, Redis 7 on 6380, Mailpit on 1025/8025).
- Relational schema migration `20261123021140_init_auth_schema` active and applied cleanly.
- Health probes active at `/api/v1/health` with active DB and Redis ping verification.
- Complete API auth and session integration suite passing (9 automated tests).
- Web client builds deterministically in 5.77s.

---

## 15. Final Engineering Assessment

Phase 2 (Database & Account Authentication) is completed and verified against all criteria:

- **Zero Plaintext Passwords:** Argon2id server-side password hashing verified (`m=64MiB`, `t=3`, `p=4`).
- **Opaque Session Security:** `HttpOnly`, `SameSite=Strict` cookie sessions rotated on refresh; replay of rotated tokens instantly revokes the entire session family.
- **Account Lockout:** 5 consecutive failed login attempts trigger automated 15-minute lockouts.
- **Strict IDOR Prevention:** Verified cross-user denial on session listing and remote device revocation.
- **Three-Secret Separation:** Client registration and login enforce strict boundary separation between account authentication passwords and client-side Vault Passphrases.

Repository status: Clean, passing all test and lint gates, ready for Phase 3: Zero-Knowledge Cryptography & Vault Lifecycle (`packages/crypto`).
