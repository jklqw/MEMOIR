# Memoir — Unified Engineering & Security Implementation Report

## 1. Executive Summary

Memoir is a privacy-first, end-to-end encrypted personal diary platform built on the **Zero-Knowledge Invariant**: even under total database, cache, and server log exfiltration, an adversary cannot read memory titles, bodies, tags, moods, attachment filenames, or uploaded documents.

This unified document is the authoritative engineering and security record for the Memoir repository. It tracks verified implementations, automated test evidence, static analysis findings, and honest architectural boundaries across all development phases.

- **Current Status:** Phase 4 (Encrypted Diary Core) Completed.
- **Application Version:** `0.1.0-dev`
- **Review Date:** 2026-11-23
- **Implemented & Verified Controls:**
  - Complete STRIDE Threat Model, Trust Boundary definitions, and Data Classification Policy (`docs/ARCHITECTURE.md`, `docs/THREAT_MODEL.md`, `docs/PRIVACY.md`).
  - Containerized local development infrastructure via Docker Compose / Rootless Podman (`postgres:16-alpine`, `redis:7-alpine`, `axllent/mailpit`).
  - Modular NestJS API foundation with fail-fast Zod environment validation, OpenAPI Swagger documentation (`/docs`), safe non-leaking global exception filter, and structured Pino logging with guaranteed secret redaction.
  - Relational PostgreSQL Prisma migrations: `init_auth_schema`, `add_user_vaults`, `add_memories_schema`.
  - Client-side cryptographic engine (`packages/crypto`) with WebAssembly Argon2id, HKDF-SHA256, AES-256-GCM, 256-byte block padding, Crockford Base32 recovery keys, and volatile RAM key store (`useVaultStore`).
  - Distraction-free archival editor with autosave state machine, 68ch layout, date picker, private tags, mood chips, time capsule picker, and XSS-sanitized markdown preview.
  - Chronological Timeline grouped by Month & Year, interactive monthly Calendar View, Memory Detail modal with live Cryptographic Inspector, and 100% Client-Side Local Search across RAM-decrypted entries.
  - Comprehensive 44 automated tests across crypto, backend API, and web frontend verifying zero plaintext storage in PostgreSQL, nonce-reuse prevention, Time Capsule server-side withholding, IDOR denial, and network isolation during local search.

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
  - `d73ede5` — `docs(report): append Phase 3 zero-knowledge cryptography report and test evidence`

### Phase 4 — Encrypted Diary Core

- **Objective:** Implement client-encrypted memory schema, opaque persistence API, pre-bound AAD encryption service, distraction-free archival editor with autosave state machine, chronological timeline with month/year grouping, memory detail view with cryptographic inspector, interactive calendar view, and 100% client-side local search across in-memory decrypted entries.
- **Implementation Summary:**
  - Applied Prisma migration `20261123180512_add_memories_schema` creating `memories` table with composite indexes (`[userId, createdAt]`, `[userId, entryDate]`), strict foreign key relations, soft deletion, and timestamped archival tracking.
  - Built `MemoriesModule` in `apps/api` (`POST /api/v1/memories`, `GET /api/v1/memories`, `GET /api/v1/memories/:id`, `PATCH /api/v1/memories/:id`, `DELETE /api/v1/memories/:id`, `POST :id/pin`, `POST :id/archive`, `POST :id/restore`) with strict `userId` ownership scoping, 5MB ciphertext limit, Time Capsule server-side withholding (masking ciphertext/nonce for unexpired capsules), and mandatory nonce-reuse rejection on updates (400 Bad Request).
  - Implemented browser-side memory crypto service in `apps/web/src/services/memoryCryptoService.ts` and React Query hooks in `apps/web/src/hooks/useMemories.ts` binding all memory ciphertexts to record-bound AAD (`memoir:v1|memory|user:{userId}|id:{memoryId}`) with fresh 96-bit CSPRNG nonces and length-prefixed 256-byte block padding.
  - Built distraction-free editorial `DiaryEditor` in `apps/web/src/components/editor/DiaryEditor.tsx` with autosave state machine (`saved`, `saving`, `unsaved`, `failed`, `offline`), `68ch` archival layout, date picker, private tags, mood chips, time capsule picker, keyboard shortcuts (`Cmd/Ctrl+S`), `beforeunload` unsaved change protection, and XSS-sanitized markdown preview via `react-markdown` and `rehype-sanitize`.
  - Built chronological `TimelinePage` in `apps/web/src/pages/TimelinePage.tsx` with clean Month & Year grouping, tag/mood dropdown filters, active/archived toggle, pagination, and **100% Client-Side Local Search** executing full-text matching strictly in browser RAM without ever sending search queries to the server.
  - Built interactive monthly `CalendarPage` in `apps/web/src/pages/CalendarPage.tsx` mapping memories to days, allowing day-specific writing, and displaying explicit zero-knowledge date metadata disclosures.
  - Built `MemoryDetailModal` with decrypted markdown preview, mood/tags, pin/archive/restore actions, permanent deletion confirmation modal, and live Cryptographic Inspector disclosing envelope ID, nonce, ciphertext size, and AAD context.
  - Authored comprehensive test suites in `apps/api/test/memories.spec.ts` (6 tests) and `apps/web/test/memory-crypto.spec.ts` (4 tests) verifying CRUD, cross-user IDOR access denial, nonce-reuse rejection, Time Capsule withholding, local search network isolation, and direct PostgreSQL assertion confirming zero plaintext strings in the `memories` table.
