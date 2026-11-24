# Operational Runbook: Backup & Disaster Recovery

> **Component:** PostgreSQL 16 & Encrypted Object Storage  
> **Target RPO (Recovery Point Objective):** 24 hours (daily automated backups)  
> **Target RTO (Recovery Time Objective):** 30 minutes  
> **Classification:** High Operational Impact

---

## 1. Backup Architecture Overview

Memoir database rows and attachment files contain **zero plaintext** user memories or diary content. All stored payloads are already encrypted with users' client-side Data Encryption Keys (DEKs). However, server-side disaster recovery backups must still be encrypted at rest (`GPG`) to protect operational metadata, user account identities, and session records.

### Backup Targets

1. **Relational Database (PostgreSQL):** Stores accounts, encrypted vault envelopes, encrypted memory envelopes, encrypted attachment metadata, and audit logs.
2. **Encrypted Attachments (Local FS / Object Storage Volume):** Stored under `/app/storage/uploads` as opaque binary blobs.

---

## 2. Automated Daily Backup Procedure

### Cron Schedule (`/etc/cron.d/memoir-backup`)

```cron
# Run daily at 02:00 UTC
0 2 * * * root /opt/memoir/scripts/backup-automated.sh >> /var/log/memoir-backup.log 2>&1
```

### Script: `scripts/backup-automated.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/memoir"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_BACKUP="${BACKUP_DIR}/memoir_db_${TIMESTAMP}.sql.gz.gpg"
FILES_BACKUP="${BACKUP_DIR}/memoir_files_${TIMESTAMP}.tar.gz.gpg"
GPG_RECIPIENT="sysadmin@example.com"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -Iseconds)] Initiating Memoir automated backup..."

# 1. PostgreSQL Database Backup
docker compose -f /opt/memoir/docker-compose.prod.yml exec -T postgres \
  pg_dump -U memoir -d memoir_prod --clean --if-exists | \
  gzip -9 | \
  gpg --batch --yes --encrypt --recipient "${GPG_RECIPIENT}" --output "${DB_BACKUP}"

echo "[$(date -Iseconds)] Database backup completed: ${DB_BACKUP}"

# 2. Encrypted Attachments Backup
tar -czf - -C /opt/memoir/storage uploads | \
  gpg --batch --yes --encrypt --recipient "${GPG_RECIPIENT}" --output "${FILES_BACKUP}"

echo "[$(date -Iseconds)] File storage backup completed: ${FILES_BACKUP}"

# 3. Restrict Permissions
chmod 600 "${BACKUP_DIR}"/memoir_*_"${TIMESTAMP}".*

# 4. Enforce 30-Day Retention Policy
find "${BACKUP_DIR}" -type f -name "memoir_*_*.gpg" -mtime +30 -delete

echo "[$(date -Iseconds)] Backup routine finished successfully."
```

---

## 3. Disaster Recovery Restoration Procedure

Follow this runbook when recovering from server hardware failure, database corruption, or catastrophic host loss.

### Pre-Requisites

- Access to the GPG private key corresponding to `sysadmin@example.com`.
- Target Linux host with Docker and Docker Compose installed.
- Target release tag checked out.

### Step 1: Quiesce Traffic

Prevent writes during recovery:

```bash
cd /opt/memoir
docker compose -f docker-compose.prod.yml stop api web
```

### Step 2: Database Restoration

```bash
# Verify the target backup file integrity
gpg --decrypt "${DB_BACKUP}" > /dev/null

# Pipe decrypted SQL stream into the postgres container
gpg --decrypt "${DB_BACKUP}" | gunzip | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U memoir -d memoir_prod

echo "Database restoration completed."
```

### Step 3: Attachment Storage Restoration

```bash
# Decrypt and unpack uploads archive
gpg --decrypt "${FILES_BACKUP}" | tar -xzf - -C /opt/memoir/storage

# Fix file ownership for non-root memoir UID 10001
chown -R 10001:10001 /opt/memoir/storage/uploads

echo "Storage volume restoration completed."
```

### Step 4: Validate Database & Prisma Migrations

```bash
docker compose -f docker-compose.prod.yml run --rm api pnpm --filter @memoir/api exec prisma migrate status
```

### Step 5: Resume Application Services & Validate

```bash
docker compose -f docker-compose.prod.yml start api web

# Wait 10 seconds and test API health
curl -f https://memoir.example.com/api/v1/health
```

---

## 4. Disaster Recovery Validation Testing

Disaster recovery readiness must be simulated and tested quarterly:

1. Restore the latest backup into an isolated staging environment.
2. Log in with a synthetic test account (`alice@example.test`).
3. Unlock vault with the corresponding test Vault Passphrase.
4. Verify memory timeline decrypts properly.
5. Verify encrypted attachment downloads and decrypts properly.
