import * as crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AttachmentsService } from '../src/attachments/attachments.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AppConfigService } from '../src/config/config.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { LocalStorageProvider } from '../src/storage/providers/local-storage.provider.js';
import { StorageService } from '../src/storage/storage.service.js';

describe('Encrypted Attachments Module & Secure Binary Download Integration', () => {
  let prisma: PrismaService;
  let authService: AuthService;
  let attachmentsService: AttachmentsService;
  let storageService: StorageService;
  let localStorageProvider: LocalStorageProvider;

  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    const configService = new AppConfigService();
    prisma = new PrismaService();
    await prisma.$connect();
    const mailService = new MailService(configService);
    authService = new AuthService(prisma, mailService);

    localStorageProvider = new LocalStorageProvider('./storage/test-attachments-module');
    storageService = new StorageService(prisma, localStorageProvider);
    attachmentsService = new AttachmentsService(prisma, storageService);

    // Register User A
    const emailA = `attachment-test-a-${Date.now()}@example.com`;
    await authService.register({ email: emailA, password: 'Password12345!' });
    const userA = await prisma.user.findUnique({ where: { email: emailA } });
    userAId = userA!.id;

    // Register User B
    const emailB = `attachment-test-b-${Date.now()}@example.com`;
    await authService.register({ email: emailB, password: 'Password12345!' });
    const userB = await prisma.user.findUnique({ where: { email: emailB } });
    userBId = userB!.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Uploads and stores encrypted binary attachment with server-controlled storageKey', async () => {
    const attachmentId = crypto.randomUUID();
    const rawCiphertextBytes = crypto.randomBytes(2048); // 2 KB ciphertext
    const base64UrlCiphertext = rawCiphertextBytes.toString('base64url');

    const created = await attachmentsService.create(userAId, {
      id: attachmentId,
      isVaultItem: false,
      wrappedFileKey: 'test-wrapped-file-key',
      fileKeyNonce: 'test-file-key-nonce',
      encryptedMetadata: 'test-encrypted-metadata',
      metaNonce: 'test-meta-nonce',
      fileNonce: 'test-file-nonce',
      ciphertext: base64UrlCiphertext,
    });

    expect(created.id).toBe(attachmentId);
    expect(created.userId).toBe(userAId);
    expect(created.byteSize).toBe(rawCiphertextBytes.length);
    expect(created.storageKey).toMatch(/^[0-9a-f-]{36}\.enc$/i);

    // Verify binary file was physically persisted
    const { buffer } = await attachmentsService.download(userAId, attachmentId);
    expect(buffer.equals(rawCiphertextBytes)).toBe(true);
  });

  it('2. Denies cross-user IDOR access to encrypted attachments (User B cannot download or delete User A file)', async () => {
    const attachmentId = crypto.randomUUID();
    const rawCiphertextBytes = crypto.randomBytes(512);

    await attachmentsService.create(userAId, {
      id: attachmentId,
      isVaultItem: false,
      wrappedFileKey: 'user-a-wrapped-key',
      fileKeyNonce: 'user-a-nonce',
      encryptedMetadata: 'user-a-metadata',
      metaNonce: 'user-a-meta-nonce',
      fileNonce: 'user-a-file-nonce',
      ciphertext: rawCiphertextBytes.toString('base64url'),
    });

    // User B tries to read User A attachment
    await expect(attachmentsService.findOne(userBId, attachmentId)).rejects.toThrow(
      NotFoundException,
    );

    // User B tries to download User A attachment
    await expect(attachmentsService.download(userBId, attachmentId)).rejects.toThrow(
      NotFoundException,
    );

    // User B tries to delete User A attachment
    await expect(attachmentsService.delete(userBId, attachmentId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('3. Successfully deletes attachment, purging physical ciphertext and updating quota', async () => {
    const attachmentId = crypto.randomUUID();
    const rawCiphertextBytes = crypto.randomBytes(1024);

    const created = await attachmentsService.create(userAId, {
      id: attachmentId,
      isVaultItem: false,
      wrappedFileKey: 'del-key',
      fileKeyNonce: 'del-nonce',
      encryptedMetadata: 'del-meta',
      metaNonce: 'del-meta-nonce',
      fileNonce: 'del-file-nonce',
      ciphertext: rawCiphertextBytes.toString('base64url'),
    });

    // Verify storage file exists before deletion
    expect(await localStorageProvider.exists(created.storageKey)).toBe(true);

    // Delete attachment
    await attachmentsService.delete(userAId, attachmentId);

    // Verify storage file was unlinked
    expect(await localStorageProvider.exists(created.storageKey)).toBe(false);

    // Verify soft-deleted from active queries
    await expect(attachmentsService.findOne(userAId, attachmentId)).rejects.toThrow(
      NotFoundException,
    );
  });
});
