import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Memory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateMemoryDto } from './dto/create-memory.dto.js';
import type { QueryMemoryDto } from './dto/query-memory.dto.js';
import type { UpdateMemoryDto } from './dto/update-memory.dto.js';

export interface MaskedMemory extends Omit<Memory, 'ciphertext' | 'nonce'> {
  ciphertext?: string;
  nonce?: string;
  isLockedTimeCapsule?: boolean;
}

@Injectable()
export class MemoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private maskTimeCapsule(memory: Memory): MaskedMemory {
    const isLocked =
      memory.isTimeCapsule && memory.unlockAt !== null && memory.unlockAt.getTime() > Date.now();

    if (isLocked) {
      // Server does NOT reveal ciphertext or nonce for locked time capsules
      const { ciphertext: _c, nonce: _n, ...rest } = memory;
      return {
        ...rest,
        isLockedTimeCapsule: true,
      };
    }

    return {
      ...memory,
      isLockedTimeCapsule: false,
    };
  }

  async create(userId: string, dto: CreateMemoryDto): Promise<Memory> {
    // Enforce 5MB max ciphertext size cap
    if (dto.ciphertext.length > 5 * 1024 * 1024) {
      throw new BadRequestException('Ciphertext payload exceeds 5 MB limit.');
    }

    return this.prisma.memory.create({
      data: {
        id: dto.id,
        userId,
        entryDate: new Date(dto.entryDate),
        isPinned: dto.isPinned ?? false,
        isTimeCapsule: dto.isTimeCapsule ?? false,
        unlockAt: dto.unlockAt ? new Date(dto.unlockAt) : null,
        envelopeVersion: dto.envelopeVersion ?? 1,
        algorithm: dto.algorithm ?? 'AES-256-GCM',
        ciphertext: dto.ciphertext,
        nonce: dto.nonce,
      },
    });
  }

  async findAll(userId: string, query: QueryMemoryDto): Promise<MaskedMemory[]> {
    const limit = query.limit ?? 50;

    let entryDateFilter: { gte?: Date; lte?: Date } | undefined;
    if (query.entryDate) {
      const startOfDay = new Date(query.entryDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(query.entryDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      entryDateFilter = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    const memories = await this.prisma.memory.findMany({
      where: {
        userId,
        deletedAt: null,
        archivedAt: query.includeArchived ? undefined : null,
        entryDate: entryDateFilter,
      },
      take: limit,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ isPinned: 'desc' }, { entryDate: 'desc' }, { createdAt: 'desc' }],
    });

    return memories.map((m) => this.maskTimeCapsule(m));
  }

  async findOne(userId: string, id: string): Promise<MaskedMemory> {
    const memory = await this.prisma.memory.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
    });

    if (!memory) {
      throw new NotFoundException('Memory not found');
    }

    return this.maskTimeCapsule(memory);
  }

  async update(userId: string, id: string, dto: UpdateMemoryDto): Promise<Memory> {
    const existing = await this.prisma.memory.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Memory not found');
    }

    // Invariant: Nonce-reuse guard prevents cryptographic weakness
    if (dto.nonce === existing.nonce) {
      throw new BadRequestException(
        'Nonce reuse detected. Every update must provide a fresh 96-bit CSPRNG nonce.',
      );
    }

    if (dto.ciphertext && dto.ciphertext.length > 5 * 1024 * 1024) {
      throw new BadRequestException('Ciphertext payload exceeds 5 MB limit.');
    }

    return this.prisma.memory.update({
      where: { id },
      data: {
        entryDate: dto.entryDate ? new Date(dto.entryDate) : undefined,
        isPinned: dto.isPinned,
        isTimeCapsule: dto.isTimeCapsule,
        unlockAt:
          dto.unlockAt !== undefined ? (dto.unlockAt ? new Date(dto.unlockAt) : null) : undefined,
        envelopeVersion: dto.envelopeVersion,
        algorithm: dto.algorithm,
        ciphertext: dto.ciphertext,
        nonce: dto.nonce,
      },
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.memory.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Memory not found');
    }

    await this.prisma.memory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async togglePin(userId: string, id: string): Promise<Memory> {
    const existing = await this.prisma.memory.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Memory not found');
    }

    return this.prisma.memory.update({
      where: { id },
      data: { isPinned: !existing.isPinned },
    });
  }

  async toggleArchive(userId: string, id: string): Promise<Memory> {
    const existing = await this.prisma.memory.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Memory not found');
    }

    return this.prisma.memory.update({
      where: { id },
      data: { archivedAt: existing.archivedAt ? null : new Date() },
    });
  }

  async restore(userId: string, id: string): Promise<Memory> {
    const existing = await this.prisma.memory.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Memory not found');
    }

    return this.prisma.memory.update({
      where: { id },
      data: { archivedAt: null },
    });
  }
}
