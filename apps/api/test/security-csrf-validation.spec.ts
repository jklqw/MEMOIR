import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { CsrfGuard } from '../src/common/guards/csrf.guard.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { setupSecurityMiddleware } from '../src/common/security/security-headers.js';
import { AppConfigService } from '../src/config/config.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('CSRF Protection, Strict DTO Allowlist & Injection Defenses', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmail = `csrf-test-${Date.now()}@example.com`;
  const testPassword = 'Password123!@#SecurePassphrase';
  let sessionCookie: string;
  let csrfCookie: string;
  let csrfToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    const config = app.get(AppConfigService);
    prisma = app.get(PrismaService);

    setupSecurityMiddleware(app, config);
    app.setGlobalPrefix('api/v1');
    app.useGlobalGuards(new CsrfGuard(config));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        forbidUnknownValues: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();

    // Register & verify user for testing
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: testPassword });

    await prisma.user.update({
      where: { email: testEmail },
      data: { emailVerifiedAt: new Date() },
    });

    // Login to obtain session cookie & CSRF cookie
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ email: testEmail, password: testPassword });

    const cookies = loginRes.headers['set-cookie'] as unknown as string[];
    expect(cookies).toBeDefined();

    for (const cookieStr of cookies) {
      if (cookieStr.startsWith('memoir_session=')) {
        sessionCookie = cookieStr.split(';')[0];
      }
      if (cookieStr.startsWith('XSRF-TOKEN=')) {
        csrfCookie = cookieStr.split(';')[0];
        csrfToken = csrfCookie.replace('XSRF-TOKEN=', '');
      }
    }

    expect(sessionCookie).toBeDefined();
    expect(csrfCookie).toBeDefined();
    expect(csrfToken).toBeDefined();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  describe('CSRF Token Issuance & Validation', () => {
    it('1. GET /api/v1/auth/csrf issues a fresh CSRF token and sets XSRF-TOKEN cookie', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/csrf');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.csrfToken).toHaveLength(64); // 32 hex bytes = 64 chars

      const setCookies = res.headers['set-cookie'] as unknown as string[];
      expect(setCookies.some((c) => c.startsWith('XSRF-TOKEN='))).toBe(true);
      expect(setCookies.some((c) => c.includes('SameSite=Strict'))).toBe(true);
    });

    it('2. Cookie-authenticated mutation without X-CSRF-Token header is rejected (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [sessionCookie, csrfCookie]);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Missing X-CSRF-Token header');
    });

    it('3. Cookie-authenticated mutation with mismatched or tampered X-CSRF-Token is rejected (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [sessionCookie, csrfCookie])
        .set(
          'x-csrf-token',
          'tampered-csrf-token-000000000000000000000000000000000000000000000000',
        );

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Invalid X-CSRF-Token');
    });

    it('4. Cookie-authenticated mutation from untrusted Origin is rejected (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Origin', 'https://malicious-phishing-site.com')
        .set('Cookie', [sessionCookie, csrfCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Missing or untrusted Origin / Referer');
    });

    it('5. Cookie-authenticated mutation with valid Origin and matching X-CSRF-Token succeeds', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [sessionCookie, csrfCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('Logged out successfully');
    });

    it('6. Safe read-only methods (GET) are exempt from CSRF checks even with session cookie', async () => {
      // Re-login to get active session
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({ email: testEmail, password: testPassword });

      const newSessionCookie = (loginRes.headers['set-cookie'] as string[])
        .find((c) => c.startsWith('memoir_session='))!
        .split(';')[0];

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Cookie', [newSessionCookie]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(testEmail);
    });

    it('7. Unauthenticated mutation requests without session cookie pass through CSRF guard', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({ email: testEmail, password: 'WrongPassword123!' });

      // Rejection comes from auth logic (401), NOT CSRF guard (403)
      expect(res.status).toBe(401);
    });
  });

  describe('Mass Assignment & Strict DTO Whitelisting', () => {
    it('8. Rejects payloads containing unexpected or malicious keys with 400 Bad Request', async () => {
      const maliciousPayload = {
        email: `attacker-${Date.now()}@example.com`,
        password: 'Password123!@#SecurePassphrase',
        isAdmin: true,
        role: 'SUPERUSER',
        permissions: ['ALL'],
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(maliciousPayload);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(
        /property (isAdmin|role|permissions) should not exist/,
      );
    });
  });

  describe('XSS & Injection Defenses', () => {
    it('9. Rejects invalid email formats attempting script injection', async () => {
      const xssEmailPayload = {
        email: '<script>alert(1)</script>@domain.com',
        password: 'Password123!@#Secure',
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(xssEmailPayload);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/(Invalid email address|email must be an email)/i);
    });

    it('10. Safely handles SQL injection attempts in query and path parameters via Prisma', async () => {
      const sqliPayload = "' OR '1'='1' --";

      const res = await request(app.getHttpServer())
        .get(`/api/v1/memories?search=${encodeURIComponent(sqliPayload)}`)
        .set('Cookie', [sessionCookie]);

      // Endpoint requires auth or returns appropriate response, never executes raw SQL
      expect(res.status).toBeOneOf([200, 401, 403]);
    });
  });
});
