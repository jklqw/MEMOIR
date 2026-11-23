import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SecurityEventType } from '@memoir/shared';
import { AuthService } from '../src/auth/auth.service.js';
import { AppConfigService } from '../src/config/config.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RedisService } from '../src/redis/redis.service.js';
import { SessionsService } from '../src/sessions/sessions.service.js';

describe('Sessions Management & IDOR Denial Integration', () => {
  let prisma: PrismaService;
  let authService: AuthService;
  let sessionsService: SessionsService;
  let mailService: MailService;
  let configService: AppConfigService;
  let redisService: RedisService;

  beforeAll(async () => {
    configService = new AppConfigService();
    prisma = new PrismaService();
    await prisma.$connect();
    mailService = new MailService(configService);
    authService = new AuthService(prisma, mailService);
    redisService = new RedisService(configService);
    await redisService.onModuleInit();
    sessionsService = new SessionsService(prisma, redisService);
  });

  afterAll(async () => {
    await redisService.onModuleDestroy();
    await prisma.$disconnect();
  });

  it('lists active sessions with masked IP and device metadata', async () => {
    const email = `session-list-${Date.now()}@example.com`;
    const password = 'Password12345!';

    await authService.register({ email, password });
    const user = await prisma.user.findUnique({ where: { email } });
    await prisma.user.update({
      where: { id: user!.id },
      data: { emailVerifiedAt: new Date(), emailVerifyTokenHash: null },
    });

    const login1 = await authService.login(
      { email, password },
      'Mozilla/5.0 (X11; Linux x86_64) Firefox/135.0',
      '10.20.30.40',
    );
    const login2 = await authService.login(
      { email, password },
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1.15',
      '172.16.0.99',
    );

    const s1 = await prisma.session.findUnique({
      where: { tokenHash: authService.hashToken(login1.rawToken) },
    });
    const s2 = await prisma.session.findUnique({
      where: { tokenHash: authService.hashToken(login2.rawToken) },
    });

    const activeSessions = await sessionsService.listActiveSessions(user!.id, s1!.id);
    expect(activeSessions.length).toBe(2);

    const currentSession = activeSessions.find((s) => s.id === s1!.id);
    expect(currentSession).toBeDefined();
    expect(currentSession!.isCurrent).toBe(true);
    expect(currentSession!.ipMasked).toBe('10.20.30.x');
    expect(currentSession!.deviceLabel).toContain('Firefox');

    const otherSession = activeSessions.find((s) => s.id === s2!.id);
    expect(otherSession).toBeDefined();
    expect(otherSession!.isCurrent).toBe(false);
    expect(otherSession!.ipMasked).toBe('172.16.0.x');

    // Cleanup
    await prisma.user.delete({ where: { id: user!.id } });
  });

  it('prevents IDOR: User A cannot revoke or view User B session', async () => {
    const userAEmail = `user-a-${Date.now()}@example.com`;
    const userBEmail = `user-b-${Date.now()}@example.com`;
    const password = 'Password12345!';

    // Create User A
    await authService.register({ email: userAEmail, password });
    const userA = await prisma.user.findUnique({ where: { email: userAEmail } });
    await prisma.user.update({
      where: { id: userA!.id },
      data: { emailVerifiedAt: new Date(), emailVerifyTokenHash: null },
    });
    const loginA = await authService.login({ email: userAEmail, password });
    const sessionA = await prisma.session.findUnique({
      where: { tokenHash: authService.hashToken(loginA.rawToken) },
    });

    // Create User B
    await authService.register({ email: userBEmail, password });
    const userB = await prisma.user.findUnique({ where: { email: userBEmail } });
    await prisma.user.update({
      where: { id: userB!.id },
      data: { emailVerifiedAt: new Date(), emailVerifyTokenHash: null },
    });
    const loginB = await authService.login({ email: userBEmail, password });
    const sessionB = await prisma.session.findUnique({
      where: { tokenHash: authService.hashToken(loginB.rawToken) },
    });

    // User A attempts to list sessions -> must NOT see User B session
    const userASessions = await sessionsService.listActiveSessions(userA!.id, sessionA!.id);
    expect(userASessions.some((s) => s.id === sessionB!.id)).toBe(false);

    // SECURITY INVARIANT: IDOR Attack Prevention
    // User A attempts to revoke User B session -> MUST throw NotFoundException (404)
    await expect(sessionsService.revokeSession(userA!.id, sessionB!.id)).rejects.toThrow(
      'Session not found.',
    );

    // Verify User B's session was NOT revoked
    const sessionBCheck = await prisma.session.findUnique({ where: { id: sessionB!.id } });
    expect(sessionBCheck!.revokedAt).toBeNull();

    // Cleanup
    await prisma.user.delete({ where: { id: userA!.id } });
    await prisma.user.delete({ where: { id: userB!.id } });
  });

  it('revokes all other sessions except current session', async () => {
    const email = `revoke-all-${Date.now()}@example.com`;
    const password = 'Password12345!';

    await authService.register({ email, password });
    const user = await prisma.user.findUnique({ where: { email } });
    await prisma.user.update({
      where: { id: user!.id },
      data: { emailVerifiedAt: new Date(), emailVerifyTokenHash: null },
    });

    const l1 = await authService.login({ email, password });
    const l2 = await authService.login({ email, password });
    const l3 = await authService.login({ email, password });

    const s1 = await prisma.session.findUnique({
      where: { tokenHash: authService.hashToken(l1.rawToken) },
    });
    const s2 = await prisma.session.findUnique({
      where: { tokenHash: authService.hashToken(l2.rawToken) },
    });
    const s3 = await prisma.session.findUnique({
      where: { tokenHash: authService.hashToken(l3.rawToken) },
    });

    // Revoke all other sessions with s1 as current
    await sessionsService.revokeAllOtherSessions(user!.id, s1!.id);

    // s1 must remain active
    const s1After = await prisma.session.findUnique({ where: { id: s1!.id } });
    expect(s1After!.revokedAt).toBeNull();

    // s2 and s3 must be revoked
    const s2After = await prisma.session.findUnique({ where: { id: s2!.id } });
    expect(s2After!.revokedAt).not.toBeNull();
    const s3After = await prisma.session.findUnique({ where: { id: s3!.id } });
    expect(s3After!.revokedAt).not.toBeNull();

    // Security event SESSION_REVOKED must be logged
    const revokeEvents = await prisma.securityEvent.findMany({
      where: {
        userId: user!.id,
        eventType: SecurityEventType.SESSION_REVOKED,
      },
    });
    expect(revokeEvents.length).toBeGreaterThan(0);

    // Cleanup
    await prisma.user.delete({ where: { id: user!.id } });
  });
});
