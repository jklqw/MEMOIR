# Security Policy

At Memoir, security and privacy are not secondary features; they are the architectural foundation of the product. We welcome security researchers and community members to audit our code and disclose potential vulnerabilities responsibly.

---

## 1. Supported Versions

| Version   | Supported | Security Notes            |
| :-------- | :-------- | :------------------------ |
| `1.x.x`   | Yes       | Active production line    |
| `< 1.0.0` | No        | Development / Pre-release |

---

## 2. Reporting a Vulnerability

Please **do not** report security vulnerabilities via public GitHub issues, discussions, or pull requests.

Instead, report vulnerabilities privately by sending an email to:
**`security@memoir.local`** (or through GitHub Private Vulnerability Reporting on the repository).

### Please include in your report:

- Type of vulnerability (e.g., cryptographic flaw, authentication bypass, IDOR, XSS, injection)
- Step-by-step reproduction instructions or a minimal Proof of Concept (PoC)
- Affected components (`apps/api`, `apps/web`, `packages/crypto`, or infrastructure)
- Any potential impact on user ciphertext confidentiality or key isolation

### Triage Timeline:

- **Initial acknowledgment:** Within 24 hours.
- **Triage & severity assessment:** Within 72 hours.
- **Remediation & patch release:** Timelines determined based on CVSS severity (critical vulnerabilities targeted within 7 days).

---

## 3. Honest Architectural Boundaries & Residual Risks

While Memoir implements end-to-end encryption with client-side key derivation, we explicitly document inherent browser-based security boundaries:

1. **Malicious or Compromised Server:** A compromised server could attempt to serve modified JavaScript to client browsers. We mitigate this through Subresource Integrity (SRI), strict Content Security Policy, and planned reproducible binary builds, but browser runtimes inherently execute server-provided code.
2. **Compromised Client Device:** Hardware keyloggers, screen recording malware, or memory scrapers on the user's device operate within the trusted client boundary and can observe passphrases or volatile RAM.
3. **Malicious Extensions:** Browser extensions with broad host permissions can inspect DOM contents or volatile memory. Users are advised to run personal diary applications in dedicated browser profiles without untrusted extensions.
4. **Volatile Memory Sanitization:** JavaScript garbage-collected runtimes do not guarantee immediate zeroization of allocated string or typed-array memory, despite best-effort overwriting.
5. **Operational Metadata:** While title, body, tags, and moods are encrypted, operational metadata (e.g., creation timestamp, coarse `entryDate`, padded ciphertext byte lengths) is visible to the server for synchronization.
