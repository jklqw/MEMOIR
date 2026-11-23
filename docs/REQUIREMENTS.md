# Memoir — System Requirements & Dependencies

This document outlines the system requirements, runtime constraints, and dependency management policy for Memoir.

---

## 1. System Requirements

### 1.1 Hardware Specifications
- **CPU:** Dual-core 64-bit x86_64 or ARM64 processor (Quad-core recommended for Argon2id key derivation benchmarks and containerized tests).
- **RAM:** 4 GB minimum (8 GB recommended when running Docker Compose + local dev build servers concurrently).
- **Disk:** 5 GB free disk space for dependencies, Docker containers, and test fixtures.

### 1.2 Operating Systems
- Linux (Fedora 38+, Ubuntu 22.04 LTS+, Debian 12+, Arch Linux)
- macOS 13+ (Ventura, Sonoma, Sequoia on Apple Silicon or Intel)
- Windows 11 via WSL2 (Ubuntu or Debian)

### 1.3 Browser Compatibility
Memoir relies on modern client-side cryptographic and storage APIs:
- Web Crypto API (`crypto.subtle`, `crypto.getRandomValues`)
- WebAssembly (WASM) for client-side Argon2id key derivation (`hash-wasm`)
- IndexedDB (`idb`) for offline encrypted vault storage
- WebAuthn (`navigator.credentials`) for phishing-resistant Passkey sign-in
- Modern ECMAScript (ES2022+) and CSS Container Queries / Color-mix

**Supported Browsers:**
- Chromium / Google Chrome 110+
- Mozilla Firefox 115+ ESR / 120+
- Apple Safari 16.4+
- Microsoft Edge 110+

---

## 2. Authoritative Dependency Manifests

Because Memoir is a modern TypeScript/Node.js monorepo:
- **`package.json`** (at root and within each package/app workspace) defines explicit direct dependencies and version ranges.
- **`pnpm-lock.yaml`** is the **sole authoritative lockfile**, ensuring deterministic, bit-for-bit dependency resolution across development, CI, and production container builds.
- **`pnpm-workspace.yaml`** declares workspace boundaries.

> [!NOTE]
> Do not generate or reference a Python `requirements.txt` file. Memoir is 100% TypeScript.

---

## 3. Technology Stack Reference

| Tier | Component | Selection |
| :--- | :--- | :--- |
| **Language** | TypeScript | `v5.7+` (strict mode, zero implicit `any`) |
| **Runtime** | Node.js | `v22.x LTS` |
| **Package Manager** | pnpm | `v10.x` |
| **Database** | PostgreSQL | `16-alpine` |
| **Cache & Throttling** | Redis | `7-alpine` |
| **Local Mailer** | Mailpit | `v1.x` |
| **API Framework** | NestJS | `v10.x` / `v11.x` |
| **Web Framework** | React | `v19.x` + Vite |
| **ORM** | Prisma ORM | `v6.x` |
| **Client Crypto** | Web Crypto API + `hash-wasm` | Audited native browser AEAD + WASM Argon2id |