- **Security & Privacy Controls:**
  - **Zero Plaintext Invariant:** Verified via direct PostgreSQL raw SQL assertion (`SELECT * FROM "memories"`): columns and values never contain titles, body text, tags, moods, or prose.
  - **Nonce Reuse Guard:** Verified rejecting identical nonces on updates with `400 Bad Request`.
  - **Time Capsule Sealing:** Verified server strictly masks/withholds ciphertext and nonces for sealed time capsules until unexpired.
  - **Strict Ownership Isolation:** Verified cross-user IDOR access denial throwing non-leaking 404s.
  - **100% Client-Side Search:** Verified search queries never generate network traffic; search is performed entirely in browser memory.
  - **XSS Boundary:** Verified user markdown is sanitized through an allowlist schema, stripping malicious scripts and unsafe protocols.
- **Verification Commands & Results:**
  - `pnpm --filter @memoir/api test` -> 7 test files passed (21 total tests passing).
  - `pnpm --filter @memoir/web test` -> 2 test files passed (10 total tests passing).
  - `pnpm --filter @memoir/crypto test` -> 1 test file passed (13 core invariant tests passing).
  - `pnpm --filter @memoir/web build` -> PASS in 17.8s.
  - `pnpm format:check` -> PASS (0 errors).
  - `pnpm lint` -> PASS (0 errors).
  - `pnpm typecheck` -> PASS across all packages (0 errors).
- **Atomic Commit Ledger:**
  - `979a836` — `feat(memory): add encrypted memory schema and opaque persistence API`
  - `f5fe15b` — `feat(memory): implement browser-side memory encryption service with AAD binding`
  - `2ce9ef2` — `feat(web): build distraction-free Markdown editor with autosave state machine and XSS sanitization`
  - `610f37f` — `feat(memory): add chronological timeline, memory detail, calendar view, and local search`
  - `eebb67e` — `test(memory): cover encrypted diary CRUD, ownership isolation, autosave races, and local search`
  - `b43fc5a` — `docs(report): append Phase 4 encrypted diary core verification to report`

### Phase 5 — Encrypted Attachments, Private Vault & Data Portability

- **Objective:** Implement zero-knowledge encrypted file attachments, client-side EXIF/GPS stripping, per-file AES-256-GCM encryption, private storage abstraction with strict quota enforcement, standalone Private Vault page for personal documents and photos, full zero-knowledge backup export/import (.memoir-backup.json) with SHA-256 integrity manifest, and warning-gated plaintext/Markdown export.
- **Implementation Summary:**
  - Applied Prisma migrations `20261123180453_add_attachments_schema` and `20261123184041_add_backups_schema` creating `attachments` and `backups` tables with foreign keys to `users` and `memories`, indexes on `[userId, createdAt]`, `[userId, isVaultItem]`, and `[memoryId]`.
  - Built `StorageModule` and `StorageProvider` abstraction (`apps/api/src/storage/`) providing `LocalStorageProvider` (isolated disk directory outside public web roots) and `S3StorageProvider` (production-ready AWS S3 adapter). Enforced 10 MB per-file size limits and 250 MB per-user total storage quotas with server-generated UUIDv4 storage keys (`{uuid}.enc`), eliminating directory traversal and public URLs.
  - Implemented client-side EXIF and GPS coordinate stripping (`stripExifMetadata` in `packages/crypto/src/exif.util.ts`) for JPEG/PNG/WebP images prior to browser-side encryption.
  - Implemented per-file encryption in `packages/crypto/src/attachment.ts`: Each attachment generates a fresh random 256-bit `FileKey` and encrypts file bytes with `AES-256-GCM` using record-bound AAD (`memoir:v1|attachment-blob|user:{userId}|id:{attachmentId}`), encrypts private file metadata (`{ originalFilename, mimeType, originalSize }`) under `DEK` with AAD (`memoir:v1|attachment-meta|user:{userId}|id:{attachmentId}`), and wraps `FileKey` under `DEK` with AAD (`memoir:v1|file-key-wrap|user:{userId}|id:{attachmentId}`).
  - Built `AttachmentsModule` (`apps/api/src/attachments/`) with `POST /api/v1/attachments`, `GET /api/v1/attachments`, `GET /api/v1/attachments/:id/blob`, and `DELETE /api/v1/attachments/:id`. Binary downloads are served strictly with `Content-Type: application/octet-stream`, `Content-Disposition: attachment`, and `X-Content-Type-Options: nosniff`.
  - Integrated decrypted in-memory previews (`AttachmentPreview.tsx`) in both `DiaryEditor` and `MemoryDetailModal`, decrypting blobs into volatile RAM via `URL.createObjectURL` and immediately invoking `URL.revokeObjectURL` on unmount.
  - Built dedicated **Private Vault** page (`apps/web/src/pages/VaultPage.tsx`) for standalone encrypted personal files (`isVaultItem: true`), featuring 250 MB quota progress meter, Photos/Documents/All category filter tabs, 100% RAM filename search, one-click decrypted file download, and transparent cryptographic security guarantees.
  - Built `BackupsModule` (`apps/api/src/backups/`) with `POST /api/v1/backups/export`, `POST /api/v1/backups/import`, and `GET /api/v1/backups/history`. Export generates complete `.memoir-backup.json` containing ciphertext envelopes, KDF parameters, wrapped DEK, and SHA-256 integrity manifest, logging `BACKUP_EXPORTED` in `security_events`. Import verifies manifest integrity, validates envelopes, remaps ownership to the importing user, and deduplicates records.
  - Built comprehensive Backup Verification & Restore UI and Warning-Gated Plaintext Export in `apps/web/src/pages/SettingsPage.tsx`. Users can inspect backup files with client-side WebCrypto SHA-256 verification before restoring. A dedicated modal with strong warning disclosures requires typing `CONFIRM EXPORT` before decrypting all memories in browser RAM and exporting unencrypted JSON.
