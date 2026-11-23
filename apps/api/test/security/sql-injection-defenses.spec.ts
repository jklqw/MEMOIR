import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  createAndAuthenticateUser,
  createSecurityTestApp,
  createTestMemory,
  type TestUserAuth,
} from './security-test-helper.js';

describe('Security Regression Suite — SQL & Parameter Injection Defenses', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let user: TestUserAuth;
  let validMemoryId: string;

  beforeAll(async () => {
    const initialized = await createSecurityTestApp();
    app = initialized.app;
    prisma = initialized.prisma;

    user = await createAndAuthenticateUser(app, prisma, 'sqli-user');

    const memoryRes = await createTestMemory(app, user, {
      ciphertext: 'c2FmZS1tZW1vcnktY2lwaGVydGV4dA==',
      nonce: 'c2FmZS1ub25jZS0wMDAx',
    });
    validMemoryId = memoryRes.memoryId;
  });

  afterAll(async () => {
    if (user?.userId) {
      await prisma.user.deleteMany({
        where: { id: user.userId },
      });
    }
    await app.close();
  });

  describe('1. Query Parameter Injection Defenses', () => {
    it('safely handles tautology SQL injection payloads in query parameters', async () => {
      const sqliPayloads = [
        "' OR '1'='1' --",
        "1' OR '1' = '1",
        "admin'--",
        "'; EXEC xp_cmdshell('dir'); --",
        "' OR 1=1#",
      ];

      for (const payload of sqliPayloads) {
        // Query param validation pipe safely rejects invalid formats (400) without SQL execution
        const res = await request(app.getHttpServer())
          .get(`/api/v1/memories?cursor=${encodeURIComponent(payload)}`)
          .set('Cookie', [user.sessionCookie]);

        expect(res.status).toBe(400);
        expect(res.body.error?.message).toMatch(/uuid|validation/i);
      }
    });

    it('safely handles destructive DDL SQL injection in query params without table drop', async () => {
      const dropPayload = "'; DROP TABLE memories CASCADE; --";

      const res = await request(app.getHttpServer())
        .get(`/api/v1/memories?cursor=${encodeURIComponent(dropPayload)}`)
        .set('Cookie', [user.sessionCookie]);

      expect(res.status).toBe(400);

      // Verify memories table still exists and data is intact in PostgreSQL
      const memoryCount = await prisma.memory.count();
      expect(memoryCount).toBeGreaterThan(0);
    });

    it('safely handles UNION-based injection payloads in audit event queries', async () => {
      const unionPayload = "' UNION SELECT id, email, password_hash, NULL, NULL, NULL FROM users --";

      const res = await request(app.getHttpServer())
        .get(`/api/v1/audit/events?eventType=${encodeURIComponent(unionPayload)}`)
        .set('Cookie', [user.sessionCookie]);

      // Either rejected by enum DTO validation (400) or safely executed without leaking user table
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        const events = res.body.data?.events || res.body.data;
        expect(Array.isArray(events)).toBe(true);
        expect(events.some((d: Record<string, unknown>) => d['password_hash'])).toBe(false);
      }
    });
  });

  describe('2. Path Parameter Injection Defenses', () => {
    it('rejects SQL injection in UUID path parameters via ParseUUIDPipe (400 Bad Request)', async () => {
      const pathPayloads = [
        "' OR '1'='1'",
        "'; DROP TABLE users; --",
        "12345678-1234-1234-1234-123456789abc' OR '1'='1",
        "../../etc/passwd",
      ];

      for (const payload of pathPayloads) {
        const resMem = await request(app.getHttpServer())
          .get(`/api/v1/memories/${encodeURIComponent(payload)}`)
          .set('Cookie', [user.sessionCookie]);

        expect(resMem.status).toBe(400);
        expect(resMem.body.error?.message).toMatch(/uuid is expected|validation/i);

        const resAtt = await request(app.getHttpServer())
          .get(`/api/v1/attachments/${encodeURIComponent(payload)}/download`)
          .set('Cookie', [user.sessionCookie]);

        expect(resAtt.status).toBe(400);

        const resSess = await request(app.getHttpServer())
          .delete(`/api/v1/sessions/${encodeURIComponent(payload)}`)
          .set('Origin', 'http://localhost:5173')
          .set('Cookie', [user.sessionCookie, user.csrfCookie])
          .set('x-csrf-token', user.csrfToken);

        expect(resSess.status).toBe(400);
      }
    });
  });

  describe('3. Body Payload Injection Defenses', () => {
    it('rejects SQL injection in authentication email field with validation error', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({
          email: "admin' OR '1'='1' --",
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toMatch(/(invalid email address|email must be an email)/i);
    });

    it('safely handles SQL injection in password field (hashes literally without SQL execution)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', 'http://localhost:5173')
        .send({
          email: user.email,
          password: "' OR '1'='1' --",
        });

      // Does not crash or grant access, safely returns 401 Unauthorized
      expect(res.status).toBe(401);
      expect(res.body.error?.message).toMatch(/(invalid email or password|invalid credentials)/i);
    });

    it('safely stores ciphertext containing SQL syntax without executing it', async () => {
      const sqliCiphertext = "'; DROP TABLE memories; --";
      const memoryId = crypto.randomUUID();

      const res = await request(app.getHttpServer())
        .post('/api/v1/memories')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [user.sessionCookie, user.csrfCookie])
        .set('x-csrf-token', user.csrfToken)
        .send({
          id: memoryId,
          entryDate: new Date().toISOString(),
          isPinned: false,
          isTimeCapsule: false,
          envelopeVersion: 1,
          algorithm: 'AES-256-GCM',
          ciphertext: sqliCiphertext,
          nonce: 'c3FsaS1ub25jZS0wMDAx',
        });

      expect(res.status).toBe(201);

      // Verify the row was safely stored as literal text and table is intact
      const memoryRecord = await prisma.memory.findUnique({
        where: { id: memoryId },
      });
      expect(memoryRecord).toBeDefined();
      expect(memoryRecord!.ciphertext).toBe(sqliCiphertext);

      // Clean up the created memory
      await prisma.memory.delete({ where: { id: memoryId } });
    });
  });

  describe('4. Database Table Integrity Verification', () => {
    it('confirms all database tables and relations survived injection attempts intact', async () => {
      const userExists = await prisma.user.findUnique({ where: { id: user.userId } });
      expect(userExists).toBeDefined();

      const memoryExists = await prisma.memory.findUnique({ where: { id: validMemoryId } });
      expect(memoryExists).toBeDefined();

      // Check PostgreSQL information schema: verify core tables exist
      const tableCheck = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_catalog.pg_tables 
        WHERE schemaname = 'public' 
        AND tablename IN ('users', 'memories', 'attachments', 'user_vaults', 'sessions', 'security_events')
      `;

      expect(tableCheck.length).toBe(6);
    });
  });
});
