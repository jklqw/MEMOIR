import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { SecurityEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

export interface SessionItemDto {
  id: string;
  deviceLabel: string;
  userAgentSummary: string;
  ipMasked: string;
  lastSeenAt: string;
  isCurrent: boolean;
  createdAt: string;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  /**
   * Lists all active unrevoked sessions for the current authenticated user.
   * Strict ownership: filtered exclusively by userId (IDOR prevention).
   */
  async listActiveSessions(userId: string, currentSessionId: string): Promise<SessionItemDto[]> {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    return sessions.map((s) => ({
      id: s.id,
      deviceLabel: s.deviceLabel,
      userAgentSummary: s.userAgentSummary,
      ipMasked: s.ipMaskedOrHash,
      lastSeenAt: s.lastSeenAt.toISOString(),
      isCurrent: s.id === currentSessionId,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  /**
   * Revokes a specific session remotely.
   * Enforces strict ownership: denying cross-user revocation (IDOR prevention).
   */
  async revokeSession(userId: string, sessionId: string): Promise<{ message: string }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    // IDOR check: if session does not exist or belongs to another user, fail safely
    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found.');
    }

    if (session.revokedAt === null) {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });

      // Synchronize immediate revocation to Redis denylist if Redis is available
      if (this.redis) {
        const ttlSeconds = Math.max(
          1,
          Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
        );
        await this.redis.set(`session:revoked:${session.tokenHash}`, '1', ttlSeconds);
      }

      await this.prisma.securityEvent.create({
        data: {
          userId,
          eventType: SecurityEventType.SESSION_REVOKED,
          safeMetadata: {
            sessionId,
            deviceLabel: session.deviceLabel,
          },
        },
      });
    }

    this.logger.log(`Session ${sessionId} revoked by user`);
    return { message: 'Session revoked successfully.' };
  }

  /**
   * Revokes all active sessions for the user EXCEPT the current session.
   */
  async revokeAllOtherSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<{ message: string }> {
    const otherSessions = await this.prisma.session.findMany({
      where: {
        userId,
        id: { not: currentSessionId },
        revokedAt: null,
      },
    });

    if (otherSessions.length > 0) {
      await this.prisma.session.updateMany({
        where: {
          userId,
          id: { not: currentSessionId },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      if (this.redis) {
        for (const s of otherSessions) {
          const ttlSeconds = Math.max(1, Math.floor((s.expiresAt.getTime() - Date.now()) / 1000));
          await this.redis.set(`session:revoked:${s.tokenHash}`, '1', ttlSeconds);
        }
      }

      await this.prisma.securityEvent.create({
        data: {
          userId,
          eventType: SecurityEventType.SESSION_REVOKED,
          safeMetadata: {
            revokedCount: otherSessions.length,
            revokedAllOthers: true,
          },
        },
      });
    }

    this.logger.log(
      `All other sessions revoked for user ${userId} (${otherSessions.length} total)`,
    );
    return { message: 'All other sessions have been revoked.' };
  }
}
