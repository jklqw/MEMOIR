import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  createAndAuthenticateUser,
  createSecurityTestApp,
  createTestAttachment,
  createTestMemory,
  createTestVault,
  type TestUserAuth,
} from './security-test-helper.js';

describe('Security Regression Suite — Cross-User IDOR Isolation', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let userA: TestUserAuth;
  let userB: TestUserAuth;
  let userAMemoryId: string;
  let userAAttachmentId: string;
  let userASessionId: string;

  beforeAll(async () => {
    const initialized = await createSecurityTestApp();
    app = initialized.app;
    prisma = initialized.prisma;

    // Create User A and User B
    userA = await createAndAuthenticateUser(app, prisma, 'idor-user-a');
    userB = await createAndAuthenticateUser(app, prisma, 'idor-user-b');

    // User A initializes zero-knowledge vault
    await createTestVault(app, userA);

    // User A creates an encrypted memory
    const memoryResult = await createTestMemory(app, userA, {
      ciphertext: 'dXNlci1hLWVuY3J5cHRlZC1tZW1vcnk=',
      nonce: 'dXNlci1hLW5vbmNlLTEyMzQ=',
    });
    userAMemoryId = memoryResult.memoryId;

    // User A creates an encrypted attachment
    const attachmentResult = await createTestAttachment(app, userA, {
      wrappedFileKey: 'user-a-wrapped-file-key',
      ciphertext: Buffer.from('user-a-secret-file-content').toString('base64url'),
    });
    userAAttachmentId = attachmentResult.attachmentId;

    // Retrieve User A's active session ID from DB
    const sessionRecord = await prisma.session.findFirst({
      where: { userId: userA.userId, revokedAt: null },
    });
    expect(sessionRecord).toBeDefined();
    userASessionId = sessionRecord!.id;
  });

  afterAll(async () => {
    const ids = [userA?.userId, userB?.userId].filter((id): id is string => Boolean(id));
    if (ids.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: ids } },
      });
    }
    await app.close();
  });

  describe('1. Memory Endpoint IDOR Isolation', () => {
    it('denies User B reading User A memory via GET /memories/:id (404 Not Found)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/memories/${userAMemoryId}`)
        .set('Cookie', [userB.sessionCookie]);

      expect(res.status).toBe(404);
      expect(res.body.error?.message).toMatch(/not found/i);
    });

    it('denies User B updating User A memory via PATCH /memories/:id (404 Not Found)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/memories/${userAMemoryId}`)
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [userB.sessionCookie, userB.csrfCookie])
        .set('x-csrf-token', userB.csrfToken)
        .send({
          ciphertext: 'dGFtcGVyZWQtY2lwaGVydGV4dA==',
          nonce: 'bmV3LW5vbmNlLTk2Yml0cw==',
        });

      expect(res.status).toBe(404);
    });

    it('denies User B pinning User A memory via POST /memories/:id/pin (404 Not Found)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/memories/${userAMemoryId}/pin`)
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [userB.sessionCookie, userB.csrfCookie])
        .set('x-csrf-token', userB.csrfToken);

      expect(res.status).toBe(404);
    });

    it('denies User B archiving User A memory via POST /memories/:id/archive (404 Not Found)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/memories/${userAMemoryId}/archive`)
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [userB.sessionCookie, userB.csrfCookie])
        .set('x-csrf-token', userB.csrfToken);

      expect(res.status).toBe(404);
    });

    it('denies User B deleting User A memory via DELETE /memories/:id (404 Not Found)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/memories/${userAMemoryId}`)
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [userB.sessionCookie, userB.csrfCookie])
        .set('x-csrf-token', userB.csrfToken);

      expect(res.status).toBe(404);
    });

    it('excludes User A memories from User B timeline via GET /memories', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/memories')
        .set('Cookie', [userB.sessionCookie]);

      expect(res.status).toBe(200);
      const list = res.body.data;
      expect(Array.isArray(list)).toBe(true);
      expect(list.some((m: { id: string }) => m.id === userAMemoryId)).toBe(false);
    });
  });

  describe('2. Attachment Endpoint IDOR Isolation', () => {
    it('denies User B reading User A attachment metadata via GET /attachments/:id (404 Not Found)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/attachments/${userAAttachmentId}`)
        .set('Cookie', [userB.sessionCookie]);

      expect(res.status).toBe(404);
    });

    it('denies User B downloading User A attachment binary via GET /attachments/:id/download (404 Not Found)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/attachments/${userAAttachmentId}/download`)
        .set('Cookie', [userB.sessionCookie]);

      expect(res.status).toBe(404);
    });

    it('denies User B deleting User A attachment via DELETE /attachments/:id (404 Not Found)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/attachments/${userAAttachmentId}`)
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [userB.sessionCookie, userB.csrfCookie])
        .set('x-csrf-token', userB.csrfToken);

      expect(res.status).toBe(404);
    });

    it('excludes User A attachments from User B list via GET /attachments', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/attachments')
        .set('Cookie', [userB.sessionCookie]);

      expect(res.status).toBe(200);
      const list = res.body.data;
      expect(Array.isArray(list)).toBe(true);
      expect(list.some((a: { id: string }) => a.id === userAAttachmentId)).toBe(false);
    });
  });

  describe('3. Session Endpoint IDOR Isolation', () => {
    it('denies User B revoking User A session via DELETE /sessions/:id (404 Not Found)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/sessions/${userASessionId}`)
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [userB.sessionCookie, userB.csrfCookie])
        .set('x-csrf-token', userB.csrfToken);

      expect(res.status).toBe(404);

      // Verify User A session remains active in DB
      const sessionInDb = await prisma.session.findUnique({
        where: { id: userASessionId },
      });
      expect(sessionInDb!.revokedAt).toBeNull();
    });

    it('excludes User A sessions from User B active session list via GET /sessions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/sessions')
        .set('Cookie', [userB.sessionCookie]);

      expect(res.status).toBe(200);
      const sessions = res.body.data || res.body;
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.some((s: { id: string }) => s.id === userASessionId)).toBe(false);
    });
  });

  describe('4. Vault & Audit IDOR Isolation', () => {
    it('isolates zero-knowledge vault: User B cannot access User A vault data via GET /vault', async () => {
      // User B has not set up a vault yet
      const res = await request(app.getHttpServer())
        .get('/api/v1/vault')
        .set('Cookie', [userB.sessionCookie]);

      expect(res.status).toBe(200);
      // Data must be null because User B has no vault; User A vault must NEVER be returned
      expect(res.body.data).toBeNull();
    });

    it('isolates security audit events: User B cannot see User A security events via GET /audit/events', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit/events')
        .set('Cookie', [userB.sessionCookie]);

      expect(res.status).toBe(200);
      const events = res.body.data?.events || res.body.data;
      expect(Array.isArray(events)).toBe(true);
      // None of the events may belong to userA
      for (const event of events) {
        expect(event.userId).toBeUndefined(); // API sanitizes userId from client response
      }

      // Verify directly against DB that User A events exist but are not returned to User B
      const userAEvents = await prisma.securityEvent.findMany({
        where: { userId: userA.userId },
      });
      expect(userAEvents.length).toBeGreaterThan(0);
      const userAEventIds = new Set(userAEvents.map((e) => e.id));

      for (const event of events) {
        expect(userAEventIds.has(event.id)).toBe(false);
      }
    });
  });
});