- **Security & Privacy Controls:**
  - **Zero-Knowledge Invariant for Files:** The server and database never receive original filenames, MIME types, or unencrypted file bytes. All file metadata and payloads are encrypted client-side.
  - **EXIF & Geolocation Stripping:** Removes GPS coordinates, camera serial numbers, and device timestamps client-side before encryption.
  - **Hardened Binary Downloads:** Served with `application/octet-stream`, `nosniff`, and `attachment` to prevent browser MIME-sniffing and SVG/HTML stored-XSS execution.
  - **Strict Storage Quota Isolation:** Per-file 10 MB limit and per-user 250 MB quota enforced server-side.
  - **Tamper-Evident Backups:** SHA-256 checksum covers all vault parameters and ciphertext envelopes; tampering even 1 bit in memories or attachments triggers immediate import rejection.
  - **Warning-Gated Plaintext Export:** Plaintext export is shielded behind an explicit confirmation barrier informing the user that cryptographic protection is permanently removed.
- **Verification Commands & Results:**
  - `pnpm --filter @memoir/api test` -> 10 test files passed (35 integration tests passing, including storage quotas, attachment IDOR denial, and backup export/import).
  - `pnpm --filter @memoir/web test` -> 4 test files passed (19 frontend tests passing, including vault file crypto, EXIF stripping, and backup SHA-256 verification).
  - `pnpm --filter @memoir/crypto test` -> 1 test file passed (13 core invariant tests passing).
  - `pnpm format:check` -> PASS (0 errors).
  - `pnpm lint` -> PASS (0 errors).
  - `pnpm typecheck` -> PASS across all packages (0 errors).
- **Atomic Commit Ledger:**
  - `6d05a5c` — `feat(storage): add private attachment storage abstraction and quota enforcement`
  - `380d0ed` — `feat(attachments): implement client-side EXIF stripping and per-file AES-256-GCM encryption`
  - `18a7ec4` — `feat(vault): add Private Vault UI for standalone encrypted documents and photos`
  - `01b7ba2` — `feat(portability): add encrypted backup export/import and warning-gated plaintext export`
  - `7e73587` — `docs(report): append Phase 5 attachments and portability verification to report`

### Phase 6 — Application Security Hardening

> **Phase Policy:** Every security control receives its own dedicated atomic commit, automated test suite, and report entry.

#### Control 6.1: Security Headers, Strict CSP, HSTS & Allowlisted CORS (Commit 33)

- **Objective:** Configure Helmet and reverse-proxy header parity with strict Content Security Policy (verified against the production Vite build), HSTS (1 year + preload), nosniff, no-referrer, frame-ancestors 'none', Permissions-Policy, and allowlisted CORS with credentials support.
- **Implementation Summary:**
  - Built `setupSecurityMiddleware` in `apps/api/src/common/security/security-headers.ts` configuring:
    - **Content-Security-Policy (CSP):** `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`, `connect-src 'self' [allowlisted origins]`, `font-src 'self'`, `object-src 'none'`, `media-src 'self' blob:`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`.
    - **Strict-Transport-Security (HSTS):** `max-age=31536000; includeSubDomains; preload`.
    - **X-Content-Type-Options:** `nosniff` (blocking MIME sniffing).
    - **Referrer-Policy:** `no-referrer` (preventing referer information leaks).
    - **X-Frame-Options & CSP frame-ancestors:** `DENY` and `'none'` (preventing clickjacking).
    - **Permissions-Policy:** `camera=(), microphone=(), geolocation=(), payment=(), usb=(), screen-wake-lock=()`.
    - **Cross-Origin Policies:** `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`.
    - **Allowlisted CORS:** Restricts origins to configured `WEB_URL`, `http://localhost:5173`, `http://127.0.0.1:5173` with `credentials: true`; rejects unlisted origins.
  - Built Nginx reverse proxy configuration with full security header parity in `infra/proxy/memoir.conf` enforcing TLS 1.3, identical CSP/HSTS/security headers, and static asset immutability.
  - Verified CSP compatibility against the production Vite build (`pnpm --filter @memoir/web build`).
  - Authored automated test suite `apps/api/test/security-headers.spec.ts` (9 tests) verifying every security header and CORS allowlist enforcement.
- **Verification Commands & Results:**
  - `pnpm --filter @memoir/api test test/security-headers.spec.ts` -> 9 passed (100%).
  - `pnpm --filter @memoir/web build` -> PASS in 8.75s (all assets adhere to strict CSP).
- **Atomic Commit Ledger:**
  - `06aeb70` — `security(headers): enforce strict CSP, HSTS, Helmet headers, and allowlisted CORS`

