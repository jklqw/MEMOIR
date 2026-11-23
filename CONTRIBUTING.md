# Contributing to Memoir

Thank you for contributing to Memoir. As an end-to-end encrypted personal diary platform handling sensitive user data, we hold engineering discipline, cryptographic soundness, and privacy guarantees to the highest standard.

---

## 1. Code of Conduct & Core Disciplines

1. **The Zero-Knowledge Invariant:** Under no circumstance may plaintext memory content, titles, private tags, moods, filenames, or file bytes be transmitted to the server or stored in unencrypted form.
2. **Never Fake Security:** Every cryptographic claim must be substantiated by implementation and automated tests.
3. **No Unaudited Cryptography:** Never implement custom cryptographic primitives. Use the standard Web Crypto API and audited libraries (`hash-wasm`).
4. **Zero Secret Leakage:** Never output keys, secrets, tokens, or plaintext diary data in logs, errors, or test snapshots.

---

## 2. Conventional Commits & Branch Strategy

We adhere strictly to [Conventional Commits v1.0.0](https://www.conventionalcommits.org/).

### Allowed Commit Types

- `feat`: User-facing features or major capabilities
- `fix`: Bug fixes
- `security`: Dedicated security controls, hardening, or vulnerability mitigations
- `docs`: Documentation additions and updates
- `test`: Adding or updating test suites
- `build`: Build system or dependency updates
- `ci`: Continuous Integration workflow changes
- `chore`: Maintenance, repository setup, or tooling tasks
- `refactor`: Code refactoring without behavior change

### Format

```text
<type>(<scope>): <imperative concise subject>

[optional body explaining rationale and context]
```

### Branch Naming

- `feature/<short-description>`
- `security/<vulnerability-or-control>`
- `fix/<issue-description>`
- `docs/<doc-title>`

---

## 3. Local Development & Verification

Before submitting a Pull Request, ensure all local checks pass:

```bash
# 1. Format check
pnpm format:check

# 2. Linting
pnpm lint

# 3. TypeScript typechecking
pnpm typecheck

# 4. Unit & cryptographic invariant tests
pnpm test

# 5. Security regression tests
pnpm test:security

# 6. Production build check
pnpm build
```

---

## 4. Security-Sensitive Contributions

If your PR touches any of the following areas:

- `packages/crypto/`
- `apps/api/src/auth/`
- `apps/api/src/vault/`
- `apps/web/src/crypto/`
- Content Security Policy (CSP) or CORS configs

You **must**:

1. Include automated tests proving tamper rejection, boundary enforcement, and failure modes.
2. Update `docs/CRYPTOGRAPHY.md` or `docs/THREAT_MODEL.md` as appropriate.
3. Add verified output and rationale to `PROJECT_AND_SECURITY_REPORT.md`.
