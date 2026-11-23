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
import { RedisService } from '../src/redis/redis.service.js';

describe('Proxy-Aware Rate Limiting & Exponential Account Lockout Verification', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  const testEmail = `ratelimit-${Date.now()}@example.com`;
  const testPassword = 'Password123!@#SecurePassphrase';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    const config = app.get(AppConfigService);
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    setupSecurityMiddleware(app, config);

    // Trust first proxy for accurate X-Forwarded-For resolution
    const expressApp = app.getHttpAdapter().getInstance();
    if (typeof expressApp?.set === 'function') {
      expressApp.set('trust proxy', 1);
    }

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

    // Register test user
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: testEmail, password: testPassword });

    await prisma.user.update({
      where: { email: testEmail },
      data: { emailVerifiedAt: new Date() },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  describe('Rate Limiting & Throttler Tiers', () => {
    it('1. Exempts health check probes from rate limiting via @SkipThrottle', async () => {
      // Send 20 rapid requests to /health
      for (let i = 0; i < 20; i++) {
        const res = await request(app.getHttpServer()).get('/api/v1/health');
        expect(res.status).toBe(200);
      }
    });

    it('2. Enforces strict auth tier rate limits (10/min) and returns 429 with Retry-After', async () => {
      const uniqueIp = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;
      let lastResponse: request.Response | null = null;

      // 10 requests allowed, 11th triggers 429
      for (let i = 1; i <= 12; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', uniqueIp)
          .send({ email: 'nonexistent@example.com', password: 'InvalidPassword123!' });

        lastResponse = res;
        if (res.status === 429) {
          break;
        }
      }

      expect(lastResponse).not.toBeNull();
      expect(lastResponse!.status).toBe(429);
      expect(lastResponse!.headers['retry-after']).toBeDefined();
      expect(lastResponse!.body.error.message).toMatch(/Rate limit exceeded|Too many requests/i);
    });

    it('3. Isolates rate limits by client IP via proxy-aware X-Forwarded-For header', async () => {
      const distinctIp = `203.0.113.${Math.floor(Math.random() * 200) + 10}`;

      // A request from a fresh, distinct IP should NOT be blocked by the previous IP's limits
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', distinctIp)
        .send({ email: 'nonexistent@example.com', password: 'InvalidPassword123!' });

      expect(res.status).toBe(401); // 401 Unauthorized, NOT 429 Rate limited
    });

    it('4. Persists rate limit tracking keys in Redis with expiration', async () => {
      const client = redis.getClient();
      if (client) {
        const keys = await client.keys('memoir:throttle:*');
        expect(keys.length).toBeGreaterThan(0);
        const ttl = await client.pttl(keys[0]!);
        expect(ttl).toBeGreaterThan(0);
      }
    });
  });

  describe('Exponential Account Lockout Defenses', () => {
    it('5. Triggers exponential lockout and logs LOCKOUT_TRIGGERED on 5 consecutive failures', async () => {
      const lockoutUserEmail = `lockout-exp-${Date.now()}@example.com`;
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: lockoutUserEmail, password: testPassword });

      await prisma.user.update({
        where: { email: lockoutUserEmail },
        data: { emailVerifiedAt: new Date() },
      });

      const dedicatedIp = `192.0.2.${Math.floor(Math.random() * 200) + 10}`;

      // 5 consecutive wrong password attempts
      for (let i = 1; i <= 5; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', dedicatedIp)
          .send({ email: lockoutUserEmail, password: 'WrongPassword123!' });

        expect(res.status).toBe(401);
      }

      // Check DB state for exponential lockout
      const user = await prisma.user.findUnique({ where: { email: lockoutUserEmail } });
      expect(user).toBeDefined();
      expect(user!.failedLoginAttempts).toBe(5);
      expect(user!.lockedUntil).not.toBeNull();

      const lockDurationMs = new Date(user!.lockedUntil!).getTime() - Date.now();
      expect(lockDurationMs).toBeGreaterThan(14 * 60 * 1000); // Minimum 15-minute lock

      // 6th attempt with correct password fails closed due to active lockout
      const lockedRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', dedicatedIp)
        .send({ email: lockoutUserEmail, password: testPassword });

      expect(lockedRes.status).toBe(401);
      expect(lockedRes.body.error.message).toContain('Account is temporarily locked');

      // Verify LOCKOUT_TRIGGERED security event
      const events = await prisma.securityEvent.findMany({
        where: { userId: user!.id, eventType: 'LOCKOUT_TRIGGERED' },
      });
      expect(events.length).toBeGreaterThan(0);
      expect((events[0]!.safeMetadata as Record<string, unknown>).failedAttempts).toBe(5);

      await prisma.user.deleteMany({ where: { email: lockoutUserEmail } });
    });

    it('6. Resets failed attempts and unlocks account upon successful login', async () => {
      const resetUserEmail = `lockout-reset-${Date.now()}@example.com`;
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: resetUserEmail, password: testPassword });

      await prisma.user.update({
        where: { email: resetUserEmail },
        data: { emailVerifiedAt: new Date(), failedLoginAttempts: 3 },
      });

      const uniqueIp = `198.18.0.${Math.floor(Math.random() * 200) + 10}`;

      // Successful login resets failed attempts
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', uniqueIp)
        .send({ email: resetUserEmail, password: testPassword });

      expect(loginRes.status).toBe(200);

      const userAfter = await prisma.user.findUnique({ where: { email: resetUserEmail } });
      expect(userAfter!.failedLoginAttempts).toBe(0);
      expect(userAfter!.lockedUntil).toBeNull();

      await prisma.user.deleteMany({ where: { email: resetUserEmail } });
    });
  });
});
