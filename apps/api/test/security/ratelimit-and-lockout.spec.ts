import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  createAndAuthenticateUser,
  createSecurityTestApp,
  type TestUserAuth,
} from './security-test-helper.js';

describe('Security Regression Suite — Rate Limiting, Account Lockout & Session Replay Defenses', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUser: TestUserAuth;

  beforeAll(async () => {
    const initialized = await createSecurityTestApp();
    app = initialized.app;
    prisma = initialized.prisma;

    testUser = await createAndAuthenticateUser(app, prisma, 'rate-user');
  });

  afterAll(async () => {
    if (testUser?.userId) {
      await prisma.user.deleteMany({
        where: { id: testUser.userId },
      });
    }
    await app.close();
  });

  describe('1. Rate Limiting Defenses (429 & Retry-After)', () => {
    it('exempts health probes from throttling', async () => {
      for (let i = 0; i < 15; i++) {
        const res = await request(app.getHttpServer()).get('/api/v1/health');
        expect(res.status).toBe(200);
      }
    });

    it('enforces auth tier rate limiting and returns 429 Too Many Requests with Retry-After header', async () => {
      const throttledIp = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;
      let lastRes: request.Response | null = null;

      // 10 requests allowed, 11th triggers 429
      for (let i = 1; i <= 12; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', throttledIp)
          .send({ email: 'nonexistent@example.com', password: 'InvalidPassword123!' });

        lastRes = res;
        if (res.status === 429) {
          break;
        }
      }

      expect(lastRes).not.toBeNull();
      expect(lastRes!.status).toBe(429);
      expect(lastRes!.headers['retry-after']).toBeDefined();
      expect(lastRes!.body.error?.message).toMatch(/rate limit exceeded|too many requests/i);
    });

    it('isolates rate limiting by client IP address', async () => {
      const distinctIp = `203.0.113.${Math.floor(Math.random() * 200) + 10}`;

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', distinctIp)
        .send({ email: 'nonexistent@example.com', password: 'InvalidPassword123!' });

      // Clean fresh IP receives 401 Unauthorized, NOT 429
      expect(res.status).toBe(401);
    });
  });

  describe('2. Exponential Account Lockout Defenses', () => {
    it('locks account after 5 consecutive failed logins and rejects valid credentials', async () => {
      const lockoutEmail = `lockout-reg-${Date.now()}@example.com`;
      const correctPassword = 'Password123!@#Secure';

      // Register and verify
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: lockoutEmail, password: correctPassword });

      await prisma.user.update({
        where: { email: lockoutEmail },
        data: { emailVerifiedAt: new Date() },
      });

      const dedicatedIp = `192.0.2.${Math.floor(Math.random() * 200) + 10}`;

      // 5 consecutive wrong password attempts
      for (let i = 1; i <= 5; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', dedicatedIp)
          .send({ email: lockoutEmail, password: 'WrongPassword123!' });

        expect(res.status).toBe(401);
      }

      // Check user record: lockedUntil must be set
      const user = await prisma.user.findUnique({ where: { email: lockoutEmail } });
      expect(user).toBeDefined();
      expect(user!.failedLoginAttempts).toBe(5);
      expect(user!.lockedUntil).not.toBeNull();

      // 6th attempt with CORRECT password fails closed due to lockout
      const lockedRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', dedicatedIp)
        .send({ email: lockoutEmail, password: correctPassword });

      expect(lockedRes.status).toBe(401);
      expect(lockedRes.body.error?.message).toContain('Account is temporarily locked');

      // Verify LOCKOUT_TRIGGERED security event
      const events = await prisma.securityEvent.findMany({
        where: { userId: user!.id, eventType: 'LOCKOUT_TRIGGERED' },
      });
      expect(events.length).toBeGreaterThan(0);

      // Clean up
      await prisma.user.deleteMany({ where: { email: lockoutEmail } });
    });
  });

  describe('3. Refresh-Token Reuse Family Revocation', () => {
    it('detects token replay, revokes entire session family, and emits security alert', async () => {
      const replayEmail = `replay-test-${Date.now()}@example.com`;
      const replayPassword = 'Password123!@#Secure';

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: replayEmail, password: replayPassword });

      const replayUser = await prisma.user.update({
        where: { email: replayEmail },
        data: { emailVerifiedAt: new Date() },
      });

      // 1. Initial Login -> get session cookie token 1
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({ email: replayEmail, password: replayPassword });

      const loginCookies = (loginRes.headers['set-cookie'] as unknown as string[]) || [];
      const sessionCookie1 = loginCookies
        .find((c) => c.startsWith('memoir_session='))!
        .split(';')[0]!;
      const csrfCookie1 = loginCookies.find((c) => c.startsWith('XSRF-TOKEN='))!.split(';')[0]!;
      const csrfToken1 = csrfCookie1.replace('XSRF-TOKEN=', '');

      // 2. Legitimate Session Rotation: POST /api/v1/auth/refresh using token 1
      const refreshRes1 = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [sessionCookie1, csrfCookie1])
        .set('x-csrf-token', csrfToken1);

      expect(refreshRes1.status).toBe(200);

      const refreshCookies1 = (refreshRes1.headers['set-cookie'] as unknown as string[]) || [];
      const sessionCookie2 = refreshCookies1
        .find((c) => c.startsWith('memoir_session='))!
        .split(';')[0]!;
      const csrfCookie2 = refreshCookies1.find((c) => c.startsWith('XSRF-TOKEN='))!.split(';')[0]!;
      const csrfToken2 = csrfCookie2.replace('XSRF-TOKEN=', '');
      expect(sessionCookie2).not.toBe(sessionCookie1);

      // 3. ATTACK / REPLAY: Attacker tries to use already-rotated sessionCookie1
      const replayAttemptRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [sessionCookie1, csrfCookie1])
        .set('x-csrf-token', csrfToken1);

      expect(replayAttemptRes.status).toBe(401);
      expect(replayAttemptRes.body.error?.message).toContain(
        'Security warning: Session token reuse detected. All active sessions in this family have been revoked.',
      );

      // 4. Verify all sessions in that family have been revoked in DB
      const activeFamilySessions = await prisma.session.findMany({
        where: { userId: replayUser.id, revokedAt: null },
      });
      expect(activeFamilySessions.length).toBe(0);

      // 5. Subsequent refresh attempts by legitimate user with token 2 MUST also fail
      const legitimateSubsequentRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [sessionCookie2, csrfCookie2])
        .set('x-csrf-token', csrfToken2);

      expect(legitimateSubsequentRes.status).toBe(401);

      // 6. Verify security event was emitted
      const events = await prisma.securityEvent.findMany({
        where: {
          userId: replayUser.id,
          eventType: 'SUSPICIOUS_LOGIN',
        },
      });
      expect(events.length).toBeGreaterThan(0);

      // Clean up
      await prisma.user.deleteMany({ where: { email: replayEmail } });
    });
  });
});
