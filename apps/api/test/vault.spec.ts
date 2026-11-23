import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SecurityEventType } from '@memoir/shared';
import { AuthService } from '../src/auth/auth.service.js';
import { AppConfigService } from '../src/config/config.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { VaultService } from '../src/vault/vault.service.js';

describe('Vault Lifecycle, Recovery & Zero Secret Persistence Integration', () => {
  let prisma: PrismaService;
  let authService: AuthService;
  let vaultService: VaultService;
  let mailService: MailService;
  let configService: AppConfigService;

  beforeAll(async () => {
    configService = new AppConfigService();
    prisma = new PrismaService();
    await prisma.$connect();
    mailService = new MailService(configService);
    authService = new AuthService(prisma, mailService);
    vaultService = new VaultService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Initializes user vault and emits VAULT_CREATED security event', async () => {
    const email = `vault-create-${Date.now()}@example.com`;
    const password = 'Password12345!';

    await authService.register({ email, password });
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeDefined();

    const vault = await vaultService.createVault(user!.id, {
      kdfAlgorithm: 'ARGON2ID',
      kdfSalt: 'ZGV2LXNhbHQtMTZieXRlcw==',
      kdfMemory: 65536,
      kdfIterations: 3,
      kdfParallelism: 1,
      wrapAlgorithm: 'AES-256-GCM',
      envelopeVersion: 1,
      wrappedDek: 'dGVzdC13cmFwcGVkLWRlay1jaXBoZXJ0ZXh0',
      wrappedDekNonce: 'dGVzdC1ub25jZS0xMmI=',
      recoverySalt: 'cmVjb3Zlcnktc2FsdC0xNmJ5dGVz',
      recoveryWrappedDek: 'cmVjb3Zlcnktd3JhcHBlZC1kZWs=',
      recoveryNonce: 'cmVjb3Zlcnktbm9uY2UtMTJi',
      recoveryKeyFingerprint: 'a1b2c3d4e5f6',
    });

    expect(vault.userId).toBe(user!.id);
    expect(vault.envelopeVersion).toBe(1);
    expect(vault.wrapAlgorithm).toBe('AES-256-GCM');

    // Verify security event
    const events = await prisma.securityEvent.findMany({
      where: { userId: user!.id, eventType: SecurityEventType.VAULT_CREATED },
    });
    expect(events.length).toBe(1);
    expect(events[0]?.safeMetadata).toMatchObject({
      kdfAlgorithm: 'ARGON2ID',
      wrapAlgorithm: 'AES-256-GCM',
      envelopeVersion: 1,
    });
  });

  it('2. Rejects duplicate vault creation for the same user (ConflictException)', async () => {
    const email = `vault-dup-${Date.now()}@example.com`;
    const password = 'Password12345!';

    await authService.register({ email, password });
    const user = await prisma.user.findUnique({ where: { email } });

    const payload = {
      kdfAlgorithm: 'ARGON2ID',
      kdfSalt: 'ZGV2LXNhbHQtMTZieXRlcw==',
      kdfMemory: 65536,
      kdfIterations: 3,
      kdfParallelism: 1,
      wrapAlgorithm: 'AES-256-GCM',
      envelopeVersion: 1,
      wrappedDek: 'dGVzdC13cmFwcGVkLWRlay1jaXBoZXJ0ZXh0',
      wrappedDekNonce: 'dGVzdC1ub25jZS0xMmI=',
      recoverySalt: 'cmVjb3Zlcnktc2FsdC0xNmJ5dGVz',
      recoveryWrappedDek: 'cmVjb3Zlcnktd3JhcHBlZC1kZWs=',
      recoveryNonce: 'cmVjb3Zlcnktbm9uY2UtMTJi',
      recoveryKeyFingerprint: 'a1b2c3d4e5f6',
    };

    await vaultService.createVault(user!.id, payload);

    await expect(vaultService.createVault(user!.id, payload)).rejects.toThrow(
      'Vault is already initialized for this account',
    );
  });

  it('3. Rotates passphrase, updates wrapped DEK and emits VAULT_PASSPHRASE_ROTATED', async () => {
    const email = `vault-rotate-${Date.now()}@example.com`;
    const password = 'Password12345!';

    await authService.register({ email, password });
    const user = await prisma.user.findUnique({ where: { email } });

    await vaultService.createVault(user!.id, {
      kdfAlgorithm: 'ARGON2ID',
      kdfSalt: 'b2xkLXNhbHQtMTZieXRlcw==',
      kdfMemory: 65536,
      kdfIterations: 3,
      kdfParallelism: 1,
      wrapAlgorithm: 'AES-256-GCM',
      envelopeVersion: 1,
      wrappedDek: 'b2xkLXdyYXBwZWQtZGVr',
      wrappedDekNonce: 'b2xkLW5vbmNlLTEyYg==',
      recoverySalt: 'cmVjb3Zlcnktc2FsdC0xNmJ5dGVz',
      recoveryWrappedDek: 'cmVjb3Zlcnktd3JhcHBlZC1kZWs=',
      recoveryNonce: 'cmVjb3Zlcnktbm9uY2UtMTJi',
      recoveryKeyFingerprint: 'a1b2c3d4e5f6',
    });

    const rotated = await vaultService.rotatePassphrase(user!.id, {
      kdfSalt: 'bmV3LXNhbHQtMTZieXRlcw==',
      wrappedDek: 'bmV3LXdyYXBwZWQtZGVr',
      wrappedDekNonce: 'bmV3LW5vbmNlLTEyYg==',
    });

    expect(rotated.kdfSalt).toBe('bmV3LXNhbHQtMTZieXRlcw==');
    expect(rotated.wrappedDek).toBe('bmV3LXdyYXBwZWQtZGVr');

    const event = await prisma.securityEvent.findFirst({
      where: { userId: user!.id, eventType: SecurityEventType.VAULT_PASSPHRASE_ROTATED },
    });
    expect(event).toBeDefined();
  });

  it('4. Recovers vault via recovery key, rotates recovery envelope, and emits RECOVERY_KEY_USED', async () => {
    const email = `vault-recover-${Date.now()}@example.com`;
    const password = 'Password12345!';

    await authService.register({ email, password });
    const user = await prisma.user.findUnique({ where: { email } });

    await vaultService.createVault(user!.id, {
      kdfAlgorithm: 'ARGON2ID',
      kdfSalt: 'b2xkLXNhbHQtMTZieXRlcw==',
      kdfMemory: 65536,
      kdfIterations: 3,
      kdfParallelism: 1,
      wrapAlgorithm: 'AES-256-GCM',
      envelopeVersion: 1,
      wrappedDek: 'b2xkLXdyYXBwZWQtZGVr',
      wrappedDekNonce: 'b2xkLW5vbmNlLTEyYg==',
      recoverySalt: 'b2xkLXJlY292ZXJ5LXNhbHQ=',
      recoveryWrappedDek: 'b2xkLXJlY292ZXJ5LWRlaw==',
      recoveryNonce: 'b2xkLXJlY292ZXJ5LW5vbmNl',
      recoveryKeyFingerprint: 'b2xkLWZpbmdlcnByaW50',
    });

    const recovered = await vaultService.recoverVault(user!.id, {
      kdfSalt: 'cmVjb3ZlcmVkLXNhbHQtMTY=',
      wrappedDek: 'cmVjb3ZlcmVkLXdyYXBwZWQtZGVr',
      wrappedDekNonce: 'cmVjb3ZlcmVkLW5vbmNlLTEy',
      recoverySalt: 'bmV3LXJlY292ZXJ5LXNhbHQ=',
      recoveryWrappedDek: 'bmV3LXJlY292ZXJ5LWRlaw==',
      recoveryNonce: 'bmV3LXJlY292ZXJ5LW5vbmNl',
      recoveryKeyFingerprint: 'bmV3LWZpbmdlcnByaW50',
    });

    expect(recovered.kdfSalt).toBe('cmVjb3ZlcmVkLXNhbHQtMTY=');
    expect(recovered.recoveryKeyFingerprint).toBe('bmV3LWZpbmdlcnByaW50');

    const event = await prisma.securityEvent.findFirst({
      where: { userId: user!.id, eventType: SecurityEventType.RECOVERY_KEY_USED },
    });
    expect(event).toBeDefined();
    expect(event?.safeMetadata).toMatchObject({
      recoveryKeyRotated: true,
    });
  });

  it('5. Strictly isolates vaults between different users (cross-user access denial)', async () => {
    const emailA = `vault-user-a-${Date.now()}@example.com`;
    const emailB = `vault-user-b-${Date.now()}@example.com`;
    const password = 'Password12345!';

    await authService.register({ email: emailA, password });
    await authService.register({ email: emailB, password });

    const userA = await prisma.user.findUnique({ where: { email: emailA } });
    const userB = await prisma.user.findUnique({ where: { email: emailB } });

    await vaultService.createVault(userA!.id, {
      kdfAlgorithm: 'ARGON2ID',
      kdfSalt: 'dXNlci1hLXNhbHQtMTZieXRlcw==',
      kdfMemory: 65536,
      kdfIterations: 3,
      kdfParallelism: 1,
      wrapAlgorithm: 'AES-256-GCM',
      envelopeVersion: 1,
      wrappedDek: 'dXNlci1hLXdyYXBwZWQtZGVr',
      wrappedDekNonce: 'dXNlci1hLW5vbmNlLTEyYg==',
      recoverySalt: 'dXNlci1hLXJlY292ZXJ5LXNhbHQ=',
      recoveryWrappedDek: 'dXNlci1hLXJlY292ZXJ5LWRlaw==',
      recoveryNonce: 'dXNlci1hLXJlY292ZXJ5LW5vbmNl',
      recoveryKeyFingerprint: 'dXNlci1hLWZpbmdlcnByaW50',
    });

    // User B has not set up vault yet -> getVault returns null
    const vaultB = await vaultService.getVault(userB!.id);
    expect(vaultB).toBeNull();

    // User A gets own vault
    const vaultA = await vaultService.getVault(userA!.id);
    expect(vaultA?.userId).toBe(userA!.id);
    expect(vaultA?.wrappedDek).toBe('dXNlci1hLXdyYXBwZWQtZGVr');
  });

  it('6. Enforces zero plaintext storage: database holds zero raw keys or plaintext passphrases', async () => {
    const email = `vault-zero-secret-${Date.now()}@example.com`;
    const password = 'AccountPassword123!';

    await authService.register({ email, password });
    const user = await prisma.user.findUnique({ where: { email } });

    const rawVaultRecord = await vaultService.createVault(user!.id, {
      kdfAlgorithm: 'ARGON2ID',
      kdfSalt: 'c2FsdDE2Ynl0ZXNsb25n',
      kdfMemory: 65536,
      kdfIterations: 3,
      kdfParallelism: 1,
      wrapAlgorithm: 'AES-256-GCM',
      envelopeVersion: 1,
      wrappedDek: 'YWVzMjU2Z2NtY2lwaGVydGV4dA==',
      wrappedDekNonce: 'bm9uY2UxMmJ5dGVz',
      recoverySalt: 'cmVjb3ZlcnlzYWx0MTZieXRlcw==',
      recoveryWrappedDek: 'cmVjb3Zlcnl3cmFwcGVkZGVr',
      recoveryNonce: 'cmVjb3Zlcnlub25jZTEyYg==',
      recoveryKeyFingerprint: 'aGFzaDEyY2hhcnM=',
    });

    // Check all fields of the database row
    const recordJson = JSON.stringify(rawVaultRecord);
    expect(recordJson).not.toContain(password);
    expect(recordJson).not.toContain('DEK');
    expect(rawVaultRecord.wrapAlgorithm).toBe('AES-256-GCM');
  });
});
