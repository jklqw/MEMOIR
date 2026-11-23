import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SecurityEventType } from '@memoir/shared';
import argon2 from 'argon2';
import { AuthService } from '../src/auth/auth.service.js';
import { AppConfigService } from '../src/config/config.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Auth Registration & Email Verification Integration', () => {
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

  it('registers a user, hashes password with Argon2id, and sends verification email via Mailpit', async () => {
    const uniqueEmail = `archivist-${Date.now()}@example.com`;
    const password = 'Correct-Horse-Battery-Staple-42!';

    // 1. Perform registration
    const response = await authService.register({
      email: uniqueEmail,
      password,
    });

    // Check anti-enumeration response
    expect(response.message).toBe(
      'If this email address is eligible, a verification email has been sent.',
    );

    // 2. Verify database state
    const userInDb = await prisma.user.findUnique({
      where: { email: uniqueEmail },
    });

    expect(userInDb).toBeDefined();
    expect(userInDb!.email).toBe(uniqueEmail);
    expect(userInDb!.emailVerifiedAt).toBeNull();
    expect(userInDb!.emailVerifyTokenHash).toBeDefined();
    expect(userInDb!.emailVerifyTokenHash).toHaveLength(64); // SHA-256 hex length
    expect(userInDb!.emailVerifyExpiresAt).toBeDefined();
    expect(new Date(userInDb!.emailVerifyExpiresAt!).getTime()).toBeGreaterThan(Date.now());

    // 3. Invariant: Password MUST be Argon2id hashed and never plaintext
    expect(userInDb!.passwordHash).not.toBe(password);
    expect(userInDb!.passwordHash.startsWith('$argon2id$')).toBe(true);
    const isPasswordValid = await argon2.verify(userInDb!.passwordHash, password);
    expect(isPasswordValid).toBe(true);

    // 4. Verify Mailpit delivery
    const mailpitRes = await fetch('http://localhost:8025/api/v1/messages');
    expect(mailpitRes.ok).toBe(true);
    const mailpitData = (await mailpitRes.json()) as {
      messages: Array<{
        ID: string;
        To: Array<{ Address: string }>;
        Subject: string;
        Snippet: string;
      }>;
    };

    const sentMessage = mailpitData.messages.find((m) =>
      m.To.some((recipient) => recipient.Address.toLowerCase() === uniqueEmail.toLowerCase()),
    );
    expect(sentMessage).toBeDefined();
    expect(sentMessage!.Subject).toBe('Verify your Memoir email address');

    // Retrieve raw message to extract verification token
    const messageDetailRes = await fetch(`http://localhost:8025/api/v1/message/${sentMessage!.ID}`);
    const messageDetail = (await messageDetailRes.json()) as { Text: string };
    const tokenMatch = messageDetail.Text.match(/token=([a-f0-9]+)/);
    expect(tokenMatch).toBeDefined();
    const rawToken = tokenMatch![1];
    expect(rawToken).toBeDefined();

    // 5. Verify email with extracted token
    const verifyRes = await authService.verifyEmail({ token: rawToken! });
    expect(verifyRes.message).toBe('Email verified successfully. You may now log in.');

    // Check updated user state in database
    const verifiedUser = await prisma.user.findUnique({
      where: { email: uniqueEmail },
    });
    expect(verifiedUser!.emailVerifiedAt).not.toBeNull();
    expect(verifiedUser!.emailVerifyTokenHash).toBeNull();
    expect(verifiedUser!.emailVerifyExpiresAt).toBeNull();

    // Check security event logged
    const securityEvents = await prisma.securityEvent.findMany({
      where: { userId: verifiedUser!.id },
    });
    expect(securityEvents.length).toBeGreaterThan(0);
    expect(securityEvents.some((e) => e.eventType === SecurityEventType.EMAIL_VERIFIED)).toBe(true);

    // 6. Test replay rejection (token cannot be reused once verified)
    await expect(authService.verifyEmail({ token: rawToken! })).rejects.toThrow(
      'Invalid or expired email verification link.',
    );

    // 7. Test anti-enumeration on duplicate registration
    const dupRes = await authService.register({
      email: uniqueEmail,
      password: 'DifferentPassword123!',
    });
    expect(dupRes.message).toBe(
      'If this email address is eligible, a verification email has been sent.',
    );

    // Ensure password was not altered
    const recheckUser = await prisma.user.findUnique({
      where: { email: uniqueEmail },
    });
    const stillValid = await argon2.verify(recheckUser!.passwordHash, password);
    expect(stillValid).toBe(true);

    // Cleanup test user
    await prisma.user.delete({ where: { id: userInDb!.id } });
  });

  it('rejects invalid or malformed verification tokens', async () => {
    await expect(
      authService.verifyEmail({ token: 'completely_invalid_token_12345' }),
    ).rejects.toThrow('Invalid or expired email verification link.');
  });
});