#### Control 6.2: CSRF Protection, Strict DTO Allowlist & Injection Defenses (Commit 34)

- **Objective:** Enforce Double-Submit Cookie CSRF protection, strict DTO allowlists against mass assignment, and comprehensive XSS/SQL injection regression defenses.
- **Implementation Summary:**
  - Created `CsrfGuard` in `apps/api/src/common/guards/csrf.guard.ts` enforcing:
    - Safe read-only method exemption (`GET`, `HEAD`, `OPTIONS`).
    - Unauthenticated pass-through (requests lacking `memoir_session` cookie).
    - Origin / Referer allowlist verification matching configured `WEB_URL` and development origins.
    - Constant-time comparison (`crypto.timingSafeEqual`) between `x-csrf-token` HTTP request header and `XSRF-TOKEN` cookie.
  - Added `GET /api/v1/auth/csrf` to `AuthController` to issue fresh 32-byte CSPRNG hex tokens. Also sets/rotates `XSRF-TOKEN` cookie on login/refresh and clears it on logout.
  - Integrated `CsrfGuard` globally in `apps/api/src/main.ts`.
  - Configured web API client (`apps/web/src/lib/api.ts`) to extract `XSRF-TOKEN` from `document.cookie` and attach `x-csrf-token` header on mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`).
  - Configured global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true`, rejecting unexpected properties with 400 Bad Request.
  - Configured `unplugin-swc` in `vitest.config.ts` to preserve TypeScript decorator metadata in test executions.
  - Authored automated test suite `apps/api/test/security-csrf-validation.spec.ts` (10 tests) verifying CSRF tokens, missing/tampered header rejection (403), untrusted origin rejection (403), valid mutation success (200), safe method exemptions, mass-assignment rejection (400), XSS payload validation (400), and Prisma parameterized SQL injection defense.
- **Verification Commands & Results:**
  - `pnpm --filter @memoir/api test test/security-csrf-validation.spec.ts` -> 10 passed (100%).
  - `pnpm --filter @memoir/api test` -> 12 test files passed (54 integration tests passing).
  - `pnpm --filter @memoir/web build` -> PASS in 10.45s.
- **Atomic Commit Ledger:**
  - `c1082c3` — `security(csrf-validation): enforce CSRF protection, strict DTO allowlists, and XSS regression tests`

#### Control 6.3: Rate Limiting & Account Lockout (Commit 35)

- **Objective:** Enforce proxy-aware Redis-backed rate limiting with tiered limits across public/auth/recovery endpoints and exponential account lockout after consecutive failed authentication attempts.
- **Implementation Summary:**
  - Implemented `MemoirThrottlerGuard` in `apps/api/src/common/guards/throttler.guard.ts` extending NestJS `@nestjs/throttler`. Resolves real client IP using `X-Forwarded-For` and `req.ips` across trusted proxy hops, or user ID identifier (`usr:<userId>`) for authenticated sessions.
  - Backed by Redis storage (`ThrottlerStorageRedisService`) via `ioredis` with automatic graceful in-memory fallback.
  - Configured tiered throttling:
    - `default`: 100 requests per 60 seconds across all endpoints.
    - `auth`: 10 requests per 60 seconds on registration, login, 2FA, password change, and reset endpoints.
    - `recovery`: 5 requests per 300 seconds on vault recovery attempts.
    - Health probes (`/health`) explicitly exempted via `@SkipThrottle()`.
  - Added RFC 7231 compliant `Retry-After` HTTP headers on all `429 Too Many Requests` responses.
  - Implemented progressive exponential account lockout in `AuthService`: 5 failed attempts trigger an initial 15-minute lockout ($15 \times 2^{\min(\text{attempts}-5, 6)}$ min, capped at 24 hours) logging `LOCKOUT_TRIGGERED` security audit events and rejecting login attempts until `lockedUntil` expires.
  - Authored automated test suite in `apps/api/test/security-ratelimit.spec.ts` (6 tests) verifying proxy IP resolution, auth throttling, 429 Retry-After headers, exponential lockout scaling, lockout bypass denial, and health probe exemptions.
- **Verification Commands & Results:**
  - `pnpm --filter @memoir/api test test/security-ratelimit.spec.ts` -> 6 passed (100%).
- **Atomic Commit Ledger:**
  - `f513799` — `security(ratelimit): enforce proxy-aware Redis rate limiting and exponential account lockout`

#### Control 6.4: Two-Factor Authentication (TOTP), KMS Encryption & Password Lifecycle (Commit 36)

