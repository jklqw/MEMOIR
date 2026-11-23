import * as crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { BackupsService } from '../src/backups/backups.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AppConfigService } from '../src/config/config.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { VaultService } from '../src/vault/vault.service.js';
import { MemoriesService } from '../src/memories/memories.service.js';

describe('Data Portability, Encrypted Backup Export & Import Integration', () => {
  let prisma: PrismaService;
  let authService: AuthService;
  let vaultService: VaultService;
  let memoriesService: MemoriesService;
  let backupsService: BackupsService;

  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    const configService = new AppConfigService();
    prisma = new PrismaService();
    await prisma.$connect();
    const mailService = new MailService(configService);
    authService = new AuthService(prisma, mailService);
    vaultService = new VaultService(prisma);
    memoriesService = new MemoriesService(prisma);
    backupsService = new BackupsService(prisma);

    // Register User A
    const emailA = `backup-test-a-${Date.now()}@example.com`;
    await authService.register({ email: emailA, password: 'Password12345!' });
    const userA = await prisma.user.findUnique({ where: { email: emailA } });
    userAId = userA!.id;

    // Register User B
    const emailB = `backup-test-b-${Date.now()}@example.com`;
    await authService.register({ email: emailB, password: 'Password12345!' });
    const userB = await prisma.user.findUnique({ where: { email: emailB } });
    userBId = userB!.id;

    // Initialize Vault for User A
    await vaultService.createVault(userAId, {
      kdfAlgorithm: 'ARGON2ID',
      kdfSalt: 'test-kdf-salt-user-a',
      kdfMemory: 65536,
      kdfIterations: 3,
      kdfParallelism: 1,
      wrapAlgorithm: 'AES-256-GCM',
      envelopeVersion: 1,
      wrappedDek: 'test-wrapped-dek-user-a',
      wrappedDekNonce: 'test-wrapped-nonce-user-a',
      recoverySalt: 'test-recovery-salt-user-a',
      recoveryWrappedDek: 'test-recovery-dek-user-a',
      recoveryNonce: 'test-recovery-nonce-user-a',
      recoveryKeyFingerprint: 'TEST-FINGERPRINT-USER-A',
    });

    // Create 2 memories for User A
    await memoriesService.create(userAId, {
      id: crypto.randomUUID(),
      entryDate: new Date('2026-11-20T10:00:00Z').toISOString(),
      ciphertext: 'test-opaque-memory-ciphertext-1',
      nonce: 'test-nonce-1',
      isPinned: true,
    });

    await memoriesService.create(userAId, {
      id: crypto.randomUUID(),
      entryDate: new Date('2026-11-21T12:00:00Z').toISOString(),
      ciphertext: 'test-opaque-memory-ciphertext-2',
      nonce: 'test-nonce-2',
      isPinned: false,
    });

    // Create 1 attachment for User A
    await prisma.attachment.create({
      data: {
        id: crypto.randomUUID(),
        userId: userAId,
        isVaultItem: true,
        storageKey: crypto.randomUUID(),
        byteSize: 1024,
        wrappedFileKey: 'test-wrapped-file-key',
        fileKeyNonce: 'test-file-key-nonce',
        encryptedMetadata: 'test-meta-ciphertext',
        metaNonce: 'test-meta-nonce',
        fileNonce: 'test-file-nonce',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Exports complete encrypted backup with valid SHA-256 integrity manifest and audit event', async () => {
    const backup = await backupsService.exportBackup(userAId);

    expect(backup.manifest).toBeDefined();
    expect(backup.manifest.version).toBe(1);
    expect(backup.manifest.userId).toBe(userAId);
    expect(backup.manifest.entryCount).toBe(3); // 2 memories + 1 attachment
    expect(backup.manifest.checksumSha256).toBeDefined();

    // Verify cryptographic integrity of export payload
    const dataPayloadString = JSON.stringify({
      vault: backup.vault,
      memories: backup.memories,
      attachments: backup.attachments,
    });
    const calculatedHash = crypto.createHash('sha256').update(dataPayloadString).digest('hex');
    expect(calculatedHash).toBe(backup.manifest.checksumSha256);

    // Verify backup record in DB
    const backupRecord = await prisma.backup.findFirst({
      where: { userId: userAId },
      orderBy: { createdAt: 'desc' },
    });
    expect(backupRecord).toBeDefined();
    expect(backupRecord?.checksumSha256).toBe(backup.manifest.checksumSha256);
    expect(backupRecord?.entryCount).toBe(3);

    // Verify BACKUP_EXPORTED security event was logged
    const securityEvent = await prisma.securityEvent.findFirst({
      where: { userId: userAId, eventType: 'BACKUP_EXPORTED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(securityEvent).toBeDefined();
    const metadata = securityEvent?.safeMetadata as Record<string, unknown>;
    expect(metadata.entryCount).toBe(3);
  });

  it('2. Rejects tampered backup import when SHA-256 checksum does not match', async () => {
    const backup = await backupsService.exportBackup(userAId);

    // Tamper with memory ciphertext
    const tamperedBackup = JSON.parse(JSON.stringify(backup));
    tamperedBackup.memories[0].ciphertext = 'tampered-ciphertext-bytes';

    await expect(backupsService.importBackup(userBId, tamperedBackup)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('3. Rejects unsupported backup manifest version', async () => {
    const backup = await backupsService.exportBackup(userAId);
    const invalidVersionBackup = JSON.parse(JSON.stringify(backup));
    invalidVersionBackup.manifest.version = 999;

    await expect(backupsService.importBackup(userBId, invalidVersionBackup)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('4. Successfully imports and restores backup into another user account with ownership remapping', async () => {
    const backup = await backupsService.exportBackup(userAId);

    const result = await backupsService.importBackup(userBId, backup);

    expect(result.restoredMemoriesCount).toBe(2);
    expect(result.restoredAttachmentsCount).toBe(1);

    // Verify User B's vault and memories were created and owned by User B
    const userBMemories = await prisma.memory.findMany({
      where: { userId: userBId },
    });
    expect(userBMemories.length).toBe(2);

    const userBAttachments = await prisma.attachment.findMany({
      where: { userId: userBId },
    });
    expect(userBAttachments.length).toBe(1);
    expect(userBAttachments[0].userId).toBe(userBId);
  });

  it('5. Retrieves backup history for user and enforces isolation', async () => {
    const historyA = await backupsService.getHistory(userAId);
    expect(historyA.length).toBeGreaterThanOrEqual(1);
    expect(historyA[0].userId).toBe(userAId);

    const historyB = await backupsService.getHistory(userBId);
    expect(historyB.length).toBe(0); // User B hasn't run an export
  });
});
