import crypto from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';

export const SESSION_COOKIE_NAME = 'memoir_session';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const rawToken =
      cookies?.[SESSION_COOKIE_NAME] ??
      (request.headers.authorization?.startsWith('Bearer ')
        ? request.headers.authorization.slice(7)
        : undefined);

    if (!rawToken || typeof rawToken !== 'string') {
      throw new UnauthorizedException('Authentication required.');
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');

    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session || session.revokedAt !== null || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session invalid or expired.');
    }

    if (session.user.accountStatus !== 'ACTIVE') {
      throw new UnauthorizedException('Account is suspended or pending deletion.');
    }

    // Attach to request
    (request as Request & { user: typeof session.user; session: typeof session }).user =
      session.user;
    (request as Request & { user: typeof session.user; session: typeof session }).session = session;

    // Asynchronously update lastSeenAt if more than 60s elapsed
    if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
      this.prisma.session
        .update({
          where: { id: session.id },
          data: { lastSeenAt: new Date() },
        })
        .catch(() => {});
    }

    return true;
  }
}