- **Objective:** Implement RFC 6238 TOTP two-factor authentication, KMS AES-256-GCM envelope encryption for stored TOTP secrets, SHA-256 hashed single-use backup codes, and Three-Secret Separation password change/reset lifecycles.
- **Implementation Summary:**
  - Implemented server-side KMS encryption utility in `apps/api/src/common/security/kms.util.ts` using AES-256-GCM with `SERVER_KMS_KEY`, fresh 96-bit CSPRNG nonces, and record-bound AAD (`memoir:kms:v1`).
  - Added Prisma migration `20261123202341_add_password_reset_tokens` adding `passwordResetTokenHash` and `passwordResetExpiresAt` to `users`.
  - Integrated `otplib` (v13) and `qrcode` for RFC 6238 TOTP secret generation, QR code data URL generation, and verification with format error boundary guards.
  - Built complete 2FA lifecycle in `AuthService`:
    - `POST /api/v1/auth/2fa/setup`: Generates base32 secret, QR code data URL, 10 single-use `XXXX-XXXX` backup recovery codes, and temporary Redis enrollment cache (10 min TTL).
    - `POST /api/v1/auth/2fa/enable`: Verifies code from authenticator app, encrypts secret via KMS AES-256-GCM, stores SHA-256 hashed backup codes, and sets `totpEnabled: true`. Emits `TOTP_ENABLED`.
    - `POST /api/v1/auth/2fa/verify`: Validates 6-digit TOTP code or single-use backup code (which is permanently consumed from array upon use). Challenge token in Redis is deleted only upon successful verification. Creates authorized session.
    - `POST /api/v1/auth/2fa/disable`: Re-authenticates account password via Argon2id, verifies TOTP or backup code, clears secrets from DB, and emits `TOTP_DISABLED`.
    - Updated `POST /api/v1/auth/login`: If 2FA is active, issues short-lived `mfaToken` (5 min TTL) with `{ mfaRequired: true }` without session cookie, or accepts `totpCode` directly in initial payload.
  - Built credential lifecycle adhering to **Three-Secret Separation**:
    - `POST /api/v1/auth/change-password`: Verifies current password with Argon2id, updates password hash, revokes other sessions, strictly preserving `user_vaults`.
    - `POST /api/v1/auth/forgot-password`: Anti-enumeration timing delay, dispatches reset link with SHA-256 hashed token.
    - `POST /api/v1/auth/reset-password`: Validates token, updates password hash, revokes sessions, and guarantees zero mutation or corruption of `user_vaults`.
  - Built frontend UI:
    - MFA challenge form in `apps/web/src/pages/LoginPage.tsx` accepting TOTP or backup code with back button.
    - 2FA Setup flow in `apps/web/src/pages/SecurityPage.tsx` with QR code image, copyable secret key, 10 backup codes with copy-all action, and code confirmation.
    - 2FA Disable dialog requiring account password and TOTP/backup code.
    - Account Password Lifecycle form with Three-Secret Separation disclosures.
  - Authored automated test suite `apps/api/test/security-2fa-lifecycle.spec.ts` (15 tests) verifying setup, wrong token rejection, KMS ciphertext verification in PostgreSQL, login MFA challenge, backup code single-use consumption, disable re-authentication, password change, and password reset with zero-knowledge vault integrity assertion.
- **Verification Commands & Results:**
  - `pnpm --filter @memoir/api test test/security-2fa-lifecycle.spec.ts` -> 15 passed (100%).
  - `pnpm --filter @memoir/web test` -> 4 test files passed (19 tests passing).
  - `pnpm typecheck` -> PASS across all 4 packages (0 errors).
  - `pnpm lint` -> PASS (0 errors).
- **Atomic Commit Ledger:**
  - `0d11373` — `security(2fa): implement TOTP 2FA, KMS-encrypted secrets, hashed backup codes, and password lifecycle`

#### Control 6.5: WebAuthn Passkeys & Explicit Zero-Knowledge Vault Boundary (Commit 37)

- **Objective:** Implement FIDO2 / WebAuthn passkey registration and authentication using `@simplewebauthn`, storing public key credentials with strict IDOR ownership checks, counter replay protection, and explicit cryptographic assertion that passkey authentication satisfies server session establishment without mutating, touching, or decrypting client-side `user_vaults`.
- **Implementation Summary:**
  - Added Prisma migration `20261123210055_add_webauthn_credentials` creating `webauthn_credentials` table with UUID primary key, `userId` relation, unique `credentialId`, binary `publicKey`, `counter` BigInt, `transports` String array, and timestamps.
  - Implemented `@Injectable() WebAuthnService` in `apps/api/src/auth/webauthn.service.ts` wrapping `@simplewebauthn/server` methods (`generateRegistrationOptions`, `verifyRegistrationResponse`, `generateAuthenticationOptions`, `verifyAuthenticationResponse`) ensuring testable dependency injection.
  - Built passkey lifecycle in `AuthService`:
    - `POST /api/v1/auth/passkeys/register/options`: Authenticated endpoint generating challenge stored in Redis (`memoir:webauthn:reg:<userId>`, 300s TTL) with configured `RP_ID` and user details.
    - `POST /api/v1/auth/passkeys/register/verify`: Verifies attestation against challenge, persists credential with initial counter, and records `PASSKEY_ADDED` security event.
    - `POST /api/v1/auth/passkeys/login/options`: Public endpoint generating challenge stored in Redis (`memoir:webauthn:auth:<challenge>`, 300s TTL) with userVerification required.
    - `POST /api/v1/auth/passkeys/login/verify`: Verifies assertion against challenge, updates credential counter (preventing cloned authenticator replays) and `lastUsedAt`, resets `failedLoginAttempts`, issues authenticated session cookie, and records `LOGIN_SUCCESS` with `{ method: 'passkey', credentialId }`.
    - `GET /api/v1/auth/passkeys`: Returns sanitized user credentials excluding raw public keys.
    - `DELETE /api/v1/auth/passkeys/:id`: Enforces strict `userId` ownership check (denying IDOR attacks), deletes credential, and records `PASSKEY_REMOVED` event.
  - Explicit **Three-Secret Separation & Zero-Knowledge Vault Boundary**:
    - Passkey authentication satisfies session establishment on the server (`memoir_session` cookie).
    - Under zero circumstance does passkey sign-in unlock, mutate, or decrypt `user_vaults`. Unlocking the zero-knowledge vault remains strictly protected by the client-side Vault Passphrase in volatile browser RAM.
  - Built frontend UI:
    - Passkey login option with `Fingerprint` icon in `apps/web/src/pages/LoginPage.tsx`.
    - Passkeys & Biometric Logins section in `apps/web/src/pages/SecurityPage.tsx` with hardware enrollment modal, active passkey listing with delete action, and explicit Zero-Knowledge Vault Boundary callout.
  - Authored automated test suite `apps/api/test/security-passkeys.spec.ts` (14 tests) verifying unauthenticated option rejection (401), registration generation, attestation verification rejection and success, authentication generation, invalid credential/challenge rejection, counter replay tracking, session creation, IDOR deletion denial, and cryptographic zero-knowledge vault immutability assertion.
