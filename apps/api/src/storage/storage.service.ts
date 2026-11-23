import * as crypto from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { StorageQuotaResponse } from '@memoir/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { STORAGE_PROVIDER, type StorageProvider } from './storage.interface.js';

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file limit
export const USER_STORAGE_QUOTA = 250 * 1024 * 1024; // 250 MB per user quota

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider,
  ) {}

  /**
   * Generates a server-controlled random UUIDv4 storage key.
   * Clients NEVER supply storage paths, mitigating path traversal by design.
   */
  generateStorageKey(): string {
    return `${crypto.randomUUID()}.enc`;
  }

  /**
   * Calculates active storage usage for a user (excluding soft-deleted items).
   */
  async getUserStorageUsage(userId: string): Promise<StorageQuotaResponse> {
    const aggregate = await this.prisma.attachment.aggregate({
      where: {
        userId,
        deletedAt: null,
      },
      _sum: {
        byteSize: true,
      },
    });

    const usedBytes = aggregate._sum.byteSize ?? 0;
    const percentage = Number(((usedBytes / USER_STORAGE_QUOTA) * 100).toFixed(2));

    return {
      usedBytes,
      quotaBytes: USER_STORAGE_QUOTA,
      percentage: Math.min(percentage, 100),
    };
  }

  /**
   * Enforces 10 MB per-file limit and 250 MB per-user storage quota.
   */
  async validateQuota(userId: string, incomingBytes: number): Promise<void> {
    if (incomingBytes <= 0) {
      throw new BadRequestException('File payload cannot be empty.');
    }

    if (incomingBytes > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size (${(incomingBytes / (1024 * 1024)).toFixed(2)} MB) exceeds the maximum allowed limit of 10 MB.`,
      );
    }

    const { usedBytes } = await this.getUserStorageUsage(userId);
    if (usedBytes + incomingBytes > USER_STORAGE_QUOTA) {
      throw new BadRequestException(
        `User storage quota exceeded. Adding this file would exceed the 250 MB quota (${((usedBytes + incomingBytes) / (1024 * 1024)).toFixed(2)} MB / 250 MB).`,
      );
    }
  }

  async saveFile(storageKey: string, data: Buffer): Promise<void> {
    await this.provider.upload(storageKey, data);
  }

  async getFile(storageKey: string): Promise<Buffer> {
    return this.provider.download(storageKey);
  }

  async deleteFile(storageKey: string): Promise<void> {
    await this.provider.delete(storageKey);
  }
}
