import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { generateSync } from 'otplib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { CsrfGuard } from '../src/common/guards/csrf.guard.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { decryptWithKms } from '../src/common/security/kms.util.js';
import { setupSecurityMiddleware } from '../src/common/security/security-headers.js';
import { AppConfigService } from '../src/config/config.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Two-Factor Authentication (TOTP), KMS Protection & Password Lifecycle', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let config: AppConfigService;
  const testEmail = `2fa-test-${Date.now()}@example.com`;
  const initialPassword = 'OriginalPassword123!@#Secure';
  let userId: string;
  let sessionCookie: string;
  let csrfCookie: string;
  let csrfToken: string;

  let totpSecret: string;
  let backupCodes: string[] = [];

  let ipCounter = 1;
  const getNextIp = () => `198.51.100.${ipCounter++}`;

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

    // 1. Register user
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:5173')
      .set('X-Forwarded-For', getNextIp())
      .send({
        email: testEmail,
        password: initialPassword,
      });

    // 2. Verify email in DB
    const user = await prisma.user.findUniqueOrThrow({ where: { email: testEmail } });
    userId = user.id;
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date(), emailVerifyTokenHash: null },
    });

    // 3. Login to establish active session
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('X-Forwarded-For', getNextIp())
      .send({
        email: testEmail,
        password: initialPassword,
      });

    const setCookies = (loginRes.headers['set-cookie'] as unknown as string[]) || [];
    for (const cookieStr of setCookies) {
      if (cookieStr.startsWith('memoir_session=')) {
        sessionCookie = cookieStr.split(';')[0] || '';
      }
      if (cookieStr.startsWith('XSRF-TOKEN=')) {
        csrfCookie = cookieStr.split(';')[0] || '';
        csrfToken = csrfCookie.replace('XSRF-TOKEN=', '');
      }
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { email: testEmail } });
    }
    if (app) {
      await app.close();
    }
  });

  describe('1. Two-Factor Authentication Setup & Activation', () => {
    it('generates secret, QR code data URL, and 10 single-use backup codes', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/setup')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .set('Cookie', [sessionCookie, csrfCookie])
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(200);
      const data = res.body.data || res.body;
      expect(data.secret).toBeDefined();
      expect(typeof data.secret).toBe('string');
      expect(data.qrCodeUrl).toMatch(/^data:image\/png;base64,/);
      expect(Array.isArray(data.backupCodes)).toBe(true);
      expect(data.backupCodes).toHaveLength(10);
      expect(data.backupCodes[0]).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

      totpSecret = data.secret;
      backupCodes = data.backupCodes;
    });

    it('rejects invalid or wrong enrollment code with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/enable')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .set('Cookie', [sessionCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ token: '000000' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/Invalid authentication code/i);
    });

    it('activates 2FA with valid TOTP code, KMS-encrypts secret, and stores hashed backup codes', async () => {
      const validToken = generateSync({ secret: totpSecret });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/enable')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .set('Cookie', [sessionCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ token: validToken });

      expect(res.status).toBe(200);
      const data = res.body.data || res.body;
      expect(data.message).toMatch(/Two-factor authentication enabled successfully/i);

      // Verify in database:
      const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(updatedUser.totpEnabled).toBe(true);

      // Invariant: Secret in DB is NEVER raw plaintext secret
      expect(updatedUser.totpSecretEncrypted).not.toBeNull();
      expect(updatedUser.totpSecretEncrypted).not.toBe(totpSecret);
      expect(updatedUser.totpSecretEncrypted).toMatch(
        /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
      );

      // Invariant: Decrypting with SERVER_KMS_KEY yields the exact original secret
      const decrypted = decryptWithKms(
        updatedUser.totpSecretEncrypted!,
        config.get('SERVER_KMS_KEY'),
      );
      expect(decrypted).toBe(totpSecret);

      // Invariant: Backup codes in DB are hashed, not raw
      const storedHashes = updatedUser.totpBackupCodesHash as string[];
      expect(storedHashes).toHaveLength(10);
      expect(storedHashes).not.toContain(backupCodes[0]);
    });
  });

  describe('2. Two-Factor Authentication Login Challenge Flow', () => {
    let mfaChallengeToken: string;

    it('requires 2FA challenge on login and does not issue session cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          email: testEmail,
          password: initialPassword,
        });

      expect(res.status).toBe(200);
      const data = res.body.data || res.body;
      expect(data.mfaRequired).toBe(true);
      expect(data.mfaToken).toMatch(/^mfa_[a-f0-9]{64}$/);

      // No session cookie issued yet
      const cookies = (res.headers['set-cookie'] as string[] | undefined) || [];
      const session = cookies.find((c: string) => c.startsWith('memoir_session='));
      expect(session).toBeUndefined();

      mfaChallengeToken = data.mfaToken;
    });

    it('rejects invalid TOTP verification code with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/verify')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          mfaToken: mfaChallengeToken,
          code: '111222',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toMatch(/Invalid two-factor authentication code/i);
    });

    it('completes login with valid TOTP code and issues session & CSRF cookies', async () => {
      const validCode = generateSync({ secret: totpSecret });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/verify')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          mfaToken: mfaChallengeToken,
          code: validCode,
        });

      expect(res.status).toBe(200);
      const data = res.body.data || res.body;
      expect(data.user.email).toBe(testEmail);
      expect(data.csrfToken).toBeDefined();

      const cookies = (res.headers['set-cookie'] as string[] | undefined) || [];
      const session = cookies.find((c: string) => c.startsWith('memoir_session='));
      expect(session).toBeDefined();
    });

    it('allows direct login when valid totpCode is provided with credentials', async () => {
      const validCode = generateSync({ secret: totpSecret });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          email: testEmail,
          password: initialPassword,
          totpCode: validCode,
        });

      expect(res.status).toBe(200);
      const data = res.body.data || res.body;
      expect(data.mfaRequired).toBeUndefined();
      expect(data.user.email).toBe(testEmail);
    });
  });

  describe('3. Single-Use Backup Code Enforcement', () => {
    it('authenticates using a single-use backup code and consumes it', async () => {
      // 1. Initiate login challenge
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          email: testEmail,
          password: initialPassword,
        });
      const loginData = loginRes.body.data || loginRes.body;
      expect(loginData.mfaRequired).toBe(true);

      const codeToUse = backupCodes[0]!;

      // 2. Complete 2FA with backup code
      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/verify')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          mfaToken: loginData.mfaToken,
          code: codeToUse,
        });
      expect(verifyRes.status).toBe(200);

      // 3. Verify in DB that remaining codes count is 9
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const remainingCodes = user.totpBackupCodesHash as string[];
      expect(remainingCodes).toHaveLength(9);

      // 4. Invariant: Reusing the exact same backup code must fail
      const loginRes2 = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          email: testEmail,
          password: initialPassword,
        });
      const loginData2 = loginRes2.body.data || loginRes2.body;
      const reuseRes = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/verify')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          mfaToken: loginData2.mfaToken,
          code: codeToUse,
        });
      expect(reuseRes.status).toBe(401);
    });
  });

  describe('4. Disabling Two-Factor Authentication', () => {
    let freshSessionCookie: string;
    let freshCsrfCookie: string;
    let freshCsrfToken: string;

    beforeAll(async () => {
      const validCode = generateSync({ secret: totpSecret });
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          email: testEmail,
          password: initialPassword,
          totpCode: validCode,
        });
      const cookies = (res.headers['set-cookie'] as unknown as string[]) || [];
      for (const cookieStr of cookies) {
        if (cookieStr.startsWith('memoir_session=')) {
          freshSessionCookie = cookieStr.split(';')[0] || '';
        }
        if (cookieStr.startsWith('XSRF-TOKEN=')) {
          freshCsrfCookie = cookieStr.split(';')[0] || '';
          freshCsrfToken = freshCsrfCookie.replace('XSRF-TOKEN=', '');
        }
      }
    });

    it('rejects disable attempt when account password is incorrect', async () => {
      const validCode = generateSync({ secret: totpSecret });
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/disable')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .set('Cookie', [freshSessionCookie, freshCsrfCookie])
        .set('x-csrf-token', freshCsrfToken)
        .send({
          password: 'WrongPassword999!',
          code: validCode,
        });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toMatch(/Current password does not match/i);
    });

    it('disables 2FA with valid account password and valid TOTP code', async () => {
      const validCode = generateSync({ secret: totpSecret });
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/disable')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .set('Cookie', [freshSessionCookie, freshCsrfCookie])
        .set('x-csrf-token', freshCsrfToken)
        .send({
          password: initialPassword,
          code: validCode,
        });

      expect(res.status).toBe(200);
      const data = res.body.data || res.body;
      expect(data.message).toMatch(/Two-factor authentication disabled successfully/i);

      // Verify in DB
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.totpEnabled).toBe(false);
      expect(user.totpSecretEncrypted).toBeNull();
      expect(user.totpBackupCodesHash).toBeNull();

      // Subsequent login succeeds immediately without 2FA challenge
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          email: testEmail,
          password: initialPassword,
        });
      expect(loginRes.status).toBe(200);
      const loginData = loginRes.body.data || loginRes.body;
      expect(loginData.mfaRequired).toBeUndefined();
    });
  });

  describe('5. Account Password Change Lifecycle', () => {
    let currentSessionCookie: string;
    let currentCsrfCookie: string;
    let currentCsrfToken: string;
    const newPassword = 'BrandNewPassword456!@#Secure';

    beforeAll(async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          email: testEmail,
          password: initialPassword,
        });
      const cookies = (loginRes.headers['set-cookie'] as unknown as string[]) || [];
      for (const cookieStr of cookies) {
        if (cookieStr.startsWith('memoir_session=')) {
          currentSessionCookie = cookieStr.split(';')[0] || '';
        }
        if (cookieStr.startsWith('XSRF-TOKEN=')) {
          currentCsrfCookie = cookieStr.split(';')[0] || '';
          currentCsrfToken = currentCsrfCookie.replace('XSRF-TOKEN=', '');
        }
      }
    });

    it('rejects password change if current password does not match', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .set('Cookie', [currentSessionCookie, currentCsrfCookie])
        .set('x-csrf-token', currentCsrfToken)
        .send({
          currentPassword: 'WrongPassword!',
          newPassword,
        });

      expect(res.status).toBe(401);
    });

    it('rejects password change if new password is identical to current password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .set('Cookie', [currentSessionCookie, currentCsrfCookie])
        .set('x-csrf-token', currentCsrfToken)
        .send({
          currentPassword: initialPassword,
          newPassword: initialPassword,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/different/i);
    });

    it('changes account password and enforces new credentials on subsequent login', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .set('Cookie', [currentSessionCookie, currentCsrfCookie])
        .set('x-csrf-token', currentCsrfToken)
        .send({
          currentPassword: initialPassword,
          newPassword,
        });

      expect(res.status).toBe(200);
      const data = res.body.data || res.body;
      expect(data.message).toMatch(/Password changed successfully/i);

      // Old password fails
      const oldLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          email: testEmail,
          password: initialPassword,
        });
      expect(oldLogin.status).toBe(401);

      // New password succeeds
      const newLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          email: testEmail,
          password: newPassword,
        });
      expect(newLogin.status).toBe(200);
    });
  });

  describe('6. Account Password Reset & Zero-Knowledge Vault Invariant Test', () => {
    const resetPassword = 'ResetPassword789!@#NewEpoch';
    let vaultSnapshotBeforeReset: {
      wrappedDek: string;
      recoveryWrappedDek: string;
      kdfSalt: string;
      envelopeVersion: number;
    };

    beforeAll(async () => {
      // Create user vault in DB to represent active encrypted diary vault
      const vault = await prisma.userVault.create({
        data: {
          userId,
          wrappedDek: 'vault-encrypted-dek-ciphertext-snapshot',
          wrappedDekNonce: 'nonce-12bytes-b64',
          kdfSalt: 'salt-passphrase-32bytes-entropy',
          kdfMemory: 65536,
          kdfIterations: 3,
          kdfParallelism: 4,
          recoverySalt: 'recovery-salt-32bytes',
          recoveryWrappedDek: 'recovery-encrypted-dek-ciphertext-snapshot',
          recoveryNonce: 'recovery-nonce-12bytes',
          recoveryKeyFingerprint: 'fingerprint-sha256-hex',
          envelopeVersion: 1,
        },
      });

      vaultSnapshotBeforeReset = {
        wrappedDek: vault.wrappedDek,
        recoveryWrappedDek: vault.recoveryWrappedDek,
        kdfSalt: vault.kdfSalt,
        envelopeVersion: vault.envelopeVersion,
      };
    });

    it('requests password reset email with anti-enumeration response', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({ email: testEmail });

      expect(res.status).toBe(200);
      const data = res.body.data || res.body;
      expect(data.message).toMatch(/dispatched/i);
    });

    it('completes password reset and strictly preserves zero-knowledge vault integrity', async () => {
      // Retrieve raw token from DB
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.passwordResetTokenHash).toBeDefined();

      const crypto = await import('node:crypto');
      const testResetToken = 'known-test-reset-token-for-spec-verification';
      const testResetTokenHash = crypto.createHash('sha256').update(testResetToken).digest('hex');

      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordResetTokenHash: testResetTokenHash,
          passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      // Submit password reset
      const resetRes = await request(app.getHttpServer())
        .post('/api/v1/auth/reset-password')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          token: testResetToken,
          newPassword: resetPassword,
        });

      expect(resetRes.status).toBe(200);
      const data = resetRes.body.data || resetRes.body;
      expect(data.message).toMatch(/Password has been reset successfully/i);

      // Verify login works with reset password
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          email: testEmail,
          password: resetPassword,
        });
      expect(loginRes.status).toBe(200);

      // CRITICAL ZERO-KNOWLEDGE INVARIANT ASSERTIONS:
      // Verify user_vaults was NEVER modified, wiped, or re-encrypted
      const vaultAfterReset = await prisma.userVault.findUniqueOrThrow({ where: { userId } });
      expect(vaultAfterReset.wrappedDek).toBe(vaultSnapshotBeforeReset.wrappedDek);
      expect(vaultAfterReset.recoveryWrappedDek).toBe(vaultSnapshotBeforeReset.recoveryWrappedDek);
      expect(vaultAfterReset.kdfSalt).toBe(vaultSnapshotBeforeReset.kdfSalt);
      expect(vaultAfterReset.envelopeVersion).toBe(vaultSnapshotBeforeReset.envelopeVersion);
    });
  });
});
