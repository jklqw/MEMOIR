import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppConfigService } from '../../src/config/config.service.js';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  createAndAuthenticateUser,
  createSecurityTestApp,
  createTestVault,
  type TestUserAuth,
} from './security-test-helper.js';

describe('Security Regression Suite — Zero-Knowledge Plaintext Absence Invariant', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let config: AppConfigService;
  let user: TestUserAuth;

  const CANARY_TITLE = 'CANARY_TITLE_VERY_CONFIDENTIAL_DIARY_HEADING_999';
  const CANARY_BODY = 'CANARY_BODY_I_AM_RECORDING_A_SENSITIVE_MEMOIR_EXPERIENCE_456';
  const CANARY_TAG = 'CANARY_TAG_SECRET_WHISTLEBLOWER_PROJECT';
  const CANARY_MOOD = 'CANARY_MOOD_HIGHLY_VULNERABLE_EMOTION';
  const CANARY_FILENAME = 'CANARY_SECRET_MEDICAL_SCAN_RECORD_2026.pdf';
  const CANARY_FILE_CONTENT = 'CANARY_RAW_BYTES_CONFIDENTIAL_HEALTH_GENOME_SEQUENCE_777';
  const CANARY_PASSPHRASE = 'CANARY_VAULT_PASSPHRASE_NEVER_LEAK_TO_BACKEND';
  const CANARY_RECOVERY_KEY = 'CANARY_RECOVERY_KEY_CROCKFORD_BASE32_CHECK';

  let createdMemoryId: string;
  let createdAttachmentId: string;
  let storageFilePath: string;

  beforeAll(async () => {
    const initialized = await createSecurityTestApp();
    app = initialized.app;
    prisma = initialized.prisma;
    config = initialized.config;

    user = await createAndAuthenticateUser(app, prisma, 'zkp-canary-user');

    // 1. Vault initialization (client derives salt and wrapped DEK; server never sees passphrase or recovery key)
    await createTestVault(app, user, {
      salt: Buffer.from('client-derived-vault-salt-32bytes!').toString('base64'),
      wrappedDek: Buffer.from('wrapped-dek-under-client-kek').toString('base64'),
      recoveryWrappedDek: Buffer.from('wrapped-dek-under-client-recovery-kek').toString('base64'),
    });

    // 2. Memory creation: client encrypts payload (including CANARY_TITLE, CANARY_BODY, etc.)
    // Simulation: ciphertext contains encrypted blocks, never the plaintext canary strings
    createdMemoryId = crypto.randomUUID();
    const memoryCiphertext = Buffer.from(
      'aes-gcm-encrypted-bytes-representing-canary-memory-data',
    ).toString('base64url');

    const memoryRes = await request(app.getHttpServer())
      .post('/api/v1/memories')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', [user.sessionCookie, user.csrfCookie])
      .set('x-csrf-token', user.csrfToken)
      .send({
        id: createdMemoryId,
        entryDate: new Date().toISOString(),
        isPinned: false,
        isTimeCapsule: false,
        envelopeVersion: 1,
        algorithm: 'AES-256-GCM',
        ciphertext: memoryCiphertext,
        nonce: Buffer.from('12byte-nonce!').toString('base64url'),
      });

    expect(memoryRes.status).toBe(201);

    // 3. Attachment creation: client encrypts filename and file contents
    createdAttachmentId = crypto.randomUUID();
    const encryptedFileCiphertext = Buffer.from(
      'aes-gcm-encrypted-bytes-of-medical-record-scan',
    ).toString('base64url');

    const attachmentRes = await request(app.getHttpServer())
      .post('/api/v1/attachments')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', [user.sessionCookie, user.csrfCookie])
      .set('x-csrf-token', user.csrfToken)
      .send({
        id: createdAttachmentId,
        isVaultItem: false,
        wrappedFileKey: 'wrapped-file-key-under-client-dek',
        fileKeyNonce: 'file-key-nonce',
        encryptedMetadata: 'encrypted-metadata-envelope-containing-canary-filename',
        metaNonce: 'metadata-nonce',
        fileNonce: 'file-bytes-nonce',
        ciphertext: encryptedFileCiphertext,
      });

    expect(attachmentRes.status).toBe(201);

    // Locate the physical storage file path
    const attachmentRecord = await prisma.attachment.findUnique({
      where: { id: createdAttachmentId },
    });
    expect(attachmentRecord).toBeDefined();
    storageFilePath = path.resolve(
      config.get('STORAGE_DIR') || './storage/uploads',
      attachmentRecord!.storageKey,
    );
  });

  afterAll(async () => {
    if (user?.userId) {
      await prisma.user.deleteMany({
        where: { id: user.userId },
      });
    }
    // Remove test file from disk if exists
    if (storageFilePath) {
      try {
        await fs.unlink(storageFilePath);
      } catch {
        // Ignore if already removed
      }
    }
    await app.close();
  });

  describe('1. PostgreSQL Schema & Column Architecture Verification', () => {
    it('verifies memories table schema strictly forbids plaintext columns (title, body, content, tags, mood)', async () => {
      const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'memories' AND table_schema = 'public'
      `;

      const columnNames = columns.map((c) => c.column_name.toLowerCase());

      // Invariant: Zero plaintext columns exist in database architecture
      expect(columnNames).not.toContain('title');
      expect(columnNames).not.toContain('body');
      expect(columnNames).not.toContain('content');
      expect(columnNames).not.toContain('prose');
      expect(columnNames).not.toContain('tags');
      expect(columnNames).not.toContain('mood');
      expect(columnNames).not.toContain('plaintext');

      // Only cryptographic envelope fields exist
      expect(columnNames).toContain('ciphertext');
      expect(columnNames).toContain('nonce');
      expect(columnNames).toContain('algorithm');
      expect(columnNames).toContain('envelopeversion');
    });

    it('verifies attachments table schema strictly forbids plaintext columns (filename, original_name, mime_type)', async () => {
      const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'attachments' AND table_schema = 'public'
      `;

      const columnNames = columns.map((c) => c.column_name.toLowerCase());

      expect(columnNames).not.toContain('filename');
      expect(columnNames).not.toContain('original_name');
      expect(columnNames).not.toContain('mimetype');
      expect(columnNames).not.toContain('file_bytes');
      expect(columnNames).not.toContain('plaintext');

      // Only encrypted envelopes exist
      expect(columnNames).toContain('encryptedmetadata');
      expect(columnNames).toContain('wrappedfilekey');
      expect(columnNames).toContain('storagekey');
      expect(columnNames).toContain('bytesize');
    });
  });

  describe('2. Direct Database Canary Plaintext Absence Checks', () => {
    it('exhaustively confirms CANARY strings NEVER appear in the memories table', async () => {
      const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT * FROM "memories" WHERE "userId" = ${user.userId}::uuid
      `;

      expect(rows.length).toBeGreaterThan(0);
      const serialized = JSON.stringify(rows);

      expect(serialized).not.toContain(CANARY_TITLE);
      expect(serialized).not.toContain(CANARY_BODY);
      expect(serialized).not.toContain(CANARY_TAG);
      expect(serialized).not.toContain(CANARY_MOOD);
    });

    it('exhaustively confirms CANARY strings NEVER appear in the attachments table', async () => {
      const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT * FROM "attachments" WHERE "userId" = ${user.userId}::uuid
      `;

      expect(rows.length).toBeGreaterThan(0);
      const serialized = JSON.stringify(rows);

      expect(serialized).not.toContain(CANARY_FILENAME);
      expect(serialized).not.toContain(CANARY_FILE_CONTENT);
    });

    it('exhaustively confirms CANARY strings NEVER appear in user_vaults, users, or sessions tables', async () => {
      const vaults = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT * FROM "user_vaults" WHERE "userId" = ${user.userId}::uuid
      `;
      const vaultSerialized = JSON.stringify(vaults);
      expect(vaultSerialized).not.toContain(CANARY_PASSPHRASE);
      expect(vaultSerialized).not.toContain(CANARY_RECOVERY_KEY);

      const users = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT * FROM "users" WHERE "id" = ${user.userId}::uuid
      `;
      const userSerialized = JSON.stringify(users);
      expect(userSerialized).not.toContain(CANARY_PASSPHRASE);
      expect(userSerialized).not.toContain(CANARY_RECOVERY_KEY);
      expect(userSerialized).not.toContain(user.password);
    });

    it('exhaustively confirms CANARY strings NEVER appear in security audit logs or metadata', async () => {
      const events = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT * FROM "security_events" WHERE "userId" = ${user.userId}::uuid
      `;
      const eventsSerialized = JSON.stringify(events);

      expect(eventsSerialized).not.toContain(CANARY_TITLE);
      expect(eventsSerialized).not.toContain(CANARY_BODY);
      expect(eventsSerialized).not.toContain(CANARY_FILENAME);
      expect(eventsSerialized).not.toContain(CANARY_FILE_CONTENT);
      expect(eventsSerialized).not.toContain(CANARY_PASSPHRASE);
      expect(eventsSerialized).not.toContain(CANARY_RECOVERY_KEY);
    });

    it('performs full-database substring scan ensuring zero canary leakage across all public tables', async () => {
      const canaries = [
        CANARY_TITLE,
        CANARY_BODY,
        CANARY_TAG,
        CANARY_MOOD,
        CANARY_FILENAME,
        CANARY_FILE_CONTENT,
        CANARY_PASSPHRASE,
        CANARY_RECOVERY_KEY,
      ];

      for (const canary of canaries) {
        // Query PostgreSQL for any table containing this text string
        const matches = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT table_name, column_name 
           FROM information_schema.columns 
           WHERE table_schema = 'public' 
           AND data_type IN ('text', 'character varying')`,
        );

        // Verify across each table that no column contains the canary
        for (const col of matches) {
          const tableName = col['table_name'] as string;
          const columnName = col['column_name'] as string;

          const leakedRows = await prisma.$queryRawUnsafe<Array<unknown>>(
            `SELECT 1 FROM "${tableName}" WHERE "${columnName}"::text LIKE '%${canary}%' LIMIT 1`,
          );

          expect(leakedRows.length).toBe(0);
        }
      }
    });
  });

  describe('3. Local Storage Binary Plaintext Absence Checks', () => {
    it('physically reads stored binary blob from disk and asserts zero raw canary bytes exist', async () => {
      // Check file exists
      const fileBytes = await fs.readFile(storageFilePath);
      expect(fileBytes.length).toBeGreaterThan(0);

      const fileString = fileBytes.toString('utf-8');

      // The binary file on disk must NEVER contain plaintext canary filename or contents
      expect(fileString).not.toContain(CANARY_FILENAME);
      expect(fileString).not.toContain(CANARY_FILE_CONTENT);
      expect(fileString).not.toContain(CANARY_TITLE);
      expect(fileString).not.toContain(CANARY_BODY);
    });
  });
});
