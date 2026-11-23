import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { setupSecurityMiddleware } from '../src/common/security/security-headers.js';
import { AppConfigService } from '../src/config/config.service.js';

describe('Security Headers, Strict CSP, HSTS & CORS Verification', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    const config = app.get(AppConfigService);
    setupSecurityMiddleware(app, config);
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Enforces strict Content-Security-Policy (CSP) headers', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');

    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it('2. Enforces Strict-Transport-Security (HSTS) header with 1 year max-age and preload', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');

    const hsts = res.headers['strict-transport-security'];
    expect(hsts).toBeDefined();
    expect(hsts).toContain('max-age=31536000');
    expect(hsts).toContain('includeSubDomains');
    expect(hsts).toContain('preload');
  });

  it('3. Enforces X-Content-Type-Options: nosniff to prevent MIME sniffing', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('4. Enforces Referrer-Policy: no-referrer to protect against privacy leaks', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');

    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('5. Enforces X-Frame-Options: DENY and frame-ancestors none against clickjacking', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');

    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  it('6. Enforces Permissions-Policy restricting sensitive browser hardware', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');

    const permissions = res.headers['permissions-policy'];
    expect(permissions).toBeDefined();
    expect(permissions).toContain('camera=()');
    expect(permissions).toContain('microphone=()');
    expect(permissions).toContain('geolocation=()');
    expect(permissions).toContain('payment=()');
    expect(permissions).toContain('usb=()');
  });

  it('7. Enforces Cross-Origin-Opener-Policy and Cross-Origin-Resource-Policy', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');

    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  it('8. Permits allowlisted CORS origins with credentials enabled', async () => {
    const res = await request(app.getHttpServer())
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('9. Rejects unlisted or untrusted CORS origins', async () => {
    const res = await request(app.getHttpServer())
      .options('/api/v1/health')
      .set('Origin', 'http://malicious-attacker-domain.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
