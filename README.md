# Memoir

<p align="center">
  <strong>Your memories. Your keys. Your privacy.</strong><br>
  <em>A privacy-first, zero-knowledge, end-to-end encrypted personal diary platform built on mathematical guarantees and archival craftsmanship.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Architecture-Zero--Knowledge-000000?style=flat-square" alt="Zero-Knowledge">
  <img src="https://img.shields.io/badge/TypeScript-5.7%20Strict-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript Strict">
  <img src="https://img.shields.io/badge/Cryptography-AES--256--GCM%20%7C%20Argon2id-critical?style=flat-square" alt="Crypto">
  <img src="https://img.shields.io/badge/Security-WCAG%202.2%20AA%20%7C%20WebAuthn-success?style=flat-square" alt="Security">
  <img src="https://img.shields.io/badge/Tests-226%2B%20Passing-brightgreen?style=flat-square" alt="Tests">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License">
</p>

---

## 1. Product Vision & The Zero-Knowledge Invariant

Memoir is an intentional personal diary designed to protect your reflections, thoughts, and photographs from surveillance, corporate data mining, and credential compromise. Memoir guarantees privacy through client-side cryptography rather than policy statements.

### The Zero-Knowledge Invariant

> [!IMPORTANT]
> **Zero Plaintext Invariant:** Even in the catastrophic scenario where the PostgreSQL database, Redis caches, object storage volumes, and server log files are completely exfiltrated by an adversary, the attacker **cannot** read any user's diary titles, Markdown bodies, private tags, moods, attachment filenames, or uploaded documents.

The backend API server operates strictly over opaque ciphertext envelopes, blind to plaintext user thoughts.

---

## 2. Three-Secret Separation

Memoir enforces strict isolation between account authentication and encryption keys. A compromised account password **never** decrypts your diary.

| Secret               | Scope & Processing                          | Purpose                                      | Stored On Server?                   |
| :------------------- | :------------------------------------------ | :------------------------------------------- | :---------------------------------- |
| **Account Password** | Argon2id hashed server-side                 | API session authentication only              | Argon2id hash only                  |
| **Vault Passphrase** | Client-only; Argon2id + HKDF derived        | Derives `PassphraseKEK` to unwrap Master DEK | ❌ **Never** (Client RAM only)      |
| **Recovery Key**     | 256-bit CSPRNG, Crockford Base32 + Checksum | Emergency DEK recovery if passphrase is lost | ❌ **Never** (User printed/offline) |

---

## 3. Cryptographic Architecture

All encryption and decryption execute client-side inside the browser using the native WebCrypto API and WebAssembly Argon2id:

```mermaid
flowchart TD
    subgraph Client["Browser Boundary (Untrusted Network Beyond)"]
        VP["Separate Vault Passphrase"] -->|Argon2id (64MiB, t=3, p=1) + HKDF-SHA256| PKEK["PassphraseKEK (256-bit)"]
        RK["256-bit Recovery Key (Crockford Base32)"] -->|HKDF-SHA256| RKEK["RecoveryKEK (256-bit)"]

        DEK["Master Data Encryption Key (DEK)<br/>256-bit AES-GCM (Volatile RAM Only)"]

        PKEK -->|AES-256-GCM Wrap + AAD| WDEK["Wrapped DEK Envelope"]
        RKEK -->|AES-256-GCM Wrap + AAD| WRDEK["Recovery Wrapped DEK Envelope"]

        DEK -->|AES-256-GCM + 256B Boundary Padding + AAD| EncMem["Encrypted Memory Envelopes"]
        DEK -->|Wrap FileKey| WFK["Wrapped FileKey"]
        FK["Ephemeral 256-bit FileKey"] -->|AES-256-GCM + Stripped EXIF| EncFile["Encrypted Attachment Blobs"]
    end

    subgraph Server["Server Boundary (Zero Knowledge / Opaque Envelopes)"]
        API["NestJS API (Node 22 Non-Root)"]
        DB[("PostgreSQL 16")]
        Store[("Private Storage Volume")]

        WDEK --> API --> DB
        WRDEK --> API --> DB
        EncMem --> API --> DB
        WFK --> API --> DB
        EncFile --> API --> Store
    end
```

### Cryptographic Standards & Controls

- **Memory-Hard KDF:** Argon2id (`m=64MiB`, `t=3`, `p=1`) compiled to WebAssembly via `hash-wasm`.
- **Domain Separation (HKDF-SHA256):** Distinct info strings (`memoir:v1|kdf|passphrase-kek`, `memoir:v1|kdf|recovery-kek`).
- **Context Binding (AAD):** Cryptographically binds every record to user and ID (`memoir:v1|memory|user:{userId}|id:{memoryId}`).
- **Deterministic 256-Byte Boundary Padding:** Length-prefixed padding prevents ciphertext-length side-channel inferences.
- **Fresh CSPRNG Nonces:** 96-bit random nonce per encryption; nonce reuse is strictly prohibited and rejected.
- **Zero-Reencryption Rotation:** Rotating your Vault Passphrase only re-wraps the Master DEK; zero diary memories require re-encryption.

---

## 4. Key Features

- **Distraction-Free Journaling:** Quiet Markdown editor with autosave state machine, tag chips, and mood selectors.
- **Private Attachment Vault:** Client-side EXIF stripping (GPS, camera model, timestamps) and per-file AES-256-GCM encryption for images and PDFs.
- **Time Capsules:** Cryptographically sealed memories scheduled for future reflection. The server withholds payloads with `423 Locked` until the unlock timestamp arrives.
- **Client-Side Mood Insights:** Word counts, writing rhythm graphs, and mood distributions calculated 100% in browser RAM.
- **Resilient Offline Mode:** Encrypted-only IndexedDB local cache and conflict-safe offline mutation queue with automatic online sync.
- **Multi-Factor Authentication:** TOTP 2FA with KMS-encrypted secrets and FIDO2 / WebAuthn biometric Passkeys.
- **Archival Paper & Ink Palette:** Elegant typographic hierarchy using self-hosted Newsreader, Plus Jakarta Sans, and JetBrains Mono. WCAG 2.2 AA compliant.
- **Total Data Portability:** Export encrypted backups, import vaults, or download warning-gated plaintext archives.

