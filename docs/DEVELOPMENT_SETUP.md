# Memoir — Development Setup & Runtime Environment

This document records the exact development environment and step-by-step setup instructions for Memoir.

---

## 1. Verified Local Host Environment

| Tool / Runtime       | Detected Version                    | Target Standard / Compatibility     |
| :------------------- | :---------------------------------- | :---------------------------------- |
| **Operating System** | Fedora Linux 7.2.11-100.fc43.x86_64 | Linux (x86_64 / arm64), macOS, WSL2 |
| **Git**              | `2.56.0`                            | Git 2.40+                           |
| **Node.js**          | `v22.22.2`                          | Node.js 22 LTS (Active LTS)         |
| **pnpm**             | `10.34.9`                           | pnpm 9.x or 10.x                    |
| **Docker Engine**    | `29.9.2`                            | Docker 24+                          |
| **Docker Compose**   | `v5.6.0`                            | Docker Compose v2.20+               |

---

## 2. Prerequisites & Verification

### 2.1 Verify Runtime Prerequisites

Run the following verification sequence in your shell:

```bash
git --version
node --version
pnpm --version
docker --version
docker compose version
```

### 2.2 Corepack & pnpm Setup

If `pnpm` is not installed or requires activation:

```bash
corepack enable
corepack prepare pnpm@10.34.9 --activate
```

---

## 3. Local Development Quickstart

### 3.1 Clone & Install Dependencies

```bash
git clone <repo-url> memoir
cd memoir
pnpm install
```

### 3.2 Environment Variables

Copy the template files into place:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

_(Review placeholders; do not use production secrets in development)._

### 3.3 Start Local Infrastructure Services

Start PostgreSQL, Redis, and Mailpit via Docker Compose:

```bash
docker compose up -d
```

Verify all containers report `healthy`:

```bash
docker compose ps
```

- **PostgreSQL 16:** `localhost:5432` (database: `memoir_dev`)
- **Redis 7:** `localhost:6379`
- **Mailpit SMTP:** `localhost:1025`
- **Mailpit Web UI:** `http://localhost:8025`

### 3.4 Apply Database Migrations

```bash
pnpm --filter api exec prisma migrate dev
```

### 3.5 Launch Development Servers

```bash
pnpm dev
```

- **Web Client:** `http://localhost:5173`
- **API Server:** `http://localhost:4000/api/v1`
- **Swagger Documentation:** `http://localhost:4000/docs`

---

## 4. Quality & Verification Commands

```bash
# Code formatting verification
pnpm format:check

# Linting
pnpm lint

# Strict TypeScript typechecking across all packages
pnpm typecheck

# Full test suite (Unit, Crypto Invariants, Integration)
pnpm test

# Security regression tests
pnpm test:security

# Production build check
pnpm build
```
