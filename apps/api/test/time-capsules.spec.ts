import type { INestApplication } from '@nestjs/common';
import { HttpStatus, ValidationPipe } from '@nestjs/common';
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

describe('Time Capsules: Server Withholding & HTTP 423 Locked Enforcement', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let config: AppConfigService;

  const testEmail = `capsule-test-${Date.now()}@example.com`;
  const userPassword = 'CorrectMasterPassword123!@#';
  let userId: string;
  let sessionCookie: string;
  let csrfCookie: string;
  let csrfToken: string;

  let lockedCapsuleId: string;
  let unlockedCapsuleId: string;

  const sensitiveCiphertext = 'c2VhbGVkLXRpbWUtY2Fwc3VsZS1jaXBoZXJ0ZXh0LXNlY3JldA==';
  const sensitiveNonce = 'c2VhbGVkLW5vbmNlLTEyMw==';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    config = app.get(AppConfigService);
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

    // Register user
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('X-Forwarded-For', '198.51.100.99')
      .send({
        email: testEmail,
        password: userPassword,
      });

    // Verify email directly
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    if (!user) throw new Error('User creation failed');
    userId = user.id;

    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });

    // Login user
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.99')
      .send({
        email: testEmail,
        password: userPassword,
      });

    const cookies = loginRes.headers['set-cookie'] as unknown as string[];
    const sessionCookieHeader = cookies.find((c) => c.startsWith('memoir_session='));
    const csrfCookieHeader = cookies.find((c) => c.startsWith('XSRF-TOKEN='));

    sessionCookie = sessionCookieHeader?.split(';')[0] || '';
    csrfCookie = csrfCookieHeader?.split(';')[0] || '';
    csrfToken = csrfCookie.replace('XSRF-TOKEN=', '');
  });

  afterAll(async () => {
    if (userId) {
      await prisma.memory.deleteMany({ where: { userId } });
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  it('1. Creates sealed Time Capsule with future unlock date', async () => {
    lockedCapsuleId = crypto.randomUUID();
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365); // 1 year in future

    const res = await request(app.getHttpServer())
      .post('/api/v1/memories')
      .set('Cookie', [sessionCookie, csrfCookie])
      .set('Origin', 'http://localhost:5173')
      .set('x-csrf-token', csrfToken)
      .send({
        id: lockedCapsuleId,
        entryDate: new Date().toISOString(),
        isPinned: false,
        isTimeCapsule: true,
        unlockAt: futureDate.toISOString(),
        envelopeVersion: 1,
        algorithm: 'AES-256-GCM',
        ciphertext: sensitiveCiphertext,
        nonce: sensitiveNonce,
      });

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(lockedCapsuleId);
    expect(res.body.data.isTimeCapsule).toBe(true);
  });

  it('2. Omits ciphertext and nonce in GET /api/v1/memories list for sealed time capsule', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/memories')
      .set('Cookie', [sessionCookie])
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.success).toBe(true);

    const list = res.body.data as Array<{
      id: string;
      isLockedTimeCapsule?: boolean;
      ciphertext?: string;
      nonce?: string;
    }>;
    const capsule = list.find((m) => m.id === lockedCapsuleId);
    expect(capsule).toBeDefined();
    expect(capsule?.isLockedTimeCapsule).toBe(true);
    // CRITICAL: Server withholds ciphertext and nonce entirely from list response
    expect(capsule?.ciphertext).toBeUndefined();
    expect(capsule?.nonce).toBeUndefined();
  });

  it('3. Returns HTTP 423 Locked on GET /api/v1/memories/:id while unlockAt is in the future', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/memories/${lockedCapsuleId}`)
      .set('Cookie', [sessionCookie])
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(HttpStatus.LOCKED); // 423
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Time Capsule is sealed');
    // Ensure ciphertext and nonce are never leaked in error response
    expect(res.text).not.toContain(sensitiveCiphertext);
    expect(res.text).not.toContain(sensitiveNonce);
  });

  it('4. Delivers full ciphertext and HTTP 200 OK once unlockAt has passed', async () => {
    unlockedCapsuleId = crypto.randomUUID();
    const pastDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour in past

    await request(app.getHttpServer())
      .post('/api/v1/memories')
      .set('Cookie', [sessionCookie, csrfCookie])
      .set('Origin', 'http://localhost:5173')
      .set('x-csrf-token', csrfToken)
      .send({
        id: unlockedCapsuleId,
        entryDate: new Date().toISOString(),
        isPinned: false,
        isTimeCapsule: true,
        unlockAt: pastDate.toISOString(),
        envelopeVersion: 1,
        algorithm: 'AES-256-GCM',
        ciphertext: sensitiveCiphertext,
        nonce: sensitiveNonce,
      });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/memories/${unlockedCapsuleId}`)
      .set('Cookie', [sessionCookie])
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ciphertext).toBe(sensitiveCiphertext);
    expect(res.body.data.nonce).toBe(sensitiveNonce);
    expect(res.body.data.isLockedTimeCapsule).toBe(false);
  });
});
