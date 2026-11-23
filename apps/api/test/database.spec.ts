import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountStatus, SecurityEventType } from '@memoir/shared';
import { PrismaClient } from '@prisma/client';

describe('Database & Prisma Schema Integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a user, creates a session and security event, and verifies cascade deletion', async () => {
    const testEmail = `test-user-${Date.now()}@example.com`;

    // 1. Create User
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=1$fake_hash_for_test',
        accountStatus: AccountStatus.ACTIVE,
      },
    });

    expect(user).toBeDefined();
    expect(user.id).toBeDefined();
    expect(user.email).toBe(testEmail);

    // 2. Create Session
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: `token-hash-${Date.now()}`,
        familyId: crypto.randomUUID(),
        deviceLabel: 'Firefox on Linux',
        userAgentSummary: 'Mozilla/5.0 Linux x86_64',
        ipMaskedOrHash: '127.0.0.x',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
    });

    expect(session.userId).toBe(user.id);

    // 3. Create SecurityEvent
    const event = await prisma.securityEvent.create({
      data: {
        userId: user.id,
        eventType: SecurityEventType.LOGIN_SUCCESS,
        safeMetadata: { ipMasked: '127.0.0.x' },
      },
    });

    expect(event.userId).toBe(user.id);
    expect(event.eventType).toBe(SecurityEventType.LOGIN_SUCCESS);

    // 4. Verify Cascade Delete
    await prisma.user.delete({
      where: { id: user.id },
    });

    const sessionLookup = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(sessionLookup).toBeNull();

    const eventLookup = await prisma.securityEvent.findUnique({
      where: { id: event.id },
    });
    expect(eventLookup).toBeNull();
  });
});
