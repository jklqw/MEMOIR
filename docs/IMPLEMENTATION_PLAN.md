# Memoir — Implementation Plan & Phase Roadmap

This document serves as the master engineering roadmap for Memoir, laying out the sequential phases, verification gates, and atomic Conventional Commits.

---

## 1. Architectural Principles & Invariants

1. **The Zero-Knowledge Invariant:** The database, caches, object storage, and server logs must never contain plaintext memory titles, bodies, tags, moods, attachment filenames, or raw file bytes.
2. **Three-Secret Separation:**
   - *Account Authentication Password:* Server-hashed with Argon2id; authenticates API sessions. Never used to wrap vault keys.
   - *Vault Passphrase:* Client-only; derives PassphraseKEK via Argon2id + HKDF-SHA256 to unwrap the Data Encryption Key (DEK). Never sent to the server.
   - *Recovery Key:* 256-bit random entropy, Crockford Base32 with checksum; independently wraps DEK.
3. **Fail-Closed Security:** Tampered ciphertexts, mismatched nonces, unauthorized access, or malformed payloads reject immediately.
4. **Volatile Key Material:** Unwrapped DEK resides exclusively in volatile browser RAM; zeroized on lock, logout, session expiration, or tab close.
5. **No AI-Slop UI:** Quiet editorial design language (Archival Paper & Ink in light mode, Obsidian Ink in dark mode), self-hosted typography, generous whitespace, accessible WCAG 2.2 AA interactions.

---

## 2. Milestone & Commit Roadmap (Phases 0–8)

### Phase 0 — Environment Inspection, Planning & Clean Foundation
- **Commit 01:** `chore(repo): initialize git repository, workspace layout, and gitignore`
- **Commit 02:** `docs(plan): define implementation plan, requirements, and repository standards`
- **Commit 03:** `chore(tooling): configure pnpm TypeScript monorepo, ESLint, Prettier, and commit hooks`
- **Commit 04:** `docs(report): initialize unified PROJECT_AND_SECURITY_REPORT.md with Phase 0 baseline`

### Phase 1 — Architecture Boundaries, App Shells & Local Services
- **Commit 05:** `docs(architecture): document system boundaries, STRIDE threat model, and privacy policy`
- **Commit 06:** `chore(infra): add reproducible local Docker Compose services and env templates`
- **Commit 07:** `feat(api): scaffold NestJS foundation, Zod env validation, OpenAPI, and redacted logging`
- **Commit 08:** `feat(web): build responsive application shell and Archival Paper & Ink design system`
- **Commit 09:** `docs(report): append Phase 1 architecture and shell verification to report`

### Phase 2 — Database & Account Authentication
- **Commit 10:** `feat(database): add initial Prisma schema and migrations for accounts, sessions, and audit events`
- **Commit 11:** `feat(auth): implement registration, server Argon2id hashing, and email verification`
- **Commit 12:** `feat(auth): implement opaque cookie sessions, rotation, and reuse detection`
- **Commit 13:** `feat(web): build accessible registration, login, and email verification screens`
- **Commit 14:** `feat(auth): add active session management and remote device revocation`
- **Commit 15:** `docs(report): append Phase 2 authentication verification to report`

### Phase 3 — Zero-Knowledge Cryptography & Vault Lifecycle
- **Commit 16:** `docs(crypto): specify versioned client-side encryption, key hierarchy, and recovery`
- **Commit 17:** `feat(crypto): implement versioned Argon2id, HKDF, AES-256-GCM, padding, and recovery engine`
- **Commit 18:** `test(crypto): verify cryptographic invariants, tamper rejection, nonce uniqueness, and recovery`
- **Commit 19:** `feat(vault): add user_vaults persistence and browser vault setup, unlock, lock, and recovery UI`
- **Commit 20:** `test(vault): verify vault lifecycle, wrong passphrase, recovery, and zero secret persistence`
- **Commit 21:** `docs(report): append Phase 3 zero-knowledge cryptography report and test evidence`

### Phase 4 — Encrypted Diary Core
- **Commit 22:** `feat(memory): add encrypted memory schema and opaque persistence API`
- **Commit 23:** `feat(memory): implement browser-side memory encryption service with AAD binding`
- **Commit 24:** `feat(web): build distraction-free Markdown editor with autosave state machine and XSS sanitization`
- **Commit 25:** `feat(memory): add chronological timeline, memory detail, calendar view, and local search`
- **Commit 26:** `test(memory): cover encrypted diary CRUD, ownership isolation, autosave races, and local search`
- **Commit 27:** `docs(report): append Phase 4 encrypted diary core verification to report`

### Phase 5 — Encrypted Attachments, Private Vault & Data Portability
- **Commit 28:** `feat(storage): add private attachment storage abstraction and quota enforcement`
- **Commit 29:** `feat(attachments): implement client-side EXIF stripping and per-file AES-256-GCM encryption`
- **Commit 30:** `feat(vault): add Private Vault UI for standalone encrypted documents and photos`
- **Commit 31:** `feat(portability): add encrypted backup export/import and warning-gated plaintext export`
- **Commit 32:** `docs(report): append Phase 5 attachments and portability verification to report`

### Phase 6 — Application Security Hardening
- **Commit 33:** `security(headers): enforce strict CSP, HSTS, Helmet headers, and allowlisted CORS`
- **Commit 34:** `security(csrf-validation): enforce CSRF protection, strict DTO allowlists, and XSS regression tests`
- **Commit 35:** `security(ratelimit): enforce proxy-aware Redis rate limiting and exponential account lockout`
- **Commit 36:** `security(2fa): implement TOTP 2FA, KMS-encrypted secrets, hashed backup codes, and password lifecycle`
- **Commit 37:** `security(passkeys): implement WebAuthn Passkeys with explicit zero-knowledge vault boundary`
- **Commit 38:** `security(audit): add logging redaction tests, suspicious login detection, and Security Dashboard UI`
- **Commit 39:** `test(security): add comprehensive automated security regression test suite`
- **Commit 40:** `security(ci): add dependency vulnerability audit, secret scanning, and static analysis checks`

### Phase 7 — Accessibility, Resilient Offline Mode & Differentiating Features
- **Commit 41:** `feat(ux): complete WCAG 2.2 AA accessibility pass, resilient error states, and account deletion`
- **Commit 42:** `feat(offline): implement encrypted-only IndexedDB cache and conflict-safe offline sync queue`
- **Commit 43:** `feat(features): add client-side Mood Insights, Time Capsules, and private Anniversary Reminders`

### Phase 8 — Production Hardening, CI/CD & Final Release Documentation
- **Commit 44:** `build(docker): add hardened non-root Dockerfiles, reverse proxy TLS config, and production compose`
- **Commit 45:** `ci(github): configure full GitHub Actions CI pipeline and Dependabot`
- **Commit 46:** `docs(release): complete operational docs, portfolio README.md, and finalize PROJECT_AND_SECURITY_REPORT.md`

---

## 3. Definition of Done Checklist
- [ ] TypeScript strict mode passes with zero errors and no unjustified `any`.
- [ ] Tests exist for all business logic, security controls, and cryptographic invariants.
- [ ] Code formatting and linting pass cleanly without warnings.
- [ ] Zero secrets, private user data, or plaintext content in logs or network transmissions.
- [ ] Every commit updates `PROJECT_AND_SECURITY_REPORT.md` to keep documentation synchronized with code.
