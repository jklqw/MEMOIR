import * as crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service.js';
import { AppConfigService } from '../src/config/config.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { LocalStorageProvider } from '../src/storage/providers/local-storage.provider.js';
import {
  MAX_FILE_SIZE,
  StorageService,
  USER_STORAGE_QUOTA,
} from '../src/storage/storage.service.js';

describe('Private Attachment Storage Abstraction & Quota Enforcement', () => {
  let prisma: PrismaService;
  let authService: AuthService;
  let storageService: StorageService;
  let localStorageProvider: LocalStorageProvider;
  let testUserId: string;

  beforeAll(async () => {
    const configService = new AppConfigService();
    prisma = new PrismaService();
    await prisma.$connect();
    const mailService = new MailService(configService);
    authService = new AuthService(prisma, mailService);

    localStorageProvider = new LocalStorageProvider('./storage/test-attachments');
    storageService = new StorageService(prisma, localStorageProvider);

    const email = `storage-test-${Date.now()}@example.com`;
    await authService.register({ email, password: 'Password12345!' });
    const user = await prisma.user.findUnique({ where: { email } });
    testUserId = user!.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Generates server-controlled UUIDv4 storage keys eliminating client path traversal', () => {
    const key = storageService.generateStorageKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.enc$/i);
  });

  it('2. Rejects path traversal attempts with BadRequestException', async () => {
    const maliciousKeys = [
      '../secret.txt',
      '../../etc/passwd',
      '..\\windows\\system32',
      'arbitrary-name.png',
      '/absolute/path.enc',
    ];

    for (const badKey of maliciousKeys) {
      await expect(localStorageProvider.upload(badKey, Buffer.from('data'))).rejects.toThrow(
        BadRequestException,
      );
      await expect(localStorageProvider.download(badKey)).rejects.toThrow(BadRequestException);
      await expect(localStorageProvider.delete(badKey)).rejects.toThrow(BadRequestException);
    }
  });

  it('3. Writes and reads opaque encrypted binary files via LocalStorageProvider', async () => {
    const storageKey = storageService.generateStorageKey();
    const payload = crypto.randomBytes(1024); // 1 KB binary ciphertext

    await storageService.saveFile(storageKey, payload);

    const readBytes = await storageService.getFile(storageKey);
    expect(readBytes.equals(payload)).toBe(true);

    // Clean up
    await storageService.deleteFile(storageKey);
  });

  it('4. Enforces per-file 10 MB limit', async () => {
    const oversizedBytes = MAX_FILE_SIZE + 1; // 10 MB + 1 byte
    await expect(storageService.validateQuota(testUserId, oversizedBytes)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('5. Enforces per-user 250 MB storage quota accurately', async () => {
    // Check initial quota
    const initialUsage = await storageService.getUserStorageUsage(testUserId);
    expect(initialUsage.usedBytes).toBe(0);
    expect(initialUsage.quotaBytes).toBe(USER_STORAGE_QUOTA);
    expect(initialUsage.percentage).toBe(0);

    // Create attachment records totaling near quota limit
    const mockStorageKey = storageService.generateStorageKey();
    const largeSize = 245 * 1024 * 1024; // 245 MB

    await prisma.attachment.create({
      data: {
        userId: testUserId,
        storageKey: mockStorageKey,
        byteSize: largeSize,
        wrappedFileKey: 'mock-wrapped-key',
        fileKeyNonce: 'mock-file-key-nonce',
        encryptedMetadata: 'mock-encrypted-metadata',
        metaNonce: 'mock-meta-nonce',
        fileNonce: 'mock-file-nonce',
      },
    });

    // Validating an 8 MB upload should succeed (245 + 8 = 253 MB <= 250 MB? Wait, 253 > 250!)
    const eightMb = 8 * 1024 * 1024;
    await expect(storageService.validateQuota(testUserId, eightMb)).rejects.toThrow(
      /User storage quota exceeded/,
    );

    // But a 4 MB upload should succeed (245 + 4 = 249 MB <= 250 MB)
    const fourMb = 4 * 1024 * 1024;
    await expect(storageService.validateQuota(testUserId, fourMb)).resolves.not.toThrow();

    // Verify usage percentage calculation
    const usage = await storageService.getUserStorageUsage(testUserId);
    expect(usage.usedBytes).toBe(largeSize);
    expect(usage.percentage).toBe(98); // 245 / 250 = 98%
  });
});