---

## 5. Technology Stack

| Layer                   | Technologies                                                                                                |
| :---------------------- | :---------------------------------------------------------------------------------------------------------- |
| **Monorepo & Language** | TypeScript 5.7+ (`strict: true`), pnpm Workspaces, Turborepo                                                |
| **Frontend**            | React 19, Vite, Tailwind CSS v4, Zustand (RAM-only store), TanStack Query, Radix UI, Lucide Icons, Recharts |
| **Typography**          | Self-hosted `@fontsource/newsreader`, `@fontsource/plus-jakarta-sans`, `@fontsource/jetbrains-mono`         |
| **Client Cryptography** | Native Web Crypto API (`AES-256-GCM`, `HKDF-SHA256`), `hash-wasm` (Argon2id)                                |
| **Backend API**         | NestJS, Prisma ORM, Pino Logger (redacted), Class-Validator                                                 |
| **Persistence & Cache** | PostgreSQL 16 (isolated internal network), Redis 7 (rate limiting & sessions)                               |
| **Production Runtime**  | Hardened Dockerfiles (non-root unprivileged users), TLS 1.3 Nginx Reverse Proxy                             |

---

## 6. Quickstart (Local Development)

### 1. Prerequisites

- Node.js `22.x LTS`
- `pnpm` (`10.x` or `9.x`)
- Docker & Docker Compose

### 2. Copy Environment Templates & Install

```bash
# Clone the repository
git clone https://github.com/memoir/memoir.git
cd memoir

# Install dependencies across all workspace packages
pnpm install

# Copy environment configurations
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### 3. Launch Supporting Services

```bash
# Starts PostgreSQL 16 (port 5433), Redis 7 (port 6380), and Mailpit (port 8025)
docker compose up -d
```

### 4. Run Migrations & Start Development Servers

```bash
# Deploy Prisma database schema
pnpm --filter @memoir/api exec prisma migrate dev

# Start both API and Web applications concurrently
pnpm dev
```

- **Web Application:** `http://localhost:5173`
- **Backend API:** `http://localhost:4000/api/v1`
- **Mailpit Web UI:** `http://localhost:8025`

---

## 7. Quality & Verification Commands

Memoir enforces rigorous quality standards across the entire monorepo:

```bash
# Check code formatting (Prettier)
pnpm format:check

# Run static code analysis (ESLint)
pnpm lint

# Strict TypeScript typechecking across all packages
pnpm typecheck

# Run unit and cryptographic invariant tests (packages/crypto)
pnpm --filter @memoir/crypto test

# Run frontend unit, offline sync, and accessibility tests (apps/web)
pnpm --filter @memoir/web test

# Run backend integration tests (apps/api)
pnpm --filter @memoir/api test

# Run full security regression suite (IDOR, XSS, CSRF, Rate Limiting, Zero-Knowledge)
pnpm test:security

# Scan for committed secrets and high-severity dependencies
node scripts/scan-secrets.mjs
pnpm audit --audit-level=high
```

### Test Suite Summary

- **13/13** Cryptographic Invariant Tests Passing (100%)
- **36/36** Frontend Unit, Offline & Accessibility Tests Passing (100%)
- **173/173** Backend Integration Tests Passing (100%)
- **24/24** Security Regression Tests Passing (100%)
- **0** TypeScript errors, **0** ESLint errors, **0** Secrets detected

---

## 8. Production Deployment

For hardened production deployment with TLS 1.3, unprivileged non-root containers, and private database networks:

```bash
# Inspect production compose configuration
docker compose -f docker-compose.prod.yml config

# Launch production stack
docker compose -f docker-compose.prod.yml up -d
```

See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for full deployment instructions, TLS provisioning, and automated backup schedules.

---

## 9. Comprehensive Documentation Index

- [Implementation Plan & Phase Roadmap](./docs/IMPLEMENTATION_PLAN.md)
- [System Requirements & Architecture Boundaries](./docs/REQUIREMENTS.md)
- [Local Development Setup Guide](./docs/DEVELOPMENT_SETUP.md)
- [System Architecture & Data Flows](./docs/ARCHITECTURE.md)
- [Zero-Knowledge Cryptography Specification](./docs/CRYPTOGRAPHY.md)
- [STRIDE Threat Model & Security Posture](./docs/THREAT_MODEL.md)
- [Privacy Policy & Data Classification](./docs/PRIVACY.md)
- [REST API Specification & Integration](./docs/API.md)
- [Quality Assurance & Testing Guide](./docs/TESTING.md)
- [Production Deployment & Operations Guide](./docs/DEPLOYMENT.md)
- [Runbook: Backup & Disaster Recovery](./docs/RUNBOOK_BACKUP_RESTORE.md)
- [Runbook: Secret & Key Rotation](./docs/RUNBOOK_KEY_ROTATION.md)
- [Comprehensive Project & Security Report](./PROJECT_AND_SECURITY_REPORT.md)
- [Security Vulnerability Disclosure Policy](./SECURITY.md)
- [Contributing Guidelines](./CONTRIBUTING.md)

---

## 10. License

Memoir is open-source software licensed under the [MIT License](./LICENSE).
