import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { CsrfGuard } from '../src/common/guards/csrf.guard.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { setupSecurityMiddleware } from '../src/common/security/security-headers.js';
import { AppConfigService } from '../src/config/config.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { WebAuthnService } from '../src/auth/webauthn.service.js';

describe('WebAuthn Passkeys (FIDO2) Authentication & Zero-Knowledge Vault Boundary', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let config: AppConfigService;
  let webauthnService: WebAuthnService;

  const userAEmail = `passkey-user-a-${Date.now()}@example.com`;
  const userBEmail = `passkey-user-b-${Date.now()}@example.com`;
  const testPassword = 'SecurePasskeyMasterPassword123!@#';

  let userAId: string;
  let userBId: string;

  let userASessionCookie: string;
  let userACsrfCookie: string;
  let userACsrfToken: string;

  let userBSessionCookie: string;
  let userBCsrfCookie: string;
  let userBCsrfToken: string;

  const testCredentialId = 'test-cred-id-abc123xyz789';
  const testPublicKey = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  let registeredPasskeyDbId: string;

  let ipCounter = 1;
  const getNextIp = () => `198.51.100.${ipCounter++}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    config = app.get(AppConfigService);
    prisma = app.get(PrismaService);
    webauthnService = app.get(WebAuthnService);

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

    // 1. Register User A
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:5173')
      .set('X-Forwarded-For', getNextIp())
      .send({ email: userAEmail, password: testPassword });

    const userA = await prisma.user.findUniqueOrThrow({ where: { email: userAEmail } });
    userAId = userA.id;
    await prisma.user.update({
      where: { id: userAId },
      data: { emailVerifiedAt: new Date(), emailVerifyTokenHash: null },
    });

    const loginResA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('X-Forwarded-For', getNextIp())
      .send({ email: userAEmail, password: testPassword });

    const cookiesA = loginResA.headers['set-cookie'] as string[];
    userASessionCookie = cookiesA.find((c) => c.startsWith('memoir_session='))!;
    userACsrfCookie = cookiesA.find((c) => c.startsWith('XSRF-TOKEN='))!;
    userACsrfToken = loginResA.body.data.csrfToken;

    // 2. Register User B
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:5173')
      .set('X-Forwarded-For', getNextIp())
      .send({ email: userBEmail, password: testPassword });

    const userB = await prisma.user.findUniqueOrThrow({ where: { email: userBEmail } });
    userBId = userB.id;
    await prisma.user.update({
      where: { id: userBId },
      data: { emailVerifiedAt: new Date(), emailVerifyTokenHash: null },
    });

    const loginResB = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('X-Forwarded-For', getNextIp())
      .send({ email: userBEmail, password: testPassword });

    const cookiesB = loginResB.headers['set-cookie'] as string[];
    userBSessionCookie = cookiesB.find((c) => c.startsWith('memoir_session='))!;
    userBCsrfCookie = cookiesB.find((c) => c.startsWith('XSRF-TOKEN='))!;
    userBCsrfToken = loginResB.body.data.csrfToken;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await prisma.user.deleteMany({
      where: { email: { in: [userAEmail, userBEmail] } },
    });
    await app.close();
  });

  describe('1. WebAuthn Passkey Registration Flow', () => {
    it('rejects registration options request without an active session cookie (401)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/passkeys/register/options')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(401);
    });

    it('generates registration options with challenge and RP parameters for authenticated user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/passkeys/register/options')
        .set('Cookie', [userASessionCookie, userACsrfCookie])
        .set('X-CSRF-Token', userACsrfToken)
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(res.body.data.challenge).toBeDefined();
      expect(typeof res.body.data.challenge).toBe('string');
      expect(res.body.data.rp.name).toBe('Memoir');
      expect(res.body.data.rp.id).toBe('localhost');
      expect(res.body.data.user.name).toBe(userAEmail);
      expect(res.body.data.pubKeyCredParams).toBeDefined();
    });

    it('rejects passkey registration verification if challenge is expired or invalid (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/passkeys/register/verify')
        .set('Cookie', [userBSessionCookie, userBCsrfCookie])
        .set('X-CSRF-Token', userBCsrfToken)
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          response: {
            id: 'fake-id',
            rawId: 'fake-id',
            response: { clientDataJSON: 'e30=', attestationObject: 'e30=' },
            type: 'public-key',
          },
          deviceName: 'Fake Device',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('challenge expired');
    });

    it('rejects passkey registration verification if attestation verification fails (400)', async () => {
      // 1. Generate options
      await request(app.getHttpServer())
        .post('/api/v1/auth/passkeys/register/options')
        .set('Cookie', [userASessionCookie, userACsrfCookie])
        .set('X-CSRF-Token', userACsrfToken)
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp());

      // Mock verifyRegistrationResponse to return verified: false
      vi.spyOn(webauthnService, 'verifyRegistrationResponse').mockResolvedValueOnce({
        verified: false,
      } as any);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/passkeys/register/verify')
        .set('Cookie', [userASessionCookie, userACsrfCookie])
        .set('X-CSRF-Token', userACsrfToken)
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          response: {
            id: 'failed-id',
            rawId: 'failed-id',
            response: { clientDataJSON: 'e30=', attestationObject: 'e30=' },
            type: 'public-key',
          },
          deviceName: 'Untrusted Key',
        });

      expect(res.status).toBe(400);
    });

    it('verifies valid passkey registration and persists credential in webauthn_credentials', async () => {
      // 1. Generate fresh registration options
      const optRes = await request(app.getHttpServer())
        .post('/api/v1/auth/passkeys/register/options')
        .set('Cookie', [userASessionCookie, userACsrfCookie])
        .set('X-CSRF-Token', userACsrfToken)
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp());

      const challenge = optRes.body.data.challenge;

      // 2. Mock verifyRegistrationResponse to return verified: true
      vi.spyOn(webauthnService, 'verifyRegistrationResponse').mockResolvedValueOnce({
        verified: true,
        registrationInfo: {
          credential: {
            id: testCredentialId,
            publicKey: testPublicKey,
            counter: 0,
            transports: ['internal'],
          },
          credentialType: 'public-key',
          userVerified: true,
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
          origin: 'http://localhost:5173',
          fmt: 'none',
          aaguid: '00000000-0000-0000-0000-000000000000',
          attestationObject: new Uint8Array(),
        },
      } as any);

      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/auth/passkeys/register/verify')
        .set('Cookie', [userASessionCookie, userACsrfCookie])
        .set('X-CSRF-Token', userACsrfToken)
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          response: {
            id: testCredentialId,
            rawId: testCredentialId,
            response: {
              clientDataJSON: Buffer.from(
                JSON.stringify({ challenge, origin: 'http://localhost:5173' }),
              ).toString('base64url'),
              attestationObject: 'e30=',
            },
            type: 'public-key',
          },
          deviceName: 'MacBook Pro Touch ID',
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.message).toContain('Passkey registered successfully');
      expect(verifyRes.body.data.credentialId).toBe(testCredentialId);

      // Verify database record
      const dbCred = await prisma.webAuthnCredential.findUniqueOrThrow({
        where: { credentialId: testCredentialId },
      });
      expect(dbCred.userId).toBe(userAId);
      expect(dbCred.deviceName).toBe('MacBook Pro Touch ID');
      expect(dbCred.counter).toBe(0n);
      registeredPasskeyDbId = dbCred.id;

      // Verify security audit event
      const auditEvent = await prisma.securityEvent.findFirstOrThrow({
        where: {
          userId: userAId,
          eventType: 'PASSKEY_ADDED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditEvent.safeMetadata).toMatchObject({
        credentialId: testCredentialId,
        deviceName: 'MacBook Pro Touch ID',
      });
    });
  });

  describe('2. WebAuthn Passkey Authentication Flow', () => {
    it('generates authentication options for public passkey sign-in', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/passkeys/login/options')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({ email: userAEmail });

      expect(res.status).toBe(200);
      expect(res.body.data.challenge).toBeDefined();
      expect(res.body.data.rpId).toBe('localhost');
      expect(res.body.data.allowCredentials).toBeDefined();
      expect(res.body.data.allowCredentials.length).toBe(1);
      expect(res.body.data.allowCredentials[0].id).toBe(testCredentialId);
    });

    it('rejects passkey authentication with an unrecognized credential ID (401)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/passkeys/login/verify')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          response: {
            id: 'non-existent-credential-id',
            rawId: 'non-existent-credential-id',
            response: { clientDataJSON: 'e30=', authenticatorData: 'e30=', signature: 'e30=' },
            type: 'public-key',
          },
        });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toContain('Unrecognized passkey credential');
    });

    it('rejects passkey authentication if challenge is missing or expired in Redis (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/passkeys/login/verify')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          response: {
            id: testCredentialId,
            rawId: testCredentialId,
            response: {
              clientDataJSON: Buffer.from(
                JSON.stringify({ challenge: 'expired-or-missing-challenge' }),
              ).toString('base64url'),
              authenticatorData: 'e30=',
              signature: 'e30=',
            },
            type: 'public-key',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('challenge expired or invalid');
    });

    it('rejects passkey authentication if assertion signature verification fails (401)', async () => {
      // 1. Generate options
      const optRes = await request(app.getHttpServer())
        .post('/api/v1/auth/passkeys/login/options')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({ email: userAEmail });

      const challenge = optRes.body.data.challenge;

      // Mock verifyAuthenticationResponse to fail
      vi.spyOn(webauthnService, 'verifyAuthenticationResponse').mockResolvedValueOnce({
        verified: false,
      } as any);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/passkeys/login/verify')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          response: {
            id: testCredentialId,
            rawId: testCredentialId,
            response: {
              clientDataJSON: Buffer.from(
                JSON.stringify({ challenge, origin: 'http://localhost:5173' }),
              ).toString('base64url'),
              authenticatorData: 'e30=',
              signature: 'e30=',
            },
            type: 'public-key',
          },
        });

      expect(res.status).toBe(401);

      // Verify LOGIN_FAILED audit event
      const failedEvent = await prisma.securityEvent.findFirstOrThrow({
        where: {
          userId: userAId,
          eventType: 'LOGIN_FAILED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(failedEvent.safeMetadata).toMatchObject({
        method: 'passkey',
        credentialId: testCredentialId,
      });
    });

    it('authenticates user successfully with valid passkey assertion, sets session cookie, and increments counter', async () => {
      // 1. Generate fresh authentication options
      const optRes = await request(app.getHttpServer())
        .post('/api/v1/auth/passkeys/login/options')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({ email: userAEmail });

      const challenge = optRes.body.data.challenge;

      // Mock verifyAuthenticationResponse to succeed
      vi.spyOn(webauthnService, 'verifyAuthenticationResponse').mockResolvedValueOnce({
        verified: true,
        authenticationInfo: {
          credentialID: testCredentialId,
          newCounter: 1,
          userVerified: true,
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
          origin: 'http://localhost:5173',
          rpID: 'localhost',
        },
      } as any);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/passkeys/login/verify')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          response: {
            id: testCredentialId,
            rawId: testCredentialId,
            response: {
              clientDataJSON: Buffer.from(
                JSON.stringify({ challenge, origin: 'http://localhost:5173' }),
              ).toString('base64url'),
              authenticatorData: 'e30=',
              signature: 'e30=',
            },
            type: 'public-key',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(userAId);
      expect(res.body.data.user.email).toBe(userAEmail);
      expect(res.body.data.csrfToken).toBeDefined();

      // Check session cookie and CSRF cookie
      const cookies = res.headers['set-cookie'] as string[];
      expect(cookies.some((c) => c.startsWith('memoir_session='))).toBe(true);
      expect(cookies.some((c) => c.startsWith('XSRF-TOKEN='))).toBe(true);

      // Verify counter was incremented in DB
      const updatedCred = await prisma.webAuthnCredential.findUniqueOrThrow({
        where: { credentialId: testCredentialId },
      });
      expect(updatedCred.counter).toBe(1n);
      expect(updatedCred.lastUsedAt).not.toBeNull();

      // Verify LOGIN_SUCCESS audit event
      const loginEvent = await prisma.securityEvent.findFirstOrThrow({
        where: {
          userId: userAId,
          eventType: 'LOGIN_SUCCESS',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(loginEvent.safeMetadata).toMatchObject({
        method: 'passkey',
        credentialId: testCredentialId,
      });
    });
  });

  describe('3. Passkey Listing and IDOR-Protected Deletion', () => {
    it('lists registered passkeys for the authenticated user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/passkeys')
        .set('Cookie', [userASessionCookie, userACsrfCookie])
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].credentialId).toBe(testCredentialId);
      expect(res.body.data[0].deviceName).toBe('MacBook Pro Touch ID');
    });

    it('denies cross-user passkey deletion (IDOR protection)', async () => {
      // User B attempts to delete User A's registered passkey
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/auth/passkeys/${registeredPasskeyDbId}`)
        .set('Cookie', [userBSessionCookie, userBCsrfCookie])
        .set('X-CSRF-Token', userBCsrfToken)
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(400);

      // Verify credential was NOT deleted
      const cred = await prisma.webAuthnCredential.findUnique({
        where: { id: registeredPasskeyDbId },
      });
      expect(cred).not.toBeNull();
    });

    it('allows user to delete their own passkey and logs PASSKEY_REMOVED event', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/auth/passkeys/${registeredPasskeyDbId}`)
        .set('Cookie', [userASessionCookie, userACsrfCookie])
        .set('X-CSRF-Token', userACsrfToken)
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp());

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('Passkey credential removed successfully');

      // Verify deletion from DB
      const cred = await prisma.webAuthnCredential.findUnique({
        where: { id: registeredPasskeyDbId },
      });
      expect(cred).toBeNull();

      // Verify PASSKEY_REMOVED audit event
      const auditEvent = await prisma.securityEvent.findFirstOrThrow({
        where: {
          userId: userAId,
          eventType: 'PASSKEY_REMOVED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditEvent.safeMetadata).toMatchObject({
        id: registeredPasskeyDbId,
        credentialId: testCredentialId,
      });
    });
  });

  describe('4. Zero-Knowledge Vault Boundary Assertion', () => {
    it('strictly guarantees that passkey authentication does not modify or decrypt user_vaults', async () => {
      // Create a vault record for User A
      const initialVault = await prisma.userVault.create({
        data: {
          userId: userAId,
          kdfAlgorithm: 'ARGON2ID',
          kdfSalt: 'dGVzdC1zYWx0LTEyMzQ1Njc4OTAxMjM0NTY=',
          kdfMemory: 65536,
          kdfIterations: 3,
          kdfParallelism: 1,
          wrapAlgorithm: 'AES-256-GCM',
          envelopeVersion: 1,
          wrappedDek: 'd3JhcHBlZC1kZWstYnl0ZXMtMTIzNDU2Nzg5MA==',
          wrappedDekNonce: 'bm9uY2UtMTIzNDU2',
          recoverySalt: 'cmVjb3Zlcnktc2FsdC0xMjM0NTY3ODkwMTI=',
          recoveryWrappedDek: 'cmVjb3Zlcnktd3JhcHBlZC1kZWstMTIzNDU2',
          recoveryNonce: 'cmVjb3Zlcnktbm9uY2UtMTI=',
          recoveryKeyFingerprint: 'cmVjb3Zlcnkta2V5LWZpbmdlcnByaW50',
        },
      });

      // Register a second passkey for User A
      const secondCredId = 'second-passkey-cred-id-999';
      await prisma.webAuthnCredential.create({
        data: {
          userId: userAId,
          credentialId: secondCredId,
          publicKey: Buffer.from([10, 20, 30, 40]),
          counter: 5n,
          transports: ['internal'],
          deviceName: 'YubiKey 5C NFC',
        },
      });

      // 1. Generate authentication options
      const optRes = await request(app.getHttpServer())
        .post('/api/v1/auth/passkeys/login/options')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({ email: userAEmail });

      const challenge = optRes.body.data.challenge;

      // Mock verifyAuthenticationResponse
      vi.spyOn(webauthnService, 'verifyAuthenticationResponse').mockResolvedValueOnce({
        verified: true,
        authenticationInfo: {
          credentialID: secondCredId,
          newCounter: 6,
          userVerified: true,
          credentialDeviceType: 'singleDevice',
          credentialBackedUp: false,
          origin: 'http://localhost:5173',
          rpID: 'localhost',
        },
      } as any);

      // 2. Perform passkey authentication
      const passkeyAuthRes = await request(app.getHttpServer())
        .post('/api/v1/auth/passkeys/login/verify')
        .set('Origin', 'http://localhost:5173')
        .set('X-Forwarded-For', getNextIp())
        .send({
          response: {
            id: secondCredId,
            rawId: secondCredId,
            response: {
              clientDataJSON: Buffer.from(
                JSON.stringify({ challenge, origin: 'http://localhost:5173' }),
              ).toString('base64url'),
              authenticatorData: 'e30=',
              signature: 'e30=',
            },
            type: 'public-key',
          },
        });

      expect(passkeyAuthRes.status).toBe(200);

      // 3. ZERO-KNOWLEDGE INVARIANT ASSERTION:
      // Verify user_vaults remains completely unchanged
      const vaultAfterPasskeyLogin = await prisma.userVault.findUniqueOrThrow({
        where: { userId: userAId },
      });

      expect(vaultAfterPasskeyLogin.wrappedDek).toBe(initialVault.wrappedDek);
      expect(vaultAfterPasskeyLogin.wrappedDekNonce).toBe(initialVault.wrappedDekNonce);
      expect(vaultAfterPasskeyLogin.kdfSalt).toBe(initialVault.kdfSalt);
      expect(vaultAfterPasskeyLogin.recoveryWrappedDek).toBe(initialVault.recoveryWrappedDek);
      expect(vaultAfterPasskeyLogin.recoveryKeyFingerprint).toBe(
        initialVault.recoveryKeyFingerprint,
      );
      expect(vaultAfterPasskeyLogin.updatedAt.getTime()).toBe(initialVault.updatedAt.getTime());

      // 4. Assert that passkey response body returns zero vault secrets
      expect((passkeyAuthRes.body as any).wrappedDek).toBeUndefined();
      expect((passkeyAuthRes.body as any).vault).toBeUndefined();
      expect((passkeyAuthRes.body.data as any).wrappedDek).toBeUndefined();
    });
  });
});
