import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Production Hardening: Docker, Reverse Proxy & Network Isolation Verification', () => {
  const rootDir = path.resolve(__dirname, '../../..');

  it('1. Verifies infra/docker/api.Dockerfile enforces multi-stage non-root runtime and healthcheck', () => {
    const dockerfilePath = path.join(rootDir, 'infra/docker/api.Dockerfile');
    expect(fs.existsSync(dockerfilePath)).toBe(true);

    const content = fs.readFileSync(dockerfilePath, 'utf-8');

    // Multi-stage verification
    expect(content).toMatch(/FROM .* AS builder/i);
    expect(content).toMatch(/FROM .* AS runner/i);

    // Non-root user creation and execution
    expect(content).toMatch(/useradd .* memoir/i);
    expect(content).toMatch(/USER memoir/i);

    // Healthcheck directive
    expect(content).toMatch(/HEALTHCHECK[\s\S]*wget[\s\S]*\/api\/v1\/health/i);

    // Dumb-init process supervisor
    expect(content).toMatch(/dumb-init/i);
  });

  it('2. Verifies infra/docker/web.Dockerfile enforces multi-stage build, read-only assets, and unprivileged nginx', () => {
    const dockerfilePath = path.join(rootDir, 'infra/docker/web.Dockerfile');
    expect(fs.existsSync(dockerfilePath)).toBe(true);

    const content = fs.readFileSync(dockerfilePath, 'utf-8');

    // Multi-stage verification
    expect(content).toMatch(/FROM .* AS builder/i);
    expect(content).toMatch(/FROM .* AS runner/i);

    // Static asset copy and read-only lockdown
    expect(content).toMatch(/chmod -R 555 \/usr\/share\/nginx\/html/i);
    expect(content).toMatch(/chown -R nginx:nginx \/usr\/share\/nginx\/html/i);

    // Healthcheck directive
    expect(content).toMatch(/HEALTHCHECK[\s\S]*wget/i);
  });

  it('3. Verifies docker-compose.prod.yml isolates databases on internal-net with ZERO public port exposure', () => {
    const composePath = path.join(rootDir, 'docker-compose.prod.yml');
    expect(fs.existsSync(composePath)).toBe(true);

    const content = fs.readFileSync(composePath, 'utf-8');

    // Network isolation
    expect(content).toMatch(/internal-net:\s*\n\s*driver: bridge\s*\n\s*internal: true/);

    // Postgres isolation
    const postgresBlock = content.split('\n  redis:')[0] || '';
    expect(postgresBlock).toContain('internal-net');
    expect(postgresBlock).not.toContain('frontend-net');
    expect(postgresBlock).toContain('expose:\n      - \'5432\'');
    expect(postgresBlock).not.toMatch(/ports:\s*\n\s*-\s*['"]?5432:5432/); // Zero public host binding

    // Redis isolation
    const redisBlock = content.split('\n  api:')[0]?.split('\n  redis:')[1] || '';
    expect(redisBlock).toContain('internal-net');
    expect(redisBlock).not.toContain('frontend-net');
    expect(redisBlock).toContain('expose:\n      - \'6379\'');
    expect(redisBlock).not.toMatch(/ports:\s*\n\s*-\s*['"]?6379:6379/); // Zero public host binding

    // no-new-privileges flag
    const noNewPrivilegesCount = (content.match(/no-new-privileges:true/g) || []).length;
    expect(noNewPrivilegesCount).toBeGreaterThanOrEqual(4); // All 4 services protected
  });

  it('4. Verifies infra/proxy/memoir.conf enforces TLS 1.3, strict security headers, and asset caching', () => {
    const proxyConfPath = path.join(rootDir, 'infra/proxy/memoir.conf');
    expect(fs.existsSync(proxyConfPath)).toBe(true);

    const content = fs.readFileSync(proxyConfPath, 'utf-8');

    // TLS 1.3 / hardened 1.2
    expect(content).toContain('ssl_protocols TLSv1.2 TLSv1.3;');
    expect(content).toContain('ssl_prefer_server_ciphers on;');

    // HTTP to HTTPS redirect
    expect(content).toContain('return 301 https://$host$request_uri;');

    // Strict Security Headers
    expect(content).toContain('Content-Security-Policy');
    expect(content).toContain('Strict-Transport-Security');
    expect(content).toContain('X-Content-Type-Options "nosniff"');
    expect(content).toContain('X-Frame-Options "DENY"');
    expect(content).toContain('Referrer-Policy "no-referrer"');
    expect(content).toContain('Cross-Origin-Opener-Policy "same-origin"');
    expect(content).toContain('Cross-Origin-Resource-Policy "same-origin"');

    // Hashed static assets caching
    expect(content).toMatch(/expires 1y;/);
    expect(content).toMatch(/Cache-Control "public, max-age=31536000, immutable"/);

    // Proxy pass to API port 4000
    expect(content).toContain('proxy_pass http://api:4000;');
  });
});
