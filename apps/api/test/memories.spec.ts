import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service.js';
import { AppConfigService } from '../src/config/config.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { MemoriesService } from '../src/memories/memories.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Encrypted Memory Core & Zero-Plaintext Persistence Integration', () => {
  let prisma: PrismaService;
  let authService: AuthService;
  let memoriesService: MemoriesService;
  let configService: AppConfigService;
  let mailService: MailService;

  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    configService = new AppConfigService();
    prisma = new PrismaService();
    await prisma.$connect();
    mailService = new MailService(configService);
    authService = new AuthService(prisma, mailService);
    memoriesService = new MemoriesService(prisma);

    // Register User A
    const emailA = `memory-test-a-${Date.now()}@example.com`;
    await authService.register({ email: emailA, password: 'Password12345!' });
    const userA = await prisma.user.findUnique({ where: { email: emailA } });
    userAId = userA!.id;

    // Register User B (for cross-user isolation tests)
    const emailB = `memory-test-b-${Date.now()}@example.com`;
    await authService.register({ email: emailB, password: 'Password12345!' });
    const userB = await prisma.user.findUnique({ where: { email: emailB } });
    userBId = userB!.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Creates client-side encrypted memory with pre-bound UUIDv4 and envelope metadata', async () => {
    const memoryId = crypto.randomUUID();
    const entryDate = new Date().toISOString();
    const nonce = 'bm9uY2UtOTZiaXQtY3Nwcm5n';
    const ciphertext = 'dGVzdC1lbmNyeXB0ZWQtbWVtb3J5LWJsb2Nrcw==';

    const created = await memoriesService.create(userAId, {
      id: memoryId,
      entryDate,
      isPinned: true,
      isTimeCapsule: false,
      envelopeVersion: 1,
      algorithm: 'AES-256-GCM',
      ciphertext,
      nonce,
    });

    expect(created.id).toBe(memoryId);
    expect(created.userId).toBe(userAId);
    expect(created.isPinned).toBe(true);
    expect(created.ciphertext).toBe(ciphertext);
    expect(created.nonce).toBe(nonce);
  });

  it('2. Directly asserts Zero-Knowledge Invariant in PostgreSQL (zero plaintext columns or values)', async () => {
    const rawRows = await prisma.$queryRaw<
      Array<Record<string, unknown>>
    >`SELECT * FROM "memories" WHERE "userId" = ${userAId}::uuid LIMIT 1`;

    expect(rawRows.length).toBe(1);
    const row = rawRows[0]!;

    // Columns present in memories table
    const columnKeys = Object.keys(row);

    // Strict invariant: verify columns NEVER contain title, body, tags, mood, or prose
    expect(columnKeys).not.toContain('title');
    expect(columnKeys).not.toContain('body');
    expect(columnKeys).not.toContain('content');
    expect(columnKeys).not.toContain('tags');
    expect(columnKeys).not.toContain('mood');
    expect(columnKeys).not.toContain('plaintext');

    // Verify row values: only encrypted ciphertext and nonce
    expect(typeof row['ciphertext']).toBe('string');
    expect(typeof row['nonce']).toBe('string');
    expect(row['ciphertext']).not.toContain('Dear Diary');
  });

  it('3. Denies cross-user IDOR access (User B cannot read, update, or delete User A memory)', async () => {
    const memoryId = crypto.randomUUID();
    await memoriesService.create(userAId, {
      id: memoryId,
      entryDate: new Date().toISOString(),
      isPinned: false,
      isTimeCapsule: false,
      envelopeVersion: 1,
      algorithm: 'AES-256-GCM',
      ciphertext: 'dXNlci1hLWNpcGhlcnRleHQ=',
      nonce: 'dXNlci1hLW5vbmNlLTE=',
    });

    // User B tries to read User A memory -> throws NotFoundException (never reveals existence)
    await expect(memoriesService.findOne(userBId, memoryId)).rejects.toThrow(NotFoundException);

    // User B tries to update User A memory -> throws NotFoundException
    await expect(
      memoriesService.update(userBId, memoryId, {
        ciphertext: 'bWFsaWNpb3VzLXVwZGF0ZQ==',
        nonce: 'bWFsaWNpb3VzLW5vbmNl',
      }),
    ).rejects.toThrow(NotFoundException);

    // User B tries to delete User A memory -> throws NotFoundException
    await expect(memoriesService.delete(userBId, memoryId)).rejects.toThrow(NotFoundException);

    // User B tries to toggle pin on User A memory -> throws NotFoundException
    await expect(memoriesService.togglePin(userBId, memoryId)).rejects.toThrow(NotFoundException);
  });

  it('4. Rejects nonce reuse on memory updates with 400 Bad Request', async () => {
    const memoryId = crypto.randomUUID();
    const initialNonce = 'c3BlY2lhbC1ub25jZS0wMDAx';

    await memoriesService.create(userAId, {
      id: memoryId,
      entryDate: new Date().toISOString(),
      isPinned: false,
      isTimeCapsule: false,
      envelopeVersion: 1,
      algorithm: 'AES-256-GCM',
      ciphertext: 'b3JpZ2luYWwtY2lwaGVydGV4dA==',
      nonce: initialNonce,
    });

    // Attempting to update with identical nonce must fail
    await expect(
      memoriesService.update(userAId, memoryId, {
        ciphertext: 'bmV3LWNpcGhlcnRleHQ=',
        nonce: initialNonce, // REUSED NONCE
      }),
    ).rejects.toThrow(BadRequestException);

    // Updating with fresh nonce succeeds
    const freshNonce = 'ZnJlc2gtbm9uY2UtOTZiaXQtMg==';
    const updated = await memoriesService.update(userAId, memoryId, {
      ciphertext: 'bmV3LWNpcGhlcnRleHQtMg==',
      nonce: freshNonce,
    });

    expect(updated.nonce).toBe(freshNonce);
    expect(updated.ciphertext).toBe('bmV3LWNpcGhlcnRleHQtMg==');
  });

  it('5. Enforces Time Capsule server-side withholding for unexpired sealed memories', async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days in future
    const memoryId = crypto.randomUUID();
    const sensitiveCiphertext = 'c2VhbGVkLXRpbWUtY2Fwc3VsZS1jaXBoZXJ0ZXh0';
    const sensitiveNonce = 'c2VhbGVkLW5vbmNl';

    await memoriesService.create(userAId, {
      id: memoryId,
      entryDate: new Date().toISOString(),
      isPinned: false,
      isTimeCapsule: true,
      unlockAt: futureDate.toISOString(),
      envelopeVersion: 1,
      algorithm: 'AES-256-GCM',
      ciphertext: sensitiveCiphertext,
      nonce: sensitiveNonce,
    });

    // When fetching via findOne or findAll, server masks ciphertext and nonce
    const fetched = await memoriesService.findOne(userAId, memoryId);
    expect(fetched.isLockedTimeCapsule).toBe(true);
    expect(fetched.ciphertext).toBeUndefined();
    expect(fetched.nonce).toBeUndefined();

    // Verify list masking
    const list = await memoriesService.findAll(userAId, {});
    const capsuleInList = list.find((m) => m.id === memoryId);
    expect(capsuleInList).toBeDefined();
    expect(capsuleInList!.isLockedTimeCapsule).toBe(true);
    expect(capsuleInList!.ciphertext).toBeUndefined();
    expect(capsuleInList!.nonce).toBeUndefined();
  });

  it('6. Supports Pin, Archive, and Restore workflows cleanly', async () => {
    const memoryId = crypto.randomUUID();

    await memoriesService.create(userAId, {
      id: memoryId,
      entryDate: new Date().toISOString(),
      isPinned: false,
      isTimeCapsule: false,
      envelopeVersion: 1,
      algorithm: 'AES-256-GCM',
      ciphertext: 'YXJjaGl2ZS10ZXN0LWNpcGhlcg==',
      nonce: 'YXJjaGl2ZS1ub25jZQ==',
    });

    // Toggle Pin
    const pinned = await memoriesService.togglePin(userAId, memoryId);
    expect(pinned.isPinned).toBe(true);

    // Toggle Archive
    const archived = await memoriesService.toggleArchive(userAId, memoryId);
    expect(archived.archivedAt).not.toBeNull();

    // List without archived should exclude it
    const activeList = await memoriesService.findAll(userAId, { includeArchived: false });
    expect(activeList.some((m) => m.id === memoryId)).toBe(false);

    // List with archived should include it
    const allList = await memoriesService.findAll(userAId, { includeArchived: true });
    expect(allList.some((m) => m.id === memoryId)).toBe(true);

    // Restore
    const restored = await memoriesService.restore(userAId, memoryId);
    expect(restored.archivedAt).toBeNull();
  });
});
