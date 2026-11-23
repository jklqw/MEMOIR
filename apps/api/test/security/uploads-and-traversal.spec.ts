import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { LocalStorageProvider } from '../../src/storage/providers/local-storage.provider.js';
import {
  createAndAuthenticateUser,
  createSecurityTestApp,
  type TestUserAuth,
} from './security-test-helper.js';

describe('Security Regression Suite — Uploads, Envelopes & Path Traversal Defenses', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let user: TestUserAuth;
  let localStorageProvider: LocalStorageProvider;

  beforeAll(async () => {
    const initialized = await createSecurityTestApp();
    app = initialized.app;
    prisma = initialized.prisma;
    localStorageProvider = new LocalStorageProvider('./storage/test-security-traversal');

    user = await createAndAuthenticateUser(app, prisma, 'upload-user');
  });

  afterAll(async () => {
    if (user?.userId) {
      await prisma.user.deleteMany({
        where: { id: user.userId },
      });
    }
    await app.close();
  });

  describe('1. File Size & Storage Limits', () => {
    it('rejects oversized attachment uploads exceeding 10 MB limit (400 Bad Request)', async () => {
      // 11 MB buffer
      const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024, 0x41);
      const oversizedBase64 = oversizedBuffer.toString('base64url');

      const res = await request(app.getHttpServer())
        .post('/api/v1/attachments')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [user.sessionCookie, user.csrfCookie])
        .set('x-csrf-token', user.csrfToken)
        .send({
          id: crypto.randomUUID(),
          isVaultItem: false,
          wrappedFileKey: 'test-wrapped-file-key',
          fileKeyNonce: 'test-file-key-nonce',
          encryptedMetadata: 'test-encrypted-metadata',
          metaNonce: 'test-meta-nonce',
          fileNonce: 'test-file-nonce',
          ciphertext: oversizedBase64,
        });

      expect([400, 413]).toContain(res.status);
      expect(res.body.error?.message).toMatch(
        /(exceeds the maximum allowed limit of 10 MB|payload too large)/i,
      );
    });

    it('rejects empty attachment payload (0 bytes) with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/attachments')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [user.sessionCookie, user.csrfCookie])
        .set('x-csrf-token', user.csrfToken)
        .send({
          id: crypto.randomUUID(),
          isVaultItem: false,
          wrappedFileKey: 'test-wrapped-file-key',
          fileKeyNonce: 'test-file-key-nonce',
          encryptedMetadata: 'test-encrypted-metadata',
          metaNonce: 'test-meta-nonce',
          fileNonce: 'test-file-nonce',
          ciphertext: '', // Empty
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toMatch(/(cannot be empty|should not be empty|isNotEmpty)/i);
    });
  });

  describe('2. Encryption Envelope Validation & Mass Assignment Defenses', () => {
    it('rejects payloads missing mandatory cryptographic envelope fields', async () => {
      const incompletePayload = {
        id: crypto.randomUUID(),
        entryDate: new Date().toISOString(),
        // Missing ciphertext and nonce
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/memories')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [user.sessionCookie, user.csrfCookie])
        .set('x-csrf-token', user.csrfToken)
        .send(incompletePayload);

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toMatch(/(ciphertext|nonce) should not be empty/i);
    });

    it('rejects mass assignment payloads with unexpected or malicious properties', async () => {
      const maliciousPayload = {
        id: crypto.randomUUID(),
        entryDate: new Date().toISOString(),
        ciphertext: 'dGVzdA==',
        nonce: 'bm9uY2U=',
        isAdmin: true,
        role: 'SUPERUSER',
        userId: '00000000-0000-0000-0000-000000000000',
        deletedAt: null,
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/memories')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [user.sessionCookie, user.csrfCookie])
        .set('x-csrf-token', user.csrfToken)
        .send(maliciousPayload);

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toMatch(
        /property (isAdmin|role|userId|deletedAt) should not exist/i,
      );
    });
  });

  describe('3. Path Traversal & Safe Binary Streaming Defenses', () => {
    it('intercepts path traversal sequences in URL parameters via ParseUUIDPipe', async () => {
      const traversalPaths = [
        '../../etc/passwd',
        '..\\..\\windows\\win.ini',
        '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '....//....//etc/shadow',
      ];

      for (const traversal of traversalPaths) {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/attachments/${encodeURIComponent(traversal)}/download`)
          .set('Cookie', [user.sessionCookie]);

        expect(res.status).toBe(400);
        expect(res.body.error?.message).toMatch(/uuid is expected|validation/i);
      }
    });

    it('enforces UUIDv4 + .enc format in LocalStorageProvider to prevent traversal attempts', async () => {
      const invalidKeys = [
        '../../etc/passwd',
        '..\\..\\windows\\win.ini',
        '/etc/shadow',
        'arbitrary-file.txt',
        '12345678-1234-1234-1234-123456789abc', // Missing .enc extension
      ];

      for (const key of invalidKeys) {
        await expect(localStorageProvider.download(key)).rejects.toThrow(
          /directory traversal attempt rejected/i,
        );
        await expect(localStorageProvider.upload(key, Buffer.from('data'))).rejects.toThrow(
          /directory traversal attempt rejected/i,
        );
        await expect(localStorageProvider.exists(key)).rejects.toThrow(
          /directory traversal attempt rejected/i,
        );
        await expect(localStorageProvider.delete(key)).rejects.toThrow(
          /directory traversal attempt rejected/i,
        );
      }
    });

    it('enforces secure binary streaming headers on attachment download (application/octet-stream, nosniff, no-store)', async () => {
      // Create a valid attachment
      const attachmentId = crypto.randomUUID();
      const rawFileBytes = Buffer.from('binary-attachment-stream-test');

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/attachments')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [user.sessionCookie, user.csrfCookie])
        .set('x-csrf-token', user.csrfToken)
        .send({
          id: attachmentId,
          isVaultItem: false,
          wrappedFileKey: 'test-key',
          fileKeyNonce: 'test-nonce',
          encryptedMetadata: 'test-meta',
          metaNonce: 'test-meta-nonce',
          fileNonce: 'test-file-nonce',
          ciphertext: rawFileBytes.toString('base64url'),
        });

      expect(createRes.status).toBe(201);

      // Download attachment
      const downloadRes = await request(app.getHttpServer())
        .get(`/api/v1/attachments/${attachmentId}/download`)
        .set('Cookie', [user.sessionCookie]);

      expect(downloadRes.status).toBe(200);
      expect(downloadRes.headers['content-type']).toBe('application/octet-stream');
      expect(downloadRes.headers['content-disposition']).toBe(
        'attachment; filename="encrypted.bin"',
      );
      expect(downloadRes.headers['x-content-type-options']).toBe('nosniff');
      expect(downloadRes.headers['cache-control']).toContain('no-store');
      expect(downloadRes.headers['cache-control']).toContain('no-cache');
      expect(downloadRes.body.equals(rawFileBytes)).toBe(true);
    });
  });
});