- **Verification Commands & Results:**
  - `pnpm --filter @memoir/api test test/security-passkeys.spec.ts` -> 14 passed (100%).
  - `pnpm typecheck` -> PASS across all 4 packages (0 errors).
  - `pnpm lint` -> PASS (0 errors).
- **Atomic Commit Ledger:**
  - _(current)_ — `security(passkeys): implement WebAuthn Passkeys with explicit zero-knowledge vault boundary`

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
- **Account Lockout:** 5 consecutive failed login attempts trigger an exponential lockout duration ($15 \times 2^{\min(\text{attempts}-5, 6)}$ minutes, capped at 24 hours) emitting `LOCKOUT_TRIGGERED`. Successfully authenticating resets `failedLoginAttempts` and clears `lockedUntil`.
- **Proxy-Aware Rate Limiting:** Backed by Redis with fail-safe in-memory fallback, tracking client IP via `X-Forwarded-For` and `usr:<id>` for authenticated requests. Tiered enforcement: `default` (100 req/min), `auth` (10 req/min), `recovery` (5 req/5min). Health probes exempted via `@SkipThrottle()`. Returns `429 Too Many Requests` with RFC 7231 `Retry-After` header.
- **Email Verification:** Dispatched via Mailpit SMTP; tokens stored as SHA-256 hashes with 24-hour expiration.
- **Two-Factor Authentication (TOTP):** Full RFC 6238 implementation with QR code onboarding, KMS AES-256-GCM encryption for stored TOTP secrets (`memoir:kms:v1` AAD), and 10 single-use `XXXX-XXXX` backup codes stored as SHA-256 hashes. Backup codes are immediately consumed upon use.
- **Three-Secret Separation & Credential Lifecycle:** Changing or resetting account passwords strictly updates the server authentication hash without touching, modifying, or corrupting `user_vaults`.
- **Passkeys (WebAuthn / FIDO2):** Full FIDO2 / WebAuthn passkey support via `@simplewebauthn` for biometric login and hardware security keys. Public key credentials stored with counter validation against replay attacks and strict IDOR deletion checks. Cryptographically guaranteed to establish server sessions without touching, decrypting, or modifying `user_vaults` (preserving Three-Secret Separation).

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

