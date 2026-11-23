# Memoir — System Architecture & Trust Boundaries

## 1. System Overview & Monolith Philosophy

Memoir is architected as a **modular monolith** in TypeScript, designed to eliminate unnecessary distributed infrastructure complexity while enforcing uncompromising zero-knowledge cryptographic boundaries between the client browser and the server.

```mermaid
flowchart TD
    subgraph Client["Trusted Client Boundary (Browser RAM)"]
        UI["React 19 Editorial UI"]
        Editor["Markdown Journal Editor"]
        CryptoEngine["packages/crypto Engine"]
        RAMStore["RAM-Only Key Store (Zustand)"]
        OfflineCache["Encrypted IndexedDB Cache"]

        Editor --> CryptoEngine
        CryptoEngine <--> RAMStore
        CryptoEngine <--> OfflineCache
        UI --> Editor
    end

    subgraph Edge["Perimeter / Reverse Proxy"]
        Proxy["Nginx / Caddy Proxy"]
        ProxyHeaders["TLS 1.3 Termination\nStrict CSP & HSTS\nAnti-Sniff & CORS"]
    end

    subgraph Server["Server Boundary (Zero Knowledge regarding Plaintext)"]
        API["NestJS Modular Monolith API"]
        AuthMod["Auth & Sessions Module"]
        VaultMod["Vault Envelopes Module"]
        MemoryMod["Encrypted Memories Module"]
        AttachMod["Encrypted Attachments Module"]
        AuditMod["Security Events Audit Module"]
        Pino["Redacted Structured Logger (Pino)"]

        API --> AuthMod
        API --> VaultMod
        API --> MemoryMod
        API --> AttachMod
        API --> AuditMod
        API --> Pino
    end

    subgraph Data["Persistence Layer"]
        DB[("PostgreSQL 16\n(Opaque Envelopes & Hashes)")]
        RedisStore[("Redis 7\n(Rate Limits & Challenges)")]
        BlobStorage[("Private Storage\n(UUIDv4 .enc Blobs)")]

        AuthMod --> DB
        AuthMod --> RedisStore
        VaultMod --> DB
        MemoryMod --> DB
        AttachMod --> DB
        AttachMod --> BlobStorage
        AuditMod --> DB
    end

    Client -->|HTTPS / WSS (Padded Envelopes + AAD)| Edge
    Edge -->|Internal HTTP| Server
```

---

## 2. Request & Trust Boundary Analysis

### 2.1 The Trusted Client Boundary

- **Environment:** User browser memory (`window.crypto.subtle`, WebAssembly runtime, volatile memory).
- **Resident Data:**
  - Plaintext diary entries (during composition and preview).
  - Unwrapped Data Encryption Key (`DEK`) as an in-memory `CryptoKey` object.
  - Temporary binary file buffers and EXIF-stripped image data.
- **Eviction Invariant:** The unwrapped `DEK` is zeroized and dereferenced upon manual vault lock, session logout, authentication expiration, tab closure, or 15 minutes of inactivity.

### 2.2 The Untrusted Transit Boundary

- All communication traverses HTTPS with TLS 1.3.
- All memory payloads (`title`, `bodyMarkdown`, `mood`, `tags`) are deterministic-padded and encrypted via `AES-256-GCM` before leaving the browser.
- Network requests contain zero plaintext diary fields, passphrases, or raw recovery keys.

### 2.3 The Untrusted Storage Boundary (PostgreSQL, Redis, Storage)

- **PostgreSQL 16:** Stores opaque Base64URL-encoded ciphertext strings, 96-bit CSPRNG nonces, envelope version markers, KDF parameter metadata, Argon2id server password hashes, and hashed session tokens.
- **Redis 7:** Stores sliding-window rate limit counters, IP lockouts, short-lived WebAuthn challenge nonces (5-minute TTL), and session revocation tombstones.
- **Private Object Storage:** Stores encrypted binary files identified strictly by server-generated random UUIDv4 keys (`{uuid}.enc`). No client filenames or original MIME types are stored on disk.

---

## 3. Modular Monolith Architecture (`apps/api`)

The backend is composed of clean NestJS feature modules:

1. **`ConfigModule`:** Fail-fast environment variable validation using Zod schemas at startup.
2. **`HealthModule`:** Liveness and readiness probes (`/api/v1/health`) asserting active connections to PostgreSQL and Redis.
3. **`AuthModule`:** Argon2id server-side password hashing, email verification tokens, opaque cookie session issuance, and refresh token family revocation.
4. **`VaultModule`:** Ingestion and retrieval of wrapped DEKs, KDF salt, and Crockford Base32 recovery envelopes.
5. **`MemoriesModule`:** CRUD over opaque memory envelopes, enforcing record-level ownership and rejecting nonce reuse.
6. **`AttachmentsModule`:** Quota enforcement, encrypted file streaming, and MIME-safe download delivery.
7. **`SessionsModule`:** Active device inspection and remote session revocation.
8. **`SecurityEventsModule`:** Monospace audit trail logging security lifecycle changes with strictly non-PII metadata.
