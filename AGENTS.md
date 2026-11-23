# Agent Guidelines & Memory — Memoir Project

## Critical Project Invariants

1. **The Zero-Knowledge Invariant:** Under NO circumstance may plaintext memory content, titles, private tags, moods, filenames, or raw file bytes be transmitted to the server or stored in PostgreSQL, Redis, or object storage.
2. **Three-Secret Separation:**
   - Account Authentication Password (server Argon2id).
   - Vault Passphrase (client-side only, derives PassphraseKEK via Argon2id + HKDF-SHA256).
   - 256-bit Recovery Key (Crockford Base32 with checksum, independently wraps DEK).
3. **Associated Authenticated Data (AAD):** Every ciphertext is bound cryptographically to its exact context and user ID (`memoir:v1|...`).
4. **Deterministic Block Padding:** Length-prefixed 256-byte boundary padding for all memory payloads.
5. **Fresh Nonce Always:** 96-bit CSPRNG nonce per encryption. Reject nonce reuse on updates.
6. **Volatile Key Material:** Unwrapped DEK in volatile browser RAM only (Zustand in-memory store without persistence). Auto-lock after 15 min idle.
7. **Single Consolidated Report:** Update `PROJECT_AND_SECURITY_REPORT.md` on every phase and security control.
8. **Clean Commits:** Follow Conventional Commits format matching the roadmap in `docs/IMPLEMENTATION_PLAN.md` and `GUIDE.md`.