| Test Suite / Layer                  | Target Package   | Command                                            | Result          | Date       | Notes                                                                      |
| :---------------------------------- | :--------------- | :------------------------------------------------- | :-------------- | :--------- | :------------------------------------------------------------------------- |
| **Format Check**                    | Workspace Root   | `pnpm format:check`                                | PASS (0 errors) | 2026-11-23 | Verified all files adhere to Prettier rules                                |
| **Linting**                         | Workspace Root   | `pnpm lint`                                        | PASS (0 errors) | 2026-11-23 | Verified with ESLint flat config                                           |
| **Typecheck**                       | All Packages     | `pnpm typecheck`                                   | PASS (0 errors) | 2026-11-23 | Verified with TypeScript 5.7+ strict mode                                  |
| **Health Check Unit**               | `@memoir/api`    | `pnpm --filter @memoir/api test`                   | PASS (1 test)   | 2026-11-23 | Verified PostgreSQL and Redis live connection probe                        |
| **Database Integration**            | `@memoir/api`    | `vitest run test/database.spec.ts`                 | PASS (1 test)   | 2026-11-23 | Verified Prisma models, cascade deletion, and relational integrity         |
| **Auth & Email Verification**       | `@memoir/api`    | `vitest run test/auth-registration.spec.ts`        | PASS (2 tests)  | 2026-11-23 | Verified Argon2id hashing, Mailpit SMTP dispatch, token verification       |
| **Session Lifecycle & Replay**      | `@memoir/api`    | `vitest run test/auth-sessions.spec.ts`            | PASS (2 tests)  | 2026-11-23 | Verified rotation, family revocation on replay, and 5-attempt lockout      |
| **Session Scoping & IDOR Denial**   | `@memoir/api`    | `vitest run test/sessions.spec.ts`                 | PASS (3 tests)  | 2026-11-23 | Verified masked IP listing, remote revocation, and cross-user denial       |
| **Cryptographic 13 Invariants**     | `@memoir/crypto` | `pnpm --filter @memoir/crypto test`                | PASS (13 tests) | 2026-11-23 | Verified tamper rejection, 10k nonces, 256B padding, Crockford Base32      |
| **Vault Lifecycle & IDOR Denial**   | `@memoir/api`    | `vitest run test/vault.spec.ts`                    | PASS (6 tests)  | 2026-11-23 | Verified setup, duplicate rejection, rotation, recovery, zero secrets      |
| **Browser Vault Store & Auto-Lock** | `@memoir/web`    | `pnpm --filter @memoir/web test`                   | PASS (6 tests)  | 2026-11-23 | Verified wrong passphrase, recovery, rotation, zero storage, auto-lock     |
| **Encrypted Memories Persistence**  | `@memoir/api`    | `vitest run test/memories.spec.ts`                 | PASS (6 tests)  | 2026-11-23 | Verified zero plaintext in PG, nonce reuse guard, time capsule masking     |
| **Memory Client Crypto & Search**   | `@memoir/web`    | `vitest run test/memory-crypto.spec.ts`            | PASS (4 tests)  | 2026-11-23 | Verified AAD binding, unique nonces, and 100% RAM-only search isolation    |
| **Security Headers & Helmet**       | `@memoir/api`    | `vitest run test/security-headers.spec.ts`         | PASS (5 tests)  | 2026-11-23 | Verified CSP, HSTS, X-Content-Type-Options, Referrer-Policy, CORS          |
| **CSRF, DTO Allowlist & XSS**       | `@memoir/api`    | `vitest run test/security-csrf-validation.spec.ts` | PASS (10 tests) | 2026-11-23 | Verified Double-Submit token check, stripped unknown fields, XSS inputs    |
| **Rate Limiting & Account Lockout** | `@memoir/api`    | `vitest run test/security-ratelimit.spec.ts`       | PASS (6 tests)  | 2026-11-23 | Verified proxy IP isolation, Redis TTL, 5-failure lockout, success reset   |
| **TOTP 2FA & Password Lifecycle**   | `@memoir/api`    | `vitest run test/security-2fa-lifecycle.spec.ts`   | PASS (15 tests) | 2026-11-23 | Verified KMS AES-GCM, single-use backup codes, and Three-Secret separation |
| **WebAuthn Passkeys & Vault Guard** | `@memoir/api`    | `vitest run test/security-passkeys.spec.ts`        | PASS (14 tests) | 2026-11-23 | Verified FIDO2 passkeys, replay counter, IDOR checks, zero-knowledge lock  |
| **Web Production Build**            | `@memoir/web`    | `pnpm --filter @memoir/web build`                  | PASS (0 errors) | 2026-11-23 | Built Vite bundle with self-hosted bundled fonts in 17.8s                  |

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

