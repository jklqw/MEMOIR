import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Attachment } from '@prisma/client';
import type { StorageQuotaResponse } from '@memoir/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { CreateAttachmentDto } from './dto/create-attachment.dto.js';

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Helper to decode Base64 / Base64URL string into Node Buffer
   */
  private decodeBase64(base64Str: string): Buffer {
    try {
      // Normalize base64url to base64
      let normalized = base64Str.replace(/-/g, '+').replace(/_/g, '/');
      while (normalized.length % 4) {
        normalized += '=';
      }
      return Buffer.from(normalized, 'base64');
    } catch {
      throw new BadRequestException('Malformed base64 ciphertext in attachment payload.');
    }
  }

  async create(userId: string, dto: CreateAttachmentDto): Promise<Attachment> {
    // If memoryId is provided, verify memory ownership
    if (dto.memoryId) {
      const memory = await this.prisma.memory.findFirst({
        where: { id: dto.memoryId, userId, deletedAt: null },
      });
      if (!memory) {
        throw new NotFoundException('Associated memory not found or access denied.');
      }
    }

    const binaryBuffer = this.decodeBase64(dto.ciphertext);

    // Enforce 10 MB limit and 250 MB quota
    await this.storageService.validateQuota(userId, binaryBuffer.length);

    // Server generates random UUIDv4 storageKey
    const storageKey = this.storageService.generateStorageKey();

    // Persist ciphertext blob
    await this.storageService.saveFile(storageKey, binaryBuffer);

    // Persist attachment metadata record
    return this.prisma.attachment.create({
      data: {
        id: dto.id,
        userId,
        memoryId: dto.memoryId ?? null,
        isVaultItem: dto.isVaultItem ?? false,
        storageKey,
        byteSize: binaryBuffer.length,
        wrappedFileKey: dto.wrappedFileKey,
        fileKeyNonce: dto.fileKeyNonce,
        encryptedMetadata: dto.encryptedMetadata,
        metaNonce: dto.metaNonce,
        fileNonce: dto.fileNonce,
      },
    });
  }

  async findAll(
    userId: string,
    options?: { memoryId?: string; isVaultItem?: boolean },
  ): Promise<Attachment[]> {
    return this.prisma.attachment.findMany({
      where: {
        userId,
        deletedAt: null,
        memoryId: options?.memoryId !== undefined ? options.memoryId : undefined,
        isVaultItem: options?.isVaultItem !== undefined ? options.isVaultItem : undefined,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string): Promise<Attachment> {
    const attachment = await this.prisma.attachment.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    return attachment;
  }

  async download(userId: string, id: string): Promise<{ buffer: Buffer; attachment: Attachment }> {
    const attachment = await this.findOne(userId, id);
    const buffer = await this.storageService.getFile(attachment.storageKey);
    return { buffer, attachment };
  }

  async delete(userId: string, id: string): Promise<void> {
    const attachment = await this.findOne(userId, id);

    // Delete file from disk/S3
    await this.storageService.deleteFile(attachment.storageKey);

    // Soft delete row in DB
    await this.prisma.attachment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async getQuota(userId: string): Promise<StorageQuotaResponse> {
    return this.storageService.getUserStorageUsage(userId);
  }
}
