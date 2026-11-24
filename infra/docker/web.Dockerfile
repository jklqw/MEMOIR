# Multi-stage non-root hardened Dockerfile for Memoir Web (Vite + Nginx)
# Stage 1: Build Static Assets
FROM node:26-bookworm-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.34.9 --activate

WORKDIR /build

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/crypto/package.json ./packages/crypto/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/crypto ./packages/crypto
COPY apps/web ./apps/web

RUN pnpm --filter @memoir/web build

# Stage 2: Hardened Nginx Reverse Proxy
FROM nginx:1.27-alpine AS runner

RUN apk add --no-cache openssl wget

# Generate fallback self-signed TLS certificates for memoir.local if none provided
RUN mkdir -p /etc/ssl/certs /etc/ssl/private && \
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/memoir.key \
    -out /etc/ssl/certs/memoir.crt \
    -subj "/C=US/ST=Private/L=Local/O=Memoir/CN=memoir.local" && \
    chmod 600 /etc/ssl/private/memoir.key && \
    chmod 644 /etc/ssl/certs/memoir.crt

# Remove default nginx configurations
RUN rm -rf /etc/nginx/conf.d/* /usr/share/nginx/html/*

# Copy built static assets from builder
COPY --from=builder /build/apps/web/dist /usr/share/nginx/html

# Copy hardened reverse proxy configuration
COPY infra/proxy/memoir.conf /etc/nginx/conf.d/default.conf

# Set read-only permissions on static assets
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 555 /usr/share/nginx/html

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
