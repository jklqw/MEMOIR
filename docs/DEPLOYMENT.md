# Memoir — Production Deployment & Operations Guide

> **Architecture:** Zero-Trust, Zero-Knowledge Encrypted Monorepo Deployment  
> **Target Environment:** Linux Container Host (Docker / Podman with Compose)  
> **Security Baseline:** CIS Benchmark / OWASP Top 10 / NIST 800-63B / WCAG 2.2 AA

---

## 1. System Topology

In production, Memoir runs across four segregated services:

```
                            [ Public Internet ]
                                     │
                             HTTPS (Port 443)
                                     ▼
                      ┌─────────────────────────────┐
                      │    Nginx Reverse Proxy      │
                      │  (infra/proxy/memoir.conf)  │
                      │  TLS 1.3 / Security Headers │
                      └──────────────┬──────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 │                                       │
            HTTP │ (Internal)                       HTTP │ (Static)
                 ▼                                       ▼
    ┌─────────────────────────┐             ┌─────────────────────────┐
    │     API Service         │             │      Web Client         │
    │  (NestJS / Node 22)     │             │    (Vite SPA Dist)      │
    │   UID 10001 non-root    │             │   UID 101 non-root      │
    └────────────┬────────────┘             └─────────────────────────┘
                 │
      ┌──────────┴──────────┐
      │  internal-net       │ (internal: true, zero public ports)
      ▼                     ▼
┌───────────┐         ┌───────────┐
│ Postgres  │         │   Redis   │
│ 16 Alpine │         │ 7 Alpine  │
└───────────┘         └───────────┘
```

- **Network Segregation:** PostgreSQL and Redis containers communicate over a private Docker network (`internal-net`) with `internal: true`. Zero database or Redis ports are published to the host.
- **Unprivileged Containers:** Both API and Web containers run as non-root unprivileged users (`UID 10001` for API, `UID 101` for Nginx).
- **Process Supervisor:** Node processes are supervised by `dumb-init` to handle POSIX signals (`SIGTERM`, `SIGINT`) cleanly.

---

## 2. Environment Variables & Secret Generation

### Generating Production Secrets

All cryptographic secrets MUST be generated using a high-entropy CSPRNG before starting containers:

```bash
# 1. 256-bit (32-byte) hex-encoded Server KMS Key (for encrypting TOTP secrets & KMS data)
openssl rand -hex 32

# 2. Cryptographically random session signing secret (min 32 characters)
openssl rand -base64 32

# 3. Cryptographically random CSRF signing secret (min 32 characters)
openssl rand -base64 32

# 4. High-entropy PostgreSQL password
openssl rand -base64 24

# 5. High-entropy Redis password
openssl rand -base64 24
```

### Production Environment Inventory (`.env.prod`)

| Variable                  | Description                          | Example / Requirement                                    |
| :------------------------ | :----------------------------------- | :------------------------------------------------------- |
| `NODE_ENV`                | Runtime environment                  | `production`                                             |
| `PORT`                    | API internal port                    | `4000`                                                   |
| `HOST`                    | API bind address                     | `0.0.0.0`                                                |
| `DATABASE_URL`            | PostgreSQL connection string         | `postgresql://memoir:PASSWORD@postgres:5432/memoir_prod` |
| `REDIS_HOST`              | Redis host inside internal network   | `redis`                                                  |
| `REDIS_PORT`              | Redis internal port                  | `6379`                                                   |
| `REDIS_PASSWORD`          | Redis authentication password        | High-entropy string                                      |
| `SESSION_SECRET`          | Secret used for cookie signature     | 32+ characters                                           |
| `CSRF_SECRET`             | Secret used for CSRF token signature | 32+ characters                                           |
| `SERVER_KMS_KEY`          | Hex-encoded 256-bit AES master key   | 64 hex characters                                        |
| `STORAGE_DIR`             | Private encrypted attachment path    | `/app/storage/uploads`                                   |
| `STORAGE_MAX_QUOTA_BYTES` | User storage ceiling                 | `1073741824` (1 GiB)                                     |
| `MAX_FILE_SIZE_BYTES`     | Maximum per-upload size              | `52428800` (50 MiB)                                      |
| `WEB_URL`                 | Frontend origin for CORS and cookies | `https://memoir.example.com`                             |
| `COOKIE_DOMAIN`           | Domain for session cookies           | `.example.com` (or omit for host-only)                   |
| `COOKIE_SECURE`           | Force HTTPS-only cookies             | `true`                                                   |
| `COOKIE_SAMESITE`         | SameSite cookie policy               | `Lax`                                                    |
| `LOG_LEVEL`               | Pino logger verbosity                | `warn` or `info`                                         |

