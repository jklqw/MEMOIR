import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SecurityEventType } from '@memoir/shared';
import { AuthService } from '../src/auth/auth.service.js';
import { AppConfigService } from '../src/config/config.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Auth Sessions, Rotation & Replay Revocation Integration', () => {
  let prisma: PrismaService;
  let authService: AuthService;
  let mailService: MailService;
  let configService: AppConfigService;

  beforeAll(async () => {
    configService = new AppConfigService();
    prisma = new PrismaService();
    await prisma.$connect();
    mailService = new MailService(configService);
    authService = new AuthService(prisma, mailService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('manages full session lifecycle: login, rotation, and replay family revocation', async () => {
    const testEmail = `session-test-${Date.now()}@example.com`;
    const password = 'StrongPassword-1234!';

    // 1. Register and verify email
    await authService.register({ email: testEmail, password });
    const userInDb = await prisma.user.findUnique({ where: { email: testEmail } });
    expect(userInDb).toBeDefined();

    // Directly simulate verification for test brevity
    await prisma.user.update({
      where: { id: userInDb!.id },
      data: { emailVerifiedAt: new Date(), emailVerifyTokenHash: null },
    });

    // 2. Unverified email login rejection test
    const unverifiedEmail = `unverified-${Date.now()}@example.com`;
    await authService.register({ email: unverifiedEmail, password });
    await expect(authService.login({ email: unverifiedEmail, password })).rejects.toThrow(
      'Please verify your email address before logging in.',
    );

    // 3. Invalid password login rejection test
    await expect(
      authService.login({ email: testEmail, password: 'WrongPassword!' }),
    ).rejects.toThrow('Invalid email or password.');

    // 4. Successful login
    const loginResult = await authService.login(
      { email: testEmail, password },
      'Mozilla/5.0 (X11; Linux x86_64) Firefox/135.0',
      '192.168.1.50',
    );
    expect(loginResult.user.email).toBe(testEmail);
    expect(loginResult.rawToken.startsWith('memoir_s_')).toBe(true);

    const token1 = loginResult.rawToken;
    const token1Hash = authService.hashToken(token1);

    // 5. Invariant: Raw token must NEVER appear in the database
    const rawTokenLeakCheck = await prisma.session.findFirst({
      where: { tokenHash: token1 },
    });
    expect(rawTokenLeakCheck).toBeNull();

    // Verify session stored by hash
    const session1 = await prisma.session.findUnique({
      where: { tokenHash: token1Hash },
    });
    expect(session1).toBeDefined();
    expect(session1!.userId).toBe(userInDb!.id);
    expect(session1!.revokedAt).toBeNull();
    expect(session1!.ipMaskedOrHash).toBe('192.168.1.x');
    expect(session1!.deviceLabel).toContain('Firefox');

    // 6. Profile lookup via getMe
    const profile = await authService.getMe(userInDb!.id);
    expect(profile.id).toBe(userInDb!.id);
    expect(profile.email).toBe(testEmail);
    expect((profile as Record<string, unknown>).passwordHash).toBeUndefined();

    // 7. Session Rotation: Refresh session
    const refresh1 = await authService.refreshSession(token1, 'Firefox/135.0', '192.168.1.50');
    const token2 = refresh1.newRawToken;
    expect(token2).not.toBe(token1);

    // After rotation, session1 MUST be marked revoked
    const session1AfterRotation = await prisma.session.findUnique({
      where: { tokenHash: token1Hash },
    });
    expect(session1AfterRotation!.revokedAt).not.toBeNull();

    // Session2 must be active and share the same familyId
    const token2Hash = authService.hashToken(token2);
    const session2 = await prisma.session.findUnique({
      where: { tokenHash: token2Hash },
    });
    expect(session2).toBeDefined();
    expect(session2!.revokedAt).toBeNull();
    expect(session2!.familyId).toBe(session1!.familyId);

    // Rotate again: token2 -> token3
    const refresh2 = await authService.refreshSession(token2, 'Firefox/135.0', '192.168.1.50');
    const token3 = refresh2.newRawToken;
    const token3Hash = authService.hashToken(token3);

    const session3 = await prisma.session.findUnique({
      where: { tokenHash: token3Hash },
    });
    expect(session3!.revokedAt).toBeNull();
    expect(session3!.familyId).toBe(session1!.familyId);

    // 8. SECURITY INVARIANT: Replay Detection & Full Session Family Revocation
    // An attacker or compromised client replays token1 (already rotated)
    await expect(
      authService.refreshSession(token1, 'MaliciousActor/1.0', '10.0.0.1'),
    ).rejects.toThrow('Security warning: Session token reuse detected.');

    // Entire family MUST be revoked now!
    const session3AfterReplay = await prisma.session.findUnique({
      where: { tokenHash: token3Hash },
    });
    expect(session3AfterReplay!.revokedAt).not.toBeNull();

    // Security event SUSPICIOUS_LOGIN must be logged
    const suspiciousEvents = await prisma.securityEvent.findMany({
      where: {
        userId: userInDb!.id,
        eventType: SecurityEventType.SUSPICIOUS_LOGIN,
      },
    });
    expect(suspiciousEvents.length).toBeGreaterThan(0);

    // Subsequent refresh attempts with token3 must now fail because family was revoked
    await expect(authService.refreshSession(token3)).rejects.toThrow();

    // Cleanup
    await prisma.user.delete({ where: { id: userInDb!.id } });
  });

  it('triggers exponential lockout after 5 consecutive failed login attempts', async () => {
    const testEmail = `lockout-${Date.now()}@example.com`;
    const password = 'CorrectPassword123!';

    await authService.register({ email: testEmail, password });
    const userInDb = await prisma.user.findUnique({ where: { email: testEmail } });
    await prisma.user.update({
      where: { id: userInDb!.id },
      data: { emailVerifiedAt: new Date(), emailVerifyTokenHash: null },
    });

    // 5 consecutive wrong passwords
    for (let i = 1; i <= 5; i++) {
      await expect(
        authService.login({ email: testEmail, password: 'WrongPassword!' }, undefined, '127.0.0.1'),
      ).rejects.toThrow('Invalid email or password.');
    }

    // Check database lockout status
    const lockedUser = await prisma.user.findUnique({ where: { id: userInDb!.id } });
    expect(lockedUser!.failedLoginAttempts).toBe(5);
    expect(lockedUser!.lockedUntil).not.toBeNull();
    expect(new Date(lockedUser!.lockedUntil!).getTime()).toBeGreaterThan(Date.now());

    // 6th attempt must fail with lockout message even if password is correct!
    await expect(
      authService.login({ email: testEmail, password }, undefined, '127.0.0.1'),
    ).rejects.toThrow('Account is temporarily locked');

    // Security event LOCKOUT_TRIGGERED must be recorded
    const lockoutEvents = await prisma.securityEvent.findMany({
      where: {
        userId: userInDb!.id,
        eventType: SecurityEventType.LOCKOUT_TRIGGERED,
      },
    });
    expect(lockoutEvents.length).toBe(1);

    // Cleanup
    await prisma.user.delete({ where: { id: userInDb!.id } });
  });
});
