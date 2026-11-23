import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { CsrfGuard } from '../src/common/guards/csrf.guard.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { setupSecurityMiddleware } from '../src/common/security/security-headers.js';
import { AppConfigService } from '../src/config/config.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Security Audit, Log Redaction & Threat Heuristics', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const userAEmail = `audit_user_a_${Date.now()}@example.com`;
  const userBEmail = `audit_user_b_${Date.now()}@example.com`;
  const userPassword = 'TestPassword123!@#';

  let userAId: string;
  let userBId: string;
  let userASessionCookie: string;
  let userACsrfCookie: string;
  let userACsrfToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    const config = app.get(AppConfigService);
    prisma = app.get(PrismaService);

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
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();

    // Register User A
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: userAEmail, password: userPassword });

    const userA = await prisma.user.findUnique({ where: { email: userAEmail } });
    expect(userA).toBeDefined();
    userAId = userA!.id;

    // Verify User A email
    await prisma.user.update({
      where: { id: userAId },
      data: { emailVerifiedAt: new Date() },
    });

    // Register User B
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: userBEmail, password: userPassword });

    const userB = await prisma.user.findUnique({ where: { email: userBEmail } });
    expect(userB).toBeDefined();
    userBId = userB!.id;

    await prisma.user.update({
      where: { id: userBId },
      data: { emailVerifiedAt: new Date() },
    });

    // Initial Login for User A (Device: Chrome/Mac, IP: 198.51.100.1)
    const loginResA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0')
      .set('X-Forwarded-For', '198.51.100.1')
      .send({ email: userAEmail, password: userPassword });

    expect(loginResA.status).toBe(200);

    const cookies = loginResA.headers['set-cookie'] as unknown as string[];
    userASessionCookie = cookies.find((c) => c.startsWith('memoir_session='))!;
    userACsrfCookie = cookies.find((c) => c.startsWith('XSRF-TOKEN='))!;
    userACsrfToken = decodeURIComponent(userACsrfCookie.split(';')[0].split('=')[1]);
  });

  afterAll(async () => {
    await prisma.securityEvent.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.userVault.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await app.close();
  });

  describe('1. Pino Logger Secret Redaction', () => {
    it('strictly redacts sensitive headers, passwords, tokens, recovery keys, and ciphertexts', () => {
      let loggedOutput = '';
      const dest = new Writable({
        write(chunk, _encoding, callback) {
          loggedOutput += chunk.toString();
          callback();
        },
      });

      // Instantiate logger using the exact AppModule redact configuration
      const testLogger = pino(
        {
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-csrf-token"]',
              'res.headers["set-cookie"]',
              '*.password',
              '*.currentPassword',
              '*.newPassword',
              '*.passphrase',
              '*.token',
              '*.refreshToken',
              '*.totpCode',
              '*.totpSecret',
              '*.backupCode',
              '*.backupCodes',
              '*.recoveryKey',
              '*.recoveryKeyFingerprint',
              '*.ciphertext',
              '*.wrappedDek',
              '*.wrappedFileKey',
              '*.encryptedMeta',
              '*.titleCiphertext',
              '*.bodyCiphertext',
              '*.tagsCiphertext',
              '*.moodCiphertext',
              '*.attachmentMetaCiphertext',
            ],
            censor: '[REDACTED_SECRET]',
          },
        },
        dest,
      );

      const secretPayload = {
        req: {
          headers: {
            authorization: 'Bearer super-secret-bearer-token-12345',
            cookie: 'memoir_session=sensitive_cookie_999; XSRF-TOKEN=csrf_secret_abc',
            'x-csrf-token': 'csrf_header_secret_xyz',
          },
        },
        res: {
          headers: {
            'set-cookie': 'memoir_session=rotated_secret_cookie_777; Path=/; HttpOnly',
          },
        },
        body: {
          password: 'TopSecretUserPassword!42',
          currentPassword: 'OldSecretPassword!11',
          newPassword: 'BrandNewSecretPassword!99',
          passphrase: 'MasterVaultPassphraseCannotBeLeaked',
          token: 'sensitive-oauth-or-reset-token-555',
          refreshToken: 'secret-refresh-token-888',
          totpCode: '654321',
          totpSecret: 'MFRGGZDFMY2TGMRV',
          backupCode: '9876-5432',
          backupCodes: ['1111-2222', '3333-4444'],
          recoveryKey: 'CROCKFORD-BASE32-RECOVERY-KEY-256BIT',
          recoveryKeyFingerprint: 'sha256:fingerprint_hash_cannot_leak',
          ciphertext: 'opaque-aes-256-gcm-ciphertext-payload-content',
          wrappedDek: 'wrapped-data-encryption-key-blob',
          wrappedFileKey: 'wrapped-attachment-file-key-blob',
          encryptedMeta: 'encrypted-file-metadata-blob',
          titleCiphertext: 'encrypted-diary-title-blob',
          bodyCiphertext: 'encrypted-diary-body-markdown-blob',
          tagsCiphertext: 'encrypted-diary-tags-blob',
          moodCiphertext: 'encrypted-diary-mood-blob',
          attachmentMetaCiphertext: 'encrypted-attachment-metadata-blob',
        },
      };

      testLogger.info(secretPayload, 'Request processing audit test');

      // Assert that none of the raw secrets exist in the serialized log
      expect(loggedOutput).not.toContain('super-secret-bearer-token-12345');
      expect(loggedOutput).not.toContain('sensitive_cookie_999');
      expect(loggedOutput).not.toContain('csrf_secret_abc');
      expect(loggedOutput).not.toContain('csrf_header_secret_xyz');
      expect(loggedOutput).not.toContain('rotated_secret_cookie_777');
      expect(loggedOutput).not.toContain('TopSecretUserPassword!42');
      expect(loggedOutput).not.toContain('OldSecretPassword!11');
      expect(loggedOutput).not.toContain('BrandNewSecretPassword!99');
      expect(loggedOutput).not.toContain('MasterVaultPassphraseCannotBeLeaked');
      expect(loggedOutput).not.toContain('sensitive-oauth-or-reset-token-555');
      expect(loggedOutput).not.toContain('secret-refresh-token-888');
      expect(loggedOutput).not.toContain('654321');
      expect(loggedOutput).not.toContain('MFRGGZDFMY2TGMRV');
      expect(loggedOutput).not.toContain('9876-5432');
      expect(loggedOutput).not.toContain('1111-2222');
      expect(loggedOutput).not.toContain('CROCKFORD-BASE32-RECOVERY-KEY-256BIT');
      expect(loggedOutput).not.toContain('sha256:fingerprint_hash_cannot_leak');
      expect(loggedOutput).not.toContain('opaque-aes-256-gcm-ciphertext-payload-content');
      expect(loggedOutput).not.toContain('wrapped-data-encryption-key-blob');
      expect(loggedOutput).not.toContain('wrapped-attachment-file-key-blob');
      expect(loggedOutput).not.toContain('encrypted-file-metadata-blob');
      expect(loggedOutput).not.toContain('encrypted-diary-title-blob');
      expect(loggedOutput).not.toContain('encrypted-diary-body-markdown-blob');
      expect(loggedOutput).not.toContain('encrypted-diary-tags-blob');
      expect(loggedOutput).not.toContain('encrypted-diary-mood-blob');
      expect(loggedOutput).not.toContain('encrypted-attachment-metadata-blob');

      // Assert that redactions were placed
      expect(loggedOutput).toContain('[REDACTED_SECRET]');
    });
  });

  describe('2. Suspicious Login Detection Heuristics', () => {
    it('does not flag normal login from existing known device and IP', async () => {
      const initialCount = await prisma.securityEvent.count({
        where: { userId: userAId, eventType: 'SUSPICIOUS_LOGIN' },
      });

      // Login from same device and same IP as initial login
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0')
        .set('X-Forwarded-For', '198.51.100.1')
        .send({ email: userAEmail, password: userPassword });

      expect(res.status).toBe(200);

      const afterCount = await prisma.securityEvent.count({
        where: { userId: userAId, eventType: 'SUSPICIOUS_LOGIN' },
      });

      expect(afterCount).toBe(initialCount);
    });

    it('emits SUSPICIOUS_LOGIN on login from a new, unrecognized device', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set(
          'User-Agent',
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
        )
        .set('X-Forwarded-For', '198.51.100.1') // Same IP, but new device
        .send({ email: userAEmail, password: userPassword });

      expect(res.status).toBe(200);

      const suspiciousEvent = await prisma.securityEvent.findFirst({
        where: {
          userId: userAId,
          eventType: 'SUSPICIOUS_LOGIN',
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(suspiciousEvent).toBeDefined();
      const meta = suspiciousEvent!.safeMetadata as Record<string, unknown>;
      const reasons = meta.reasons as string[];
      expect(reasons.some((r) => r.toLowerCase().includes('device'))).toBe(true);
    });

    it('emits SUSPICIOUS_LOGIN on login from a new IP network subnet', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0') // Known device
        .set('X-Forwarded-For', '203.0.113.88') // Brand new IP subnet
        .send({ email: userAEmail, password: userPassword });

      expect(res.status).toBe(200);

      const suspiciousEvent = await prisma.securityEvent.findFirst({
        where: {
          userId: userAId,
          eventType: 'SUSPICIOUS_LOGIN',
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(suspiciousEvent).toBeDefined();
      const meta = suspiciousEvent!.safeMetadata as Record<string, unknown>;
      const reasons = meta.reasons as string[];
      expect(
        reasons.some((r) => r.toLowerCase().includes('ip') || r.toLowerCase().includes('network')),
      ).toBe(true);
    });

    it('emits SUSPICIOUS_LOGIN on login succeeding after failed attempts', async () => {
      // 1. Fail twice
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '198.51.100.1')
        .send({ email: userAEmail, password: 'WrongPassword1!' });

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '198.51.100.1')
        .send({ email: userAEmail, password: 'WrongPassword2!' });

      const userAfterFails = await prisma.user.findUnique({ where: { id: userAId } });
      expect(userAfterFails!.failedLoginAttempts).toBe(2);

      // 2. Succeed on next attempt from known device and IP
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0')
        .set('X-Forwarded-For', '198.51.100.1')
        .send({ email: userAEmail, password: userPassword });

      expect(res.status).toBe(200);

      const suspiciousEvent = await prisma.securityEvent.findFirst({
        where: {
          userId: userAId,
          eventType: 'SUSPICIOUS_LOGIN',
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(suspiciousEvent).toBeDefined();
      const meta = suspiciousEvent!.safeMetadata as Record<string, unknown>;
      const reasons = meta.reasons as string[];
      expect(reasons.some((r) => r.toLowerCase().includes('failed attempt'))).toBe(true);
    });
  });

  describe('3. Security Audit Log API & IDOR Scoping', () => {
    it('rejects unauthenticated requests to /api/v1/audit/events with 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/audit/events');
      expect(res.status).toBe(401);
    });

    it('returns strictly user-scoped security events and supports eventType filtering', async () => {
      // Create a specific event for User B
      await prisma.securityEvent.create({
        data: {
          userId: userBId,
          eventType: 'VAULT_CREATED',
          safeMetadata: { note: 'UserB Vault Secret Event' },
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/audit/events')
        .set('Cookie', [userASessionCookie, userACsrfCookie])
        .set('X-CSRF-Token', userACsrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.events)).toBe(true);

      const events = res.body.data.events as Array<{
        id: string;
        eventType: string;
        safeMetadata: Record<string, unknown>;
      }>;

      // Ensure User B events are never returned (IDOR prevention)
      for (const ev of events) {
        expect(ev.safeMetadata?.note).not.toBe('UserB Vault Secret Event');
      }

      // Filter by SUSPICIOUS_LOGIN
      const filterRes = await request(app.getHttpServer())
        .get('/api/v1/audit/events?eventType=SUSPICIOUS_LOGIN')
        .set('Cookie', [userASessionCookie, userACsrfCookie])
        .set('X-CSRF-Token', userACsrfToken);

      expect(filterRes.status).toBe(200);
      const filteredEvents = filterRes.body.data.events as Array<{ eventType: string }>;
      for (const ev of filteredEvents) {
        expect(ev.eventType).toBe('SUSPICIOUS_LOGIN');
      }
    });

    it('supports pagination via limit and offset parameters', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit/events?limit=2&offset=0')
        .set('Cookie', [userASessionCookie, userACsrfCookie])
        .set('X-CSRF-Token', userACsrfToken);

      expect(res.status).toBe(200);
      expect(res.body.data.events.length).toBeLessThanOrEqual(2);
      expect(res.body.data.limit).toBe(2);
      expect(res.body.data.offset).toBe(0);
      expect(res.body.data.total).toBeGreaterThan(0);
    });
  });

  describe('4. Security Posture Evaluation API', () => {
    it('evaluates security posture checklist correctly for active user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit/posture')
        .set('Cookie', [userASessionCookie, userACsrfCookie])
        .set('X-CSRF-Token', userACsrfToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const posture = res.body.data;
      expect(posture.emailVerified).toBe(true);
      expect(typeof posture.vaultConfigured).toBe('boolean');
      expect(typeof posture.totpEnabled).toBe('boolean');
      expect(typeof posture.passkeyCount).toBe('number');
      expect(typeof posture.activeSessionCount).toBe('number');
      expect(posture.activeSessionCount).toBeGreaterThan(0);
      expect(['strong', 'good', 'action_needed']).toContain(posture.overallScore);
      expect(Array.isArray(posture.checks)).toBe(true);
      expect(posture.checks.length).toBeGreaterThan(0);
    });
  });
});