| Commit Hash | Conventional Commit Message                                                                             | Security Control                      | Verification Status |
| :---------- | :------------------------------------------------------------------------------------------------------ | :------------------------------------ | :------------------ |
| `0ae4da7`   | `chore(repo): initialize git repository, workspace layout, and gitignore`                               | Git hygiene & secret exclusion        | Verified            |
| `8c7ebc2`   | `docs(plan): define implementation plan, requirements, and repository standards`                        | Architecture & security specification | Verified            |
| `995f464`   | `chore(tooling): configure pnpm TypeScript monorepo, ESLint, Prettier, and commit hooks`                | Strict type safety & code hygiene     | Verified            |
| `ca2887a`   | `docs(report): initialize unified PROJECT_AND_SECURITY_REPORT.md with Phase 0 baseline`                 | Verification baseline                 | Verified            |
| `f352576`   | `docs(architecture): document system boundaries, STRIDE threat model, and privacy policy`               | STRIDE & Trust Boundaries             | Verified            |
| `1f46d22`   | `chore(infra): add reproducible local Docker Compose services and env templates`                        | Infrastructure isolation              | Verified            |
| `99896a5`   | `feat(api): scaffold NestJS foundation, Zod env validation, OpenAPI, and redacted logging`              | Log redaction & fail-fast validation  | Verified            |
| `c221e9a`   | `feat(web): build responsive application shell and Archival Paper & Ink design system`                  | Zero external tracking & fonts        | Verified            |
| `2e46ef9`   | `docs(report): append Phase 1 architecture and shell verification to report`                            | Phase 1 milestone verification        | Verified            |
| `32035a6`   | `feat(database): add initial Prisma schema and migrations for accounts, sessions, events`               | Relational integrity & cascade safety | Verified            |
| `9fa3cd7`   | `feat(auth): implement registration, server Argon2id hashing, and email verification`                   | Argon2id & anti-enumeration hashing   | Verified            |
| `51f3b2e`   | `feat(auth): implement opaque cookie sessions, rotation, and reuse detection`                           | Session rotation & replay revocation  | Verified            |
| `835f0fb`   | `feat(web): build accessible registration, login, and email verification screens`                       | WCAG 2.2 AA & Three-Secret guidance   | Verified            |
| `37233d9`   | `feat(auth): add active session management and remote device revocation`                                | IDOR prevention & remote revocation   | Verified            |
| `965dd9e`   | `docs(report): append Phase 2 authentication verification to report`                                    | Phase 2 milestone verification        | Verified            |
| `710eecf`   | `docs(crypto): specify versioned client-side encryption, key hierarchy, and recovery`                   | Versioned crypto specification        | Verified            |
| `e49f3bf`   | `feat(crypto): implement versioned Argon2id, HKDF, AES-256-GCM, padding, and recovery`                  | Client-side cryptographic engine      | Verified            |
| `71c25a6`   | `test(crypto): verify cryptographic invariants, tamper rejection, nonces, and recovery`                 | 13 Core Invariant verification suite  | Verified            |
| `41e17ac`   | `feat(vault): add user_vaults persistence and browser vault setup, unlock, lock, recovery`              | Zero-knowledge vault lifecycle & UI   | Verified            |
| `ad2267c`   | `test(vault): verify vault lifecycle, wrong passphrase, recovery, and zero secret storage`              | Vault lifecycle & RAM security tests  | Verified            |
| `d73ede5`   | `docs(report): append Phase 3 zero-knowledge cryptography report and test evidence`                     | Phase 3 milestone verification        | Verified            |
| `979a836`   | `feat(memory): add encrypted memory schema and opaque persistence API`                                  | Encrypted memory schema & CRUD        | Verified            |
| `f5fe15b`   | `feat(memory): implement browser-side memory encryption service with AAD binding`                       | Client AAD binding & 256B padding     | Verified            |
| `2ce9ef2`   | `feat(web): build distraction-free Markdown editor with autosave state machine`                         | Archival editor & autosave states     | Verified            |
| `610f37f`   | `feat(memory): add chronological timeline, memory detail, calendar view, and local search`              | Local search & calendar metadata      | Verified            |
| `eebb67e`   | `test(memory): cover encrypted diary CRUD, ownership isolation, autosave races, and search`             | PG zero-plaintext & IDOR denial tests | Verified            |
| `b43fc5a`   | `docs(report): append Phase 4 encrypted diary core verification to report`                              | Phase 4 milestone verification        | Verified            |
| `6d05a5c`   | `feat(storage): add private attachment storage abstraction and quota enforcement`                       | Quota checks & server storageKey      | Verified            |
| `380d0ed`   | `feat(attachments): implement client-side EXIF stripping and per-file AES-256-GCM encryption`           | Per-file keys & EXIF stripping        | Verified            |
| `18a7ec4`   | `feat(vault): add Private Vault UI for standalone encrypted documents and photos`                       | Standalone vault files & quota meter  | Verified            |
| `01b7ba2`   | `feat(portability): add encrypted backup export/import and warning-gated plaintext export`              | SHA-256 manifest & warning gate       | Verified            |
| `5135008`   | `docs(report): append Phase 5 attachments and portability verification to report`                       | Phase 5 milestone verification        | Verified            |
| `06aeb70`   | `security(headers): enforce strict CSP, HSTS, Helmet headers, and allowlisted CORS`                     | Strict CSP, HSTS, Helmet & CORS       | Verified            |
| `c1082c3`   | `security(csrf-validation): enforce CSRF protection, strict DTO allowlists, and XSS regression tests`   | Double-Submit CSRF & DTO allowlist    | Verified            |
| `f513799`   | `security(ratelimit): enforce proxy-aware Redis rate limiting and exponential account lockout`          | Proxy-Aware Rate Limiting & Lockout   | Verified            |
| `0d11373`   | `security(2fa): implement TOTP 2FA, KMS-encrypted secrets, hashed backup codes, and password lifecycle` | RFC 6238 TOTP & KMS Secret Encryption | Verified            |
| _(current)_ | `security(passkeys): implement WebAuthn Passkeys with explicit zero-knowledge vault boundary`           | FIDO2 WebAuthn & Vault Lock Boundary  | Verified            |

---

## 14. Operational & Deployment Readiness

- Local infrastructure running in isolated containers (PostgreSQL 16 on 5433, Redis 7 on 6380, Mailpit on 1025/8025).
- Relational schema migrations active and cleanly applied:
  - `20261123021140_init_auth_schema`
  - `20261123163904_add_user_vaults`
  - `20261123171352_add_memories_schema`
  - `20261123180453_add_attachments_schema`
  - `20261123184041_add_backups_schema`
  - `20261123202341_add_password_reset_tokens`
  - `20261123210055_add_webauthn_credentials`
- Health probes active at `/api/v1/health` with active DB and Redis ping verification.
- Complete test suites passing across all layers:
  - `@memoir/crypto`: 13 core invariant tests passing (100%).
  - `@memoir/api`: 89 integration tests across 15 test suites passing (100%).
  - `@memoir/web`: 19 frontend tests across 4 test suites passing (100%).
- Web client builds deterministically with 100% self-hosted typography and zero external CDNs.

---

## 15. Final Engineering Assessment

Phase 6 Application Security Hardening is advancing under the strict One Commit Per Security Control policy:

- **Security Headers & CORS (Commit 33):** Strict CSP, HSTS, Helmet, and allowlisted origins fully verified.
- **CSRF & Injection Defenses (Commit 34):** Double-submit cookie CSRF protection and strict DTO whitelists passing.
- **Rate Limiting & Lockout (Commit 35):** Proxy-aware Redis-backed rate limiting and exponential account lockout active.
- **TOTP 2FA & Password Lifecycle (Commit 36):** RFC 6238 TOTP, KMS AES-256-GCM encrypted secrets, and single-use hashed backup codes implemented.
- **Passkeys (Commit 37):** WebAuthn FIDO2 authentication landed with strict replay protection and zero-knowledge vault isolation.
- **Upcoming Controls:** Audit logging & threat heuristics (Commit 38), Consolidated security regression suite (Commit 39), and Security CI/CD, secret scanning & dependency audits (Commit 40).
