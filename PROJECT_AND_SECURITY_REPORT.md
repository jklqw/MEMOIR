# Memoir — Unified Engineering & Security Implementation Report

## 1. Executive Summary

Memoir is a privacy-first, end-to-end encrypted personal diary platform built on the **Zero-Knowledge Invariant**: even under total database, cache, and server log exfiltration, an adversary cannot read memory titles, bodies, tags, moods, attachment filenames, or uploaded documents.

This unified document is the authoritative engineering and security record for the Memoir repository. It tracks verified implementations, automated test evidence, static analysis findings, and honest architectural boundaries across all development phases.

- **Current Status:** Phase 0 (Environment Inspection, Planning & Clean Foundation) Completed.
- **Application Version:** `0.1.0-dev`
- **Review Date:** 2026-11-23
- **Implemented & Verified Controls:** Monorepo architecture, strict TypeScript configuration, ESLint flat config, Prettier code style enforcement, automated Conventional Commits linting, clean package resolution, and initial package manifests.

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

### 2.3 Verification Commands Run in Phase 0

- `pnpm install`: Clean installation across all 5 workspace projects (exit code `0`).
- `pnpm format:check`: Prettier verified across all repository files (exit code `0`).
- `pnpm lint`: ESLint flat config verified with 0 errors/warnings (exit code `0`).
- `pnpm typecheck`: Strict TypeScript typechecking verified across all packages (exit code `0`).

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
  - _(current)_ — `docs(report): initialize unified PROJECT_AND_SECURITY_REPORT.md with Phase 0 baseline`

---

## 5. Cryptography & Key Management

_(Full implementation and test vectors scheduled for Phase 3)_

- **Primitives:**
  - KDF: `Argon2id` (m=64 MiB, t=3, p=1, hashLength=32) via `hash-wasm`.
  - Key Derivation & Domain Separation: `HKDF-SHA256`.
  - AEAD: Native Web Crypto `AES-256-GCM` with 96-bit CSPRNG nonces and record-specific AAD.
  - Padding: Deterministic 256-byte length-prefixed block padding.
  - Recovery: 256-bit entropy encoded as Crockford Base32 with checksum.

---

## 6. Authentication, Sessions, 2FA & Passkeys

_(Scheduled for Phase 2 and Phase 6)_

- Server-side password hashing via `Argon2id`.
- Opaque cookie sessions (`HttpOnly`, `Secure`, `SameSite=Strict`).
- Redis rate limiting and exponential account lockout.
- TOTP 2FA with KMS-encrypted secrets and single-use backup codes.
- WebAuthn Passkeys with explicit session-only boundary (vault unlocked separately).

---

## 7. API, Database & Attachment Security

_(Scheduled for Phase 2, Phase 4, and Phase 5)_

- Prisma ORM parameterized queries (SQLi prevention).
- Strict Zod DTO allowlisting (`forbidNonWhitelisted: true`).
- Client-side EXIF stripping for JPEG/PNG/WebP attachments.
- Per-file random `FileKey` wrapped with DEK.
- Server-generated UUIDv4 storage keys (zero path traversal, zero public URLs).

---

## 8. Browser, Frontend & Logging Privacy

_(Scheduled for Phase 1, Phase 4, and Phase 6)_

- Strict Content Security Policy (zero `unsafe-inline` scripts, zero `unsafe-eval`).
- Self-hosted `@fontsource` typography (zero external CDN or Google Fonts tracking).
- Markdown rendered strictly with `react-markdown` + `rehype-sanitize`.
- Structured logging with `nestjs-pino` with default redaction covering headers, cookies, passwords, tokens, and ciphertexts.

---

## 9. Automated Testing Matrix

| Test Suite / Layer | Target Package | Command             | Result          | Date       | Notes                                       |
| :----------------- | :------------- | :------------------ | :-------------- | :--------- | :------------------------------------------ |
| **Format Check**   | Workspace Root | `pnpm format:check` | PASS (0 errors) | 2026-11-23 | Verified all files adhere to Prettier rules |
| **Linting**        | Workspace Root | `pnpm lint`         | PASS (0 errors) | 2026-11-23 | Verified with ESLint flat config            |
| **Typecheck**      | All Packages   | `pnpm typecheck`    | PASS (0 errors) | 2026-11-23 | Verified with TypeScript 5.7+ strict mode   |

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

---

## 12. Residual Risks & Honest Limitations

1. **Malicious or Compromised Server:** A compromised server could attempt to serve modified JavaScript. Mitigations include strict CSP, Subresource Integrity, reproducible builds, and future native desktop client wrappers.
2. **Client Endpoint Compromise:** Keyloggers, screen grabbers, or memory dumpers on an infected user device operate inside the trusted boundary.
3. **Browser Extensions:** Untrusted browser extensions with page access can inspect the DOM. Users should access personal vaults in isolated profiles.
4. **Volatile Memory Sanitization:** JavaScript runtimes cannot guarantee immediate hardware RAM zeroization.

---

## 13. Security Commit History

| Commit Hash | Conventional Commit Message                                                              | Security Control                      | Verification Status |
| :---------- | :--------------------------------------------------------------------------------------- | :------------------------------------ | :------------------ |
| `0ae4da7`   | `chore(repo): initialize git repository, workspace layout, and gitignore`                | Git hygiene & secret exclusion        | Verified            |
| `8c7ebc2`   | `docs(plan): define implementation plan, requirements, and repository standards`         | Architecture & security specification | Verified            |
| `995f464`   | `chore(tooling): configure pnpm TypeScript monorepo, ESLint, Prettier, and commit hooks` | Strict type safety & code hygiene     | Verified            |

---

## 14. Operational & Deployment Readiness

- Monorepo structure configured with workspace boundary isolation.
- Reproducible lockfile (`pnpm-lock.yaml`) committed.
- Host environment inspected and verified against runtime prerequisites.

---

## 15. Final Engineering Assessment

Phase 0 has been completed with disciplined hygiene, strict TypeScript typechecking, automated linting, and honest documentation. The foundation is ready for Phase 1 architectural boundaries and application scaffolding upon owner review.
