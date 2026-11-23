import crypto from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppConfigService } from '../../config/config.service.js';
import { SESSION_COOKIE_NAME } from '../../auth/guards/auth.guard.js';

export const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
export const CSRF_HEADER_NAME = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();

    // 1. Safe, read-only methods are exempt from CSRF checks
    if (SAFE_METHODS.has(method)) {
      return true;
    }

    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const sessionCookie = cookies?.[SESSION_COOKIE_NAME];

    // 2. If the request does not carry an authenticated session cookie, CSRF is not applicable
    // (e.g., initial unauthenticated register, login, email verification, or bearer tokens)
    if (!sessionCookie) {
      return true;
    }

    // 3. For cookie-authenticated mutations, enforce Origin / Referer check
    const origin = req.headers['origin'];
    const referer = req.headers['referer'];
    const webUrl = this.config.get('WEB_URL');
    const allowedOrigins = [webUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(
      Boolean,
    );

    let isOriginAllowed = false;

    if (origin && typeof origin === 'string') {
      isOriginAllowed = allowedOrigins.includes(origin);
    } else if (referer && typeof referer === 'string') {
      isOriginAllowed = allowedOrigins.some((allowed) => referer.startsWith(allowed));
    }

    if (!isOriginAllowed) {
      throw new ForbiddenException(
        'CSRF validation failed: Missing or untrusted Origin / Referer header.',
      );
    }

    // 4. Enforce X-CSRF-Token vs XSRF-TOKEN cookie match using timingSafeEqual
    const headerToken = req.headers[CSRF_HEADER_NAME];
    const cookieToken = cookies?.[CSRF_COOKIE_NAME];

    if (!headerToken || typeof headerToken !== 'string' || !headerToken.trim()) {
      throw new ForbiddenException('CSRF validation failed: Missing X-CSRF-Token header.');
    }

    if (!cookieToken || typeof cookieToken !== 'string' || !cookieToken.trim()) {
      throw new ForbiddenException('CSRF validation failed: Missing XSRF-TOKEN cookie.');
    }

    const headerBuf = Buffer.from(headerToken.trim());
    const cookieBuf = Buffer.from(cookieToken.trim());

    if (headerBuf.length !== cookieBuf.length || !crypto.timingSafeEqual(headerBuf, cookieBuf)) {
      throw new ForbiddenException('CSRF validation failed: Invalid X-CSRF-Token.');
    }

    return true;
  }
}