---

## 3. Production Deployment Step-by-Step

### Step 1: Clone and Configure Environment

```bash
git clone https://github.com/memoir/memoir.git /opt/memoir
cd /opt/memoir

# Create production environment file
cp .env.example .env.prod
chmod 600 .env.prod
nano .env.prod
```

### Step 2: Provision TLS Certificates

Place your valid TLS certificates at:

- `/etc/ssl/certs/memoir.crt` (Full certificate chain)
- `/etc/ssl/private/memoir.key` (Private key, permissions `600`)

_(Or configure Let's Encrypt Certbot reverse proxy upstream)._

### Step 3: Run Database Migrations

Before starting the web services, execute schema migrations in a one-shot container:

```bash
docker compose -f docker-compose.prod.yml run --rm api pnpm --filter @memoir/api exec prisma migrate deploy
```

### Step 4: Launch Production Stack

```bash
docker compose -f docker-compose.prod.yml up -d
```

### Step 5: Verify Health Checks

```bash
docker compose -f docker-compose.prod.yml ps

# Confirm health status:
# api: healthy (probing http://localhost:4000/api/v1/health)
# web: healthy (probing https://localhost/health)
# postgres: healthy (probing pg_isready)
# redis: healthy (probing redis-cli ping)
```

---

## 4. Encrypted Database Backups & Disaster Recovery

### Automated Encrypted Backup Script

Create `/usr/local/bin/memoir-backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/memoir"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/memoir_db_${TIMESTAMP}.sql.gz.gpg"
GPG_RECIPIENT="sysadmin@example.com"

mkdir -p "${BACKUP_DIR}"

# Dump PostgreSQL and stream directly into GPG encryption
docker compose -f /opt/memoir/docker-compose.prod.yml exec -T postgres \
  pg_dump -U memoir memoir_prod | gzip | gpg --encrypt --recipient "${GPG_RECIPIENT}" --output "${BACKUP_FILE}"

chmod 600 "${BACKUP_FILE}"
echo "[$(date -Iseconds)] Encrypted backup created: ${BACKUP_FILE}"

# Retain backups for 30 days
find "${BACKUP_DIR}" -name "memoir_db_*.sql.gz.gpg" -mtime +30 -delete
```

### Tested Disaster Recovery / Restore Procedure

To restore from an encrypted backup:

```bash
# 1. Stop write traffic
docker compose -f docker-compose.prod.yml stop api

# 2. Decrypt and restore PostgreSQL database
gpg --decrypt /var/backups/memoir/memoir_db_20261124_000000.sql.gz.gpg | gunzip | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U memoir -d memoir_prod

# 3. Run pending migrations if restoring to newer codebase
docker compose -f docker-compose.prod.yml run --rm api pnpm --filter @memoir/api exec prisma migrate deploy

# 4. Restart API service
docker compose -f docker-compose.prod.yml start api
```

---

## 5. Security Invariants & Secret Rotation

### Account Password vs. Vault Passphrase

- **Account Password:** Hashed server-side with Argon2id. When changed, existing user sessions are revoked.
- **Vault Passphrase:** Master DEK is unwrapped client-side and re-wrapped with a new `PassphraseKEK`. The master DEK never changes, so memory records and attachments do not need re-encryption.

### Rotating the Server KMS Key (`SERVER_KMS_KEY`)

The server KMS key encrypts TOTP 2FA seeds. If rotating `SERVER_KMS_KEY`:

1. Use a database migration script to fetch rows from `User.twoFactorSecret`.
2. Decrypt with `SERVER_KMS_KEY_OLD`.
3. Encrypt with `SERVER_KMS_KEY_NEW`.
4. Update `SERVER_KMS_KEY` in `.env.prod` and restart the API container.

---

## 6. Monitoring, Logs & Observability

- **API Healthcheck:** `GET /api/v1/health` returns `{ "status": "ok", "timestamp": "...", "database": "connected", "redis": "connected" }`.
- **Log Redaction:** All server logs (Pino) filter passwords, tokens, cookies, authorization headers, credit cards, and cryptographic keys.
- **Log Retention:** In production, ship Docker logs to an isolated log aggregator (e.g. Loki / Vector) with a 30-day retention window. Never log request bodies of `/api/v1/memories` or `/api/v1/vault`.

---

## 7. Rollback Procedure

If a deployment fails:

1. Re-tag previous release image or checkout previous Git commit tag:
   ```bash
   git checkout tags/v1.0.0
   ```
2. Re-build or pull previous image:
   ```bash
   docker compose -f docker-compose.prod.yml build
   ```
3. Restart stack:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --remove-orphans
   ```
