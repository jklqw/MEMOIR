import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SecurityEventType, type UserVault } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateVaultDto } from './dto/create-vault.dto.js';
import type { RecoverVaultDto } from './dto/recover-vault.dto.js';
import type { RotatePassphraseDto } from './dto/rotate-passphrase.dto.js';

@Injectable()
export class VaultService {
  constructor(private readonly prisma: PrismaService) {}

  async createVault(userId: string, dto: CreateVaultDto): Promise<UserVault> {
    const existing = await this.prisma.userVault.findUnique({
      where: { userId },
    });

    if (existing) {
      throw new ConflictException('Vault is already initialized for this account');
    }

    const vault = await this.prisma.userVault.create({
      data: {
        userId,
        kdfAlgorithm: dto.kdfAlgorithm,
        kdfSalt: dto.kdfSalt,
        kdfMemory: dto.kdfMemory,
        kdfIterations: dto.kdfIterations,
        kdfParallelism: dto.kdfParallelism,
        wrapAlgorithm: dto.wrapAlgorithm,
        envelopeVersion: dto.envelopeVersion,
        wrappedDek: dto.wrappedDek,
        wrappedDekNonce: dto.wrappedDekNonce,
        recoverySalt: dto.recoverySalt,
        recoveryWrappedDek: dto.recoveryWrappedDek,
        recoveryNonce: dto.recoveryNonce,
        recoveryKeyFingerprint: dto.recoveryKeyFingerprint,
      },
    });

    await this.prisma.securityEvent.create({
      data: {
        userId,
        eventType: SecurityEventType.VAULT_CREATED,
        safeMetadata: {
          kdfAlgorithm: dto.kdfAlgorithm,
          wrapAlgorithm: dto.wrapAlgorithm,
          envelopeVersion: dto.envelopeVersion,
        },
      },
    });

    return vault;
  }

  async getVault(userId: string): Promise<UserVault | null> {
    return this.prisma.userVault.findUnique({
      where: { userId },
    });
  }

  async rotatePassphrase(userId: string, dto: RotatePassphraseDto): Promise<UserVault> {
    const vault = await this.prisma.userVault.findUnique({
      where: { userId },
    });

    if (!vault) {
      throw new NotFoundException('Vault not found for this account');
    }

    const updated = await this.prisma.userVault.update({
      where: { userId },
      data: {
        kdfSalt: dto.kdfSalt,
        kdfMemory: dto.kdfMemory ?? vault.kdfMemory,
        kdfIterations: dto.kdfIterations ?? vault.kdfIterations,
        kdfParallelism: dto.kdfParallelism ?? vault.kdfParallelism,
        wrappedDek: dto.wrappedDek,
        wrappedDekNonce: dto.wrappedDekNonce,
      },
    });

    await this.prisma.securityEvent.create({
      data: {
        userId,
        eventType: SecurityEventType.VAULT_PASSPHRASE_ROTATED,
        safeMetadata: {
          updatedAt: updated.updatedAt.toISOString(),
        },
      },
    });

    return updated;
  }

  async recoverVault(userId: string, dto: RecoverVaultDto): Promise<UserVault> {
    const vault = await this.prisma.userVault.findUnique({
      where: { userId },
    });

    if (!vault) {
      throw new NotFoundException('Vault not found for this account');
    }

    const updateData: Partial<UserVault> = {
      kdfSalt: dto.kdfSalt,
      kdfMemory: dto.kdfMemory ?? vault.kdfMemory,
      kdfIterations: dto.kdfIterations ?? vault.kdfIterations,
      kdfParallelism: dto.kdfParallelism ?? vault.kdfParallelism,
      wrappedDek: dto.wrappedDek,
      wrappedDekNonce: dto.wrappedDekNonce,
    };

    if (
      dto.recoverySalt &&
      dto.recoveryWrappedDek &&
      dto.recoveryNonce &&
      dto.recoveryKeyFingerprint
    ) {
      updateData.recoverySalt = dto.recoverySalt;
      updateData.recoveryWrappedDek = dto.recoveryWrappedDek;
      updateData.recoveryNonce = dto.recoveryNonce;
      updateData.recoveryKeyFingerprint = dto.recoveryKeyFingerprint;
    }

    const updated = await this.prisma.userVault.update({
      where: { userId },
      data: updateData,
    });

    await this.prisma.securityEvent.create({
      data: {
        userId,
        eventType: SecurityEventType.RECOVERY_KEY_USED,
        safeMetadata: {
          recoveredAt: updated.updatedAt.toISOString(),
          recoveryKeyRotated: Boolean(dto.recoverySalt),
        },
      },
    });

    return updated;
  }
}
