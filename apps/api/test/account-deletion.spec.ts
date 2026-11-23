import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { CsrfGuard } from '../src/common/guards/csrf.guard.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { setupSecurityMiddleware } from '../src/common/security/security-headers.js';
import { AppConfigService } from '../src/config/config.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { StorageService } from '../src/storage/storage.service.js';

describe('Deliberate Account Deletion & Cascading Purge Verification', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let config: AppConfigService;
  let storageService: StorageService;

  const testEmail = `del-test-${Date.now()}@example.com`;
  const userPassword = 'CorrectMasterPassword123!@#';
  let userId: string;
  let sessionCookie: string;
  let csrfCookie: string;
  let csrfToken: string;
  let testStorageKey: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    config = app.get(AppConfigService);
    prisma = app.get(PrismaService);
    storageService = app.get(StorageService);

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
      .send({ email: testEmail, password: userPassword });

    // Mark email verified
    const dbUser = await prisma.user.findUniqueOrThrow({ where: { email: testEmail } });
    userId = dbUser.id;
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });

    // Obtain CSRF token
    const csrfRes = await request(app.getHttpServer()).get('/api/v1/auth/csrf');
    const cookies = (csrfRes.headers['set-cookie'] as unknown as string[]) || [];
    for (const cookieStr of cookies) {
      if (cookieStr.startsWith('XSRF-TOKEN=')) {
        csrfCookie = cookieStr.split(';')[0] || '';
        csrfToken = csrfCookie.replace('XSRF-TOKEN=', '');
      }
    }

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.99')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ email: testEmail, password: userPassword });

    const loginCookies = (loginRes.headers['set-cookie'] as unknown as string[]) || [];
    for (const cookieStr of loginCookies) {
      if (cookieStr.startsWith('memoir_session=')) {
        sessionCookie = cookieStr.split(';')[0] || '';
      }
      if (cookieStr.startsWith('XSRF-TOKEN=')) {
        csrfCookie = cookieStr.split(';')[0] || '';
        csrfToken = csrfCookie.replace('XSRF-TOKEN=', '');
      }
    }

    // Seed dummy user vault
    await prisma.userVault.create({
      data: {
        userId,
        kdfAlgorithm: 'ARGON2ID',
        kdfSalt: 'dGVzdHNhbHQxMjM0NTY3ODkw',
        kdfMemory: 65536,
        kdfIterations: 3,
        kdfParallelism: 4,
        wrapAlgorithm: 'AES-256-GCM',
        envelopeVersion: 1,
        wrappedDek: 'd3JhcHBlZGRlazEyMzQ1Njc4OTA=',
        wrappedDekNonce: 'bm9uY2UxMjM0NTY3OA==',
        recoverySalt: 'cmVjb3ZlcnlzYWx0MTIzNDU2',
        recoveryWrappedDek: 'cmVjb3Zlcnl3cmFwcGVkZGVr',
        recoveryNonce: 'cmVjb3Zlcnlub25jZTEy',
        recoveryKeyFingerprint: 'TEST-FINGERPRINT-1234',
      },
    });

    // Seed dummy memory
    const memory = await prisma.memory.create({
      data: {
        userId,
        entryDate: new Date(),
        ciphertext: 'ZW5jcnlwdGVkLWRpYXJ5LWNvbnRlbnQ=',
        nonce: 'bm9uY2UtZGlhcnktMTIzNA==',
        envelopeVersion: 1,
        algorithm: 'AES-256-GCM',
      },
    });

    // Seed dummy attachment & create physical file in storage
    testStorageKey = `${crypto.randomUUID()}.enc`;
    await storageService.saveFile(testStorageKey, Buffer.from('CANARY_ATTACHMENT_BYTES'));

    await prisma.attachment.create({
      data: {
        userId,
        memoryId: memory.id,
        storageKey: testStorageKey,
        byteSize: 22,
        wrappedFileKey: 'd3JhcHBlZGZpbGVrZXkxMjM0',
        fileKeyNonce: 'ZmlsZWtleW5vbmNlMTI=',
        encryptedMetadata: 'ZW5jcnlwdGVkbWV0YWRhdGEx',
        metaNonce: 'bWV0YW5vbmNlMTIzNA==',
        fileNonce: 'ZmlsZW5vbmNlMTIzNA==',
      },
    });

    // Seed backup record
    await prisma.backup.create({
      data: {
        userId,
        checksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        entryCount: 1,
        byteSize: 1024,
      },
    });
  });

  afterAll(async () => {
    // Cleanup if anything lingered
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  it('1. Rejects unauthenticated account deletion with 401 Unauthorized', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api/v1/auth/account')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        password: userPassword,
        confirmation: 'DELETE MY ACCOUNT',
      });

    expect(res.status).toBe(401);
  });

  it('2. Rejects account deletion with incorrect password with 401 Unauthorized', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api/v1/auth/account')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', [sessionCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        password: 'WrongPassword999!',
        confirmation: 'DELETE MY ACCOUNT',
      });

    expect(res.status).toBe(401);
    expect(res.body.error?.message).toMatch(/incorrect password/i);
  });

  it('3. Rejects account deletion with mismatched confirmation phrase with 400 Bad Request', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api/v1/auth/account')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', [sessionCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        password: userPassword,
        confirmation: 'NO DO NOT DELETE',
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.message).toMatch(/confirmation string mismatch/i);
  });

  it('4. Successfully purges account, cascading database deletion and removing physical storage files', async () => {
    // Verify file exists on disk prior to deletion
    const storageDir = config.get('STORAGE_DIR');
    const diskPath = path.isAbsolute(storageDir)
      ? path.join(storageDir, testStorageKey)
      : path.join(process.cwd(), storageDir, testStorageKey);
    expect(fs.existsSync(diskPath)).toBe(true);

    const res = await request(app.getHttpServer())
      .delete('/api/v1/auth/account')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', [sessionCookie, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        password: userPassword,
        confirmation: 'DELETE MY ACCOUNT',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toMatch(/permanently deleted/i);
    expect(res.body.data.backupRetentionNotice).toMatch(/30-day/i);

    // 1. Verify physical file was purged from disk
    expect(fs.existsSync(diskPath)).toBe(false);

    // 2. Verify User record is completely deleted from PostgreSQL
    const deletedUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(deletedUser).toBeNull();

    // 3. Verify cascading delete wiped all related records
    const vault = await prisma.userVault.findFirst({ where: { userId } });
    expect(vault).toBeNull();

    const memories = await prisma.memory.findMany({ where: { userId } });
    expect(memories).toHaveLength(0);

    const attachments = await prisma.attachment.findMany({ where: { userId } });
    expect(attachments).toHaveLength(0);

    const backups = await prisma.backup.findMany({ where: { userId } });
    expect(backups).toHaveLength(0);

    const sessions = await prisma.session.findMany({ where: { userId } });
    expect(sessions).toHaveLength(0);

    // 4. Verify cookies were cleared in response
    const setCookies = (res.headers['set-cookie'] as unknown as string[]) || [];
    expect(setCookies.some((c: string) => c.includes('memoir_session=;'))).toBe(true);
    expect(setCookies.some((c: string) => c.includes('XSRF-TOKEN=;'))).toBe(true);
  });

  it('5. Confirms previous session cannot access authenticated endpoints after deletion', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', [sessionCookie]);

    expect(res.status).toBe(401);
  });
});
