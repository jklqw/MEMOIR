import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  createAndAuthenticateUser,
  createSecurityTestApp,
  type TestUserAuth,
} from './security-test-helper.js';

describe('Security Regression Suite — CSRF Enforcement & Security Headers', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let user: TestUserAuth;

  beforeAll(async () => {
    const initialized = await createSecurityTestApp();
    app = initialized.app;
    prisma = initialized.prisma;

    user = await createAndAuthenticateUser(app, prisma, 'csrf-hdr-user');
  });

  afterAll(async () => {
    if (user?.userId) {
      await prisma.user.deleteMany({
        where: { id: user.userId },
      });
    }
    await app.close();
  });

  describe('1. CSRF Token Issuance & Validation', () => {
    it('issues fresh 64-character CSRF token and sets SameSite=Strict cookie', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/csrf');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.csrfToken).toMatch(/^[0-9a-f]{64}$/);

      const setCookies = (res.headers['set-cookie'] as unknown as string[]) || [];
      expect(setCookies.some((c) => c.startsWith('XSRF-TOKEN='))).toBe(true);
      expect(setCookies.some((c) => c.includes('SameSite=Strict'))).toBe(true);
    });

    it('rejects cookie-authenticated mutation when X-CSRF-Token header is missing (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/memories')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [user.sessionCookie, user.csrfCookie])
        // Missing x-csrf-token header
        .send({
          entryDate: new Date().toISOString(),
          ciphertext: 'dGVzdA==',
          nonce: 'bm9uY2U=',
        });

      expect(res.status).toBe(403);
      expect(res.body.error?.message).toMatch(/missing x-csrf-token header/i);
    });

    it('rejects cookie-authenticated mutation when X-CSRF-Token is tampered (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/memories')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [user.sessionCookie, user.csrfCookie])
        .set('x-csrf-token', 'tampered-csrf-token-000000000000000000000000000000000000000000000000')
        .send({
          entryDate: new Date().toISOString(),
          ciphertext: 'dGVzdA==',
          nonce: 'bm9uY2U=',
        });

      expect(res.status).toBe(403);
      expect(res.body.error?.message).toMatch(/invalid x-csrf-token/i);
    });

    it('rejects cookie-authenticated mutation from untrusted Origin (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/memories')
        .set('Origin', 'https://malicious-phishing-attacker.com')
        .set('Cookie', [user.sessionCookie, user.csrfCookie])
        .set('x-csrf-token', user.csrfToken)
        .send({
          entryDate: new Date().toISOString(),
          ciphertext: 'dGVzdA==',
          nonce: 'bm9uY2U=',
        });

      expect(res.status).toBe(403);
      expect(res.body.error?.message).toMatch(/missing or untrusted origin/i);
    });

    it('rejects cookie-authenticated mutation with missing Origin and Referer (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/memories')
        .set('Cookie', [user.sessionCookie, user.csrfCookie])
        .set('x-csrf-token', user.csrfToken)
        .send({
          entryDate: new Date().toISOString(),
          ciphertext: 'dGVzdA==',
          nonce: 'bm9uY2U=',
        });

      expect(res.status).toBe(403);
      expect(res.body.error?.message).toMatch(/missing or untrusted origin \/ referer/i);
    });

    it('permits cookie-authenticated mutation with valid Origin and matching X-CSRF-Token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/memories')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [user.sessionCookie, user.csrfCookie])
        .set('x-csrf-token', user.csrfToken)
        .send({
          id: crypto.randomUUID(),
          entryDate: new Date().toISOString(),
          ciphertext: 'dmFsaWQtY2lwaGVydGV4dA==',
          nonce: 'dmFsaWQtbm9uY2UtMTI=',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('exempts safe read-only methods (GET) from CSRF checks even with session cookie', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', [user.sessionCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(user.email);
    });
  });

  describe('2. Security Headers & Defense-in-Depth', () => {
    it('enforces strict Content-Security-Policy (CSP) headers', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health');

      const csp = res.headers['content-security-policy'];
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
    });

    it('enforces Strict-Transport-Security (HSTS) with 1-year max-age, subdomains, and preload', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health');

      const hsts = res.headers['strict-transport-security'];
      expect(hsts).toBeDefined();
      expect(hsts).toContain('max-age=31536000');
      expect(hsts).toContain('includeSubDomains');
      expect(hsts).toContain('preload');
    });

    it('enforces anti-sniffing and anti-framing headers (nosniff, DENY, no-referrer)', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
    });

    it('enforces Permissions-Policy restricting sensitive browser hardware', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health');

      const permissions = res.headers['permissions-policy'];
      expect(permissions).toBeDefined();
      expect(permissions).toContain('camera=()');
      expect(permissions).toContain('microphone=()');
      expect(permissions).toContain('geolocation=()');
      expect(permissions).toContain('payment=()');
      expect(permissions).toContain('usb=()');
    });

    it('enforces Cross-Origin-Opener-Policy and Cross-Origin-Resource-Policy as same-origin', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health');

      expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
      expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    });

    it('permits allowlisted CORS origins with credentials enabled', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/v1/health')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET');

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('rejects unlisted CORS origins by omitting CORS headers', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/v1/health')
        .set('Origin', 'https://malicious-external-domain.com')
        .set('Access-Control-Request-Method', 'GET');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('hides backend implementation framework (no X-Powered-By header)', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health');

      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });
});
