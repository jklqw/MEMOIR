# Multi-stage non-root hardened Dockerfile for Memoir API
# Stage 1: Build & Prune
FROM node:26-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate

WORKDIR /build

# Copy root workspace manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/crypto/package.json ./packages/crypto/
COPY apps/api/package.json ./apps/api/

# Install all dependencies including devDependencies for build
RUN pnpm install --frozen-lockfile

# Copy tsconfig and sources
COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/crypto ./packages/crypto
COPY apps/api ./apps/api

# Generate Prisma client and build packages & API
RUN pnpm --filter @memoir/api exec prisma generate
RUN pnpm --filter @memoir/shared run build
RUN pnpm --filter @memoir/crypto run build
RUN pnpm --filter @memoir/api run build

# Stage 2: Hardened Non-Root Minimal Runtime
FROM node:26-bookworm-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates wget dumb-init && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root unprivileged service account
RUN groupadd -g 10001 memoir && \
    useradd -u 10001 -g memoir -s /bin/false -m memoir

# Create upload directory and grant permissions
RUN mkdir -p /app/storage/uploads && \
    chown -R memoir:memoir /app

# Copy application from builder
COPY --from=builder --chown=memoir:memoir /build/node_modules ./node_modules
COPY --from=builder --chown=memoir:memoir /build/packages ./packages
COPY --from=builder --chown=memoir:memoir /build/apps/api ./apps/api

WORKDIR /app/apps/api

# Security: run as non-root user
USER memoir

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main.js"]
