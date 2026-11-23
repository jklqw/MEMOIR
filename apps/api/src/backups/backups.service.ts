import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { MemoirEncryptedBackup, BackupHistoryItem, BackupRestoreResult } from '@memoir/shared';
import type { ImportBackupDto } from './dto/import-backup.dto.js';

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a zero-knowledge encrypted backup archive with SHA-256 integrity manifest
   */
  async exportBackup(userId: string): Promise<MemoirEncryptedBackup> {
    const vault = await this.prisma.userVault.findUnique({
      where: { userId },
    });

    if (!vault) {
      throw new BadRequestException('Vault must be initialized before creating a backup');
    }

    const memories = await this.prisma.memory.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    const attachments = await this.prisma.attachment.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    const formattedMemories = memories.map((m) => ({
      id: m.id,
      entryDate: m.entryDate.toISOString(),
      isPinned: m.isPinned,
      isTimeCapsule: m.isTimeCapsule,
      unlockAt: m.unlockAt ? m.unlockAt.toISOString() : null,
      envelopeVersion: m.envelopeVersion,
      algorithm: m.algorithm,
      ciphertext: m.ciphertext,
      nonce: m.nonce,
      archivedAt: m.archivedAt ? m.archivedAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }));

    const formattedAttachments = attachments.map((a) => ({
      id: a.id,
      memoryId: a.memoryId,
      isVaultItem: a.isVaultItem,
      storageKey: a.storageKey,
      byteSize: a.byteSize,
      wrappedFileKey: a.wrappedFileKey,
      fileKeyNonce: a.fileKeyNonce,
      encryptedMetadata: a.encryptedMetadata,
      metaNonce: a.metaNonce,
      fileNonce: a.fileNonce,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));

    const dataPayloadString = JSON.stringify({
      vault: {
        kdfAlgorithm: vault.kdfAlgorithm,
        kdfSalt: vault.kdfSalt,
        kdfMemory: vault.kdfMemory,
        kdfIterations: vault.kdfIterations,
        kdfParallelism: vault.kdfParallelism,
        wrapAlgorithm: vault.wrapAlgorithm,
        envelopeVersion: vault.envelopeVersion,
        wrappedDek: vault.wrappedDek,
        wrappedDekNonce: vault.wrappedDekNonce,
        recoverySalt: vault.recoverySalt,
        recoveryWrappedDek: vault.recoveryWrappedDek,
        recoveryNonce: vault.recoveryNonce,
        recoveryKeyFingerprint: vault.recoveryKeyFingerprint,
      },
      memories: formattedMemories,
      attachments: formattedAttachments,
    });

    const checksumSha256 = crypto.createHash('sha256').update(dataPayloadString).digest('hex');

    const totalEntries = formattedMemories.length + formattedAttachments.length;

    const backupPayload: MemoirEncryptedBackup = {
      manifest: {
        version: 1,
        exportedAt: new Date().toISOString(),
        userId,
        entryCount: totalEntries,
        checksumSha256,
      },
      vault: {
        kdfAlgorithm: vault.kdfAlgorithm,
        kdfSalt: vault.kdfSalt,
        kdfMemory: vault.kdfMemory,
        kdfIterations: vault.kdfIterations,
        kdfParallelism: vault.kdfParallelism,
        wrapAlgorithm: vault.wrapAlgorithm,
        envelopeVersion: vault.envelopeVersion,
        wrappedDek: vault.wrappedDek,
        wrappedDekNonce: vault.wrappedDekNonce,
        recoverySalt: vault.recoverySalt,
        recoveryWrappedDek: vault.recoveryWrappedDek,
        recoveryNonce: vault.recoveryNonce,
        recoveryKeyFingerprint: vault.recoveryKeyFingerprint,
      },
      memories: formattedMemories,
      attachments: formattedAttachments,
    };

    const fullJson = JSON.stringify(backupPayload);
    const byteSize = Buffer.byteLength(fullJson, 'utf8');

    const record = await this.prisma.backup.create({
      data: {
        userId,
        checksumSha256,
        entryCount: totalEntries,
        byteSize,
      },
    });

    await this.prisma.securityEvent.create({
      data: {
        userId,
        eventType: 'BACKUP_EXPORTED',
        safeMetadata: {
          backupId: record.id,
          entryCount: totalEntries,
          byteSize,
          checksumSha256,
        },
      },
    });

    this.logger.log(
      `Backup exported successfully for user ${userId} (${totalEntries} entries, ${byteSize} bytes)`,
    );

    return backupPayload;
  }

  /**
   * Validates and imports encrypted backup archive, restoring memories and attachments
   */
  async importBackup(userId: string, payload: ImportBackupDto): Promise<BackupRestoreResult> {
    if (payload.manifest.version !== 1) {
      throw new BadRequestException(
        `Unsupported backup envelope version: ${payload.manifest.version}`,
      );
    }

    // Verify SHA-256 integrity
    const dataPayloadString = JSON.stringify({
      vault: payload.vault,
      memories: payload.memories,
      attachments: payload.attachments,
    });

    const calculatedChecksum = crypto.createHash('sha256').update(dataPayloadString).digest('hex');

    if (calculatedChecksum !== payload.manifest.checksumSha256) {
      throw new BadRequestException(
        'Backup integrity verification failed: SHA-256 checksum mismatch',
      );
    }

    // Check if user has a vault; if not, restore vault parameters
    let userVault = await this.prisma.userVault.findUnique({
      where: { userId },
    });

    if (!userVault) {
      userVault = await this.prisma.userVault.create({
        data: {
          userId,
          kdfAlgorithm: payload.vault.kdfAlgorithm,
          kdfSalt: payload.vault.kdfSalt,
          kdfMemory: payload.vault.kdfMemory,
          kdfIterations: payload.vault.kdfIterations,
          kdfParallelism: payload.vault.kdfParallelism,
          wrapAlgorithm: payload.vault.wrapAlgorithm,
          envelopeVersion: payload.vault.envelopeVersion,
          wrappedDek: payload.vault.wrappedDek,
          wrappedDekNonce: payload.vault.wrappedDekNonce,
          recoverySalt: payload.vault.recoverySalt,
          recoveryWrappedDek: payload.vault.recoveryWrappedDek,
          recoveryNonce: payload.vault.recoveryNonce,
          recoveryKeyFingerprint: payload.vault.recoveryKeyFingerprint,
        },
      });
    }

    let restoredMemoriesCount = 0;
    let skippedMemoriesCount = 0;
    let restoredAttachmentsCount = 0;
    let skippedAttachmentsCount = 0;

    // Restore memories
    for (const mem of payload.memories) {
      if (!mem.ciphertext || !mem.nonce) {
        skippedMemoriesCount++;
        continue;
      }

      const existing = await this.prisma.memory.findUnique({
        where: { id: mem.id },
      });

      if (existing) {
        if (existing.userId === userId) {
          skippedMemoriesCount++;
        } else {
          // Collision with another user's UUID (astronomically rare): insert with fresh UUID
          await this.prisma.memory.create({
            data: {
              userId,
              entryDate: new Date(mem.entryDate),
              isPinned: mem.isPinned ?? false,
              isTimeCapsule: mem.isTimeCapsule ?? false,
              unlockAt: mem.unlockAt ? new Date(mem.unlockAt) : null,
              envelopeVersion: mem.envelopeVersion ?? 1,
              algorithm: mem.algorithm ?? 'AES-256-GCM',
              ciphertext: mem.ciphertext,
              nonce: mem.nonce,
              archivedAt: mem.archivedAt ? new Date(mem.archivedAt) : null,
            },
          });
          restoredMemoriesCount++;
        }
      } else {
        await this.prisma.memory.create({
          data: {
            id: mem.id,
            userId,
            entryDate: new Date(mem.entryDate),
            isPinned: mem.isPinned ?? false,
            isTimeCapsule: mem.isTimeCapsule ?? false,
            unlockAt: mem.unlockAt ? new Date(mem.unlockAt) : null,
            envelopeVersion: mem.envelopeVersion ?? 1,
            algorithm: mem.algorithm ?? 'AES-256-GCM',
            ciphertext: mem.ciphertext,
            nonce: mem.nonce,
            archivedAt: mem.archivedAt ? new Date(mem.archivedAt) : null,
          },
        });
        restoredMemoriesCount++;
      }
    }

    // Restore attachments
    for (const att of payload.attachments) {
      if (!att.storageKey || !att.wrappedFileKey || !att.encryptedMetadata) {
        skippedAttachmentsCount++;
        continue;
      }

      // Check if memory exists for this user to preserve link
      let validMemoryId: string | null = null;
      if (att.memoryId) {
        const memRecord = await this.prisma.memory.findFirst({
          where: { id: att.memoryId, userId },
        });
        if (memRecord) {
          validMemoryId = memRecord.id;
        }
      }

      const existing = await this.prisma.attachment.findUnique({
        where: { id: att.id },
      });

      if (existing) {
        if (existing.userId === userId) {
          skippedAttachmentsCount++;
          continue;
        } else {
          // Belongs to another user: generate fresh ID and storageKey for safe isolation
          await this.prisma.attachment.create({
            data: {
              id: crypto.randomUUID(),
              userId,
              memoryId: validMemoryId,
              isVaultItem: att.isVaultItem ?? false,
              storageKey: crypto.randomUUID(),
              byteSize: att.byteSize,
              wrappedFileKey: att.wrappedFileKey,
              fileKeyNonce: att.fileKeyNonce,
              encryptedMetadata: att.encryptedMetadata,
              metaNonce: att.metaNonce,
              fileNonce: att.fileNonce,
            },
          });
          restoredAttachmentsCount++;
        }
      } else {
        const existingKey = await this.prisma.attachment.findUnique({
          where: { storageKey: att.storageKey },
        });

        await this.prisma.attachment.create({
          data: {
            id: att.id,
            userId,
            memoryId: validMemoryId,
            isVaultItem: att.isVaultItem ?? false,
            storageKey: existingKey ? crypto.randomUUID() : att.storageKey,
            byteSize: att.byteSize,
            wrappedFileKey: att.wrappedFileKey,
            fileKeyNonce: att.fileKeyNonce,
            encryptedMetadata: att.encryptedMetadata,
            metaNonce: att.metaNonce,
            fileNonce: att.fileNonce,
          },
        });
        restoredAttachmentsCount++;
      }
    }

    this.logger.log(
      `Backup imported for user ${userId}: ${restoredMemoriesCount} memories restored, ${restoredAttachmentsCount} attachments restored`,
    );

    return {
      restoredMemoriesCount,
      restoredAttachmentsCount,
      skippedMemoriesCount,
      skippedAttachmentsCount,
    };
  }

  /**
   * Retrieves list of previous backup records for the authenticated user
   */
  async getHistory(userId: string): Promise<BackupHistoryItem[]> {
    const records = await this.prisma.backup.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return records.map((r) => ({
      id: r.id,
      userId: r.userId,
      checksumSha256: r.checksumSha256,
      entryCount: r.entryCount,
      byteSize: r.byteSize,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
