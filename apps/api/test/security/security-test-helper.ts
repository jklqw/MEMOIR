import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter.js';
import { CsrfGuard } from '../../src/common/guards/csrf.guard.js';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor.js';
import { setupSecurityMiddleware } from '../../src/common/security/security-headers.js';
import { AppConfigService } from '../../src/config/config.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export interface TestUserAuth {
  userId: string;
  email: string;
  password: string;
  sessionCookie: string;
  csrfCookie: string;
  csrfToken: string;
  ip: string;
}

/**
 * Initializes a fully configured NestJS application with all security middleware,
 * global guards, validation pipes, filters, and interceptors matching production.
 */
export async function createSecurityTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
  config: AppConfigService;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  const config = app.get(AppConfigService);
  const prisma = app.get(PrismaService);

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

  return { app, prisma, config };
}

/**
 * Registers, auto-verifies email, and authenticates a test user via HTTP.
 * Uses a unique X-Forwarded-For IP address to prevent rate-limiting conflicts.
 * Returns cookies, tokens, and credentials.
 */
export async function createAndAuthenticateUser(
  app: INestApplication,
  prisma: PrismaService,
  emailPrefix = 'sec-user',
  password = 'Password123!@#SecurePassphrase',
): Promise<TestUserAuth> {
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 1000000);
  const email = `${emailPrefix}-${timestamp}-${randomSuffix}@example.com`;
  const uniqueIp = `10.${Math.floor(Math.random() * 240) + 10}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

  // 1. Register
  const regRes = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .set('X-Forwarded-For', uniqueIp)
    .send({ email, password });

  if (![200, 201].includes(regRes.status)) {
    throw new Error(`User registration failed (${regRes.status}): ${JSON.stringify(regRes.body)}`);
  }

  // 2. Mark email verified in DB
  const user = await prisma.user.update({
    where: { email },
    data: { emailVerifiedAt: new Date() },
  });

  // 3. Login to acquire session and CSRF cookies
  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', uniqueIp)
    .set('Origin', 'http://localhost:5173')
    .send({ email, password });

  if (loginRes.status !== 200) {
    throw new Error(`User login failed (${loginRes.status}): ${JSON.stringify(loginRes.body)}`);
  }

  const rawCookies = (loginRes.headers['set-cookie'] as unknown as string[]) || [];
  let sessionCookie = '';
  let csrfCookie = '';
  let csrfToken = '';

  for (const c of rawCookies) {
    if (c.startsWith('memoir_session=')) {
      sessionCookie = c.split(';')[0]!;
    }
    if (c.startsWith('XSRF-TOKEN=')) {
      csrfCookie = c.split(';')[0]!;
      csrfToken = csrfCookie.replace('XSRF-TOKEN=', '');
    }
  }

  return {
    userId: user.id,
    email,
    password,
    sessionCookie,
    csrfCookie,
    csrfToken,
    ip: uniqueIp,
  };
}

/**
 * Creates an encrypted memory for a user via the authenticated API.
 */
export async function createTestMemory(
  app: INestApplication,
  auth: TestUserAuth,
  overrides: Record<string, unknown> = {},
) {
  const payload = {
    id: crypto.randomUUID(),
    entryDate: new Date().toISOString(),
    isPinned: false,
    isTimeCapsule: false,
    envelopeVersion: 1,
    algorithm: 'AES-256-GCM',
    ciphertext: 'dGVzdC1lbmNyeXB0ZWQtbWVtb3J5LWJsb2Nrcw==',
    nonce: 'bm9uY2UtOTZiaXQtY3Nwcm5n',
    ...overrides,
  };

  const res = await request(app.getHttpServer())
    .post('/api/v1/memories')
    .set('X-Forwarded-For', auth.ip)
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', [auth.sessionCookie, auth.csrfCookie])
    .set('x-csrf-token', auth.csrfToken)
    .send(payload);

  return { response: res, memoryId: payload.id as string };
}

/**
 * Creates an encrypted attachment for a user via the authenticated API.
 */
export async function createTestAttachment(
  app: INestApplication,
  auth: TestUserAuth,
  overrides: Record<string, unknown> = {},
) {
  const payload = {
    id: crypto.randomUUID(),
    isVaultItem: false,
    wrappedFileKey: 'test-wrapped-file-key',
    fileKeyNonce: 'test-file-key-nonce',
    encryptedMetadata: 'test-encrypted-metadata',
    metaNonce: 'test-meta-nonce',
    fileNonce: 'test-file-nonce',
    ciphertext: Buffer.from('test-encrypted-file-content').toString('base64url'),
    ...overrides,
  };

  const res = await request(app.getHttpServer())
    .post('/api/v1/attachments')
    .set('X-Forwarded-For', auth.ip)
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', [auth.sessionCookie, auth.csrfCookie])
    .set('x-csrf-token', auth.csrfToken)
    .send(payload);

  return { response: res, attachmentId: payload.id as string };
}

/**
 * Initializes a zero-knowledge vault for a user via the authenticated API.
 */
export async function createTestVault(
  app: INestApplication,
  auth: TestUserAuth,
  overrides: Record<string, unknown> = {},
) {
  const payload = {
    salt: 'test-salt-32bytes-base64',
    argon2MemLimitKib: 65536,
    argon2OpsLimit: 3,
    argon2Parallelism: 1,
    wrappedDek: 'test-wrapped-dek-envelope',
    dekNonce: 'test-dek-nonce',
    recoveryKeySalt: 'test-recovery-salt',
    recoveryKeyOpsLimit: 3,
    recoveryKeyMemLimitKib: 65536,
    recoveryWrappedDek: 'test-recovery-wrapped-dek',
    recoveryDekNonce: 'test-recovery-nonce',
    ...overrides,
  };

  const res = await request(app.getHttpServer())
    .post('/api/v1/vault')
    .set('X-Forwarded-For', auth.ip)
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', [auth.sessionCookie, auth.csrfCookie])
    .set('x-csrf-token', auth.csrfToken)
    .send(payload);

  return { response: res, payload };
}
