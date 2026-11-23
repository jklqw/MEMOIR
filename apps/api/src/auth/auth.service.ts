import crypto from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { SecurityEventType } from '@prisma/client';
import argon2 from 'argon2';
import { maskIp, parseDeviceLabel } from '../common/utils/device.util.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { VerifyEmailDto } from './dto/verify-email.dto.js';

// Precomputed Argon2id dummy hash for anti-enumeration timing defense
const DUMMY_ARGON2ID_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$4oA70RyFrB8PYtheEl9SfQ$dTgtd32mihCgYeHOI1ePViW/IYpou+3J5CokRnoaxXA';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MailService) private readonly mailService: MailService,
  ) {}

  /**
   * Hashes the account authentication password server-side with Argon2id.
   * This is strictly separate from the client-side Vault Passphrase.
   */
  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  }

  /**
   * Verifies an account authentication password against its stored Argon2id hash.
   */
  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Generates a CSPRNG one-time token.
   */
  generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * SHA-256 hashes a token before database storage to prevent token leakage from read-only DB breaches.
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Registers a new user account with generic anti-enumeration response semantics.
   */
  async register(dto: RegisterDto): Promise<{ message: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const genericResponse = {
      message: 'If this email address is eligible, a verification email has been sent.',
    };

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      if (!existing.emailVerifiedAt) {
        // User exists but has not verified yet: refresh verification token and resend
        const rawToken = this.generateVerificationToken();
        const tokenHash = this.hashToken(rawToken);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            emailVerifyTokenHash: tokenHash,
            emailVerifyExpiresAt: expiresAt,
          },
        });

        await this.mailService.sendVerificationEmail(existing.email, rawToken);
      } else {
        // User already verified: simulate Argon2id hashing to maintain timing parity
        await this.hashPassword(dto.password);
      }

      this.logger.log(
        `Registration attempt for email: [REDACTED] (anti-enumeration response returned)`,
      );
      return genericResponse;
    }

    const passwordHash = await this.hashPassword(dto.password);
    const rawToken = this.generateVerificationToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        emailVerifyTokenHash: tokenHash,
        emailVerifyExpiresAt: expiresAt,
        accountStatus: 'ACTIVE',
      },
    });

    await this.mailService.sendVerificationEmail(normalizedEmail, rawToken);
    this.logger.log(`New user registered successfully`);

    return genericResponse;
  }

  /**
   * Verifies an email address using a one-time token.
   */
  async verifyEmail(dto: VerifyEmailDto): Promise<{ message: string }> {
    const tokenHash = this.hashToken(dto.token.trim());

    const user = await this.prisma.user.findFirst({
      where: {
        emailVerifyTokenHash: tokenHash,
        emailVerifyExpiresAt: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired email verification link.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerifyTokenHash: null,
        emailVerifyExpiresAt: null,
      },
    });

    await this.prisma.securityEvent.create({
      data: {
        userId: user.id,
        eventType: SecurityEventType.EMAIL_VERIFIED,
        safeMetadata: { verifiedAt: new Date().toISOString() },
      },
    });

    this.logger.log(`User email verified successfully`);
    return { message: 'Email verified successfully. You may now log in.' };
  }

  /**
   * Authenticates user credentials, rotates sessions, and issues an opaque cookie session.
   */
  async login(
    dto: LoginDto,
    userAgent?: string,
    ip?: string,
  ): Promise<{ user: { id: string; email: string }; rawToken: string }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Simulate Argon2id verify duration to mitigate email enumeration via timing
      await this.verifyPassword(DUMMY_ARGON2ID_HASH, dto.password);
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const waitMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Account is temporarily locked due to consecutive failed attempts. Please try again in ${waitMinutes} minute(s).`,
      );
    }

    const isPasswordValid = await this.verifyPassword(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      const failedAttempts = user.failedLoginAttempts + 1;
      const willLock = failedAttempts >= 5;
      const lockedUntil = willLock ? new Date(Date.now() + 15 * 60 * 1000) : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: failedAttempts,
          lockedUntil,
        },
      });

      await this.prisma.securityEvent.create({
        data: {
          userId: user.id,
          eventType: willLock
            ? SecurityEventType.LOCKOUT_TRIGGERED
            : SecurityEventType.LOGIN_FAILED,
          safeMetadata: {
            reason: willLock ? 'Exceeded 5 failed login attempts' : 'Invalid password',
            ipMasked: maskIp(ip),
          },
        },
      });

      throw new UnauthorizedException('Invalid email or password.');
    }

    // Check email verification requirement
    if (!user.emailVerifiedAt) {
      await this.prisma.securityEvent.create({
        data: {
          userId: user.id,
          eventType: SecurityEventType.LOGIN_FAILED,
          safeMetadata: { reason: 'Unverified email', ipMasked: maskIp(ip) },
        },
      });
      throw new UnauthorizedException('Please verify your email address before logging in.');
    }

    // Reset failed login attempts on successful login
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    }

    // Generate opaque session token & session family
    const rawToken = `memoir_s_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = this.hashToken(rawToken);
    const familyId = crypto.randomUUID();
    const { deviceLabel, userAgentSummary } = parseDeviceLabel(userAgent);
    const ipMasked = maskIp(ip);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        familyId,
        deviceLabel,
        userAgentSummary,
        ipMaskedOrHash: ipMasked,
        expiresAt,
      },
    });

    await this.prisma.securityEvent.create({
      data: {
        userId: user.id,
        eventType: SecurityEventType.LOGIN_SUCCESS,
        safeMetadata: {
          deviceLabel,
          ipMasked,
        },
      },
    });

    return {
      user: { id: user.id, email: user.email },
      rawToken,
    };
  }

  /**
   * Refreshes an active session with rotation and strict reuse detection.
   * If a previously rotated token is replayed, the entire session family is revoked.
   */
  async refreshSession(
    rawToken: string,
    userAgent?: string,
    ip?: string,
  ): Promise<{ newRawToken: string }> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new UnauthorizedException('No active session token provided.');
    }

    const tokenHash = this.hashToken(rawToken.trim());
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
    });

    if (!session) {
      throw new UnauthorizedException('Session not found.');
    }

    // REUSE DETECTION: A revoked token is being presented again!
    if (session.revokedAt !== null) {
      this.logger.warn(
        `Session replay attack detected for family ${session.familyId}. Revoking entire family.`,
      );

      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.prisma.securityEvent.create({
        data: {
          userId: session.userId,
          eventType: SecurityEventType.SUSPICIOUS_LOGIN,
          safeMetadata: {
            reason: 'Session replay detected; entire family revoked',
            familyId: session.familyId,
            ipMasked: maskIp(ip),
          },
        },
      });

      throw new UnauthorizedException(
        'Security warning: Session token reuse detected. All active sessions in this family have been revoked.',
      );
    }

    // Check expiration
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session has expired. Please log in again.');
    }

    // ROTATE SESSION: Mark current session as revoked/replaced
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    // Create fresh session under the SAME familyId
    const newRawToken = `memoir_s_${crypto.randomBytes(32).toString('hex')}`;
    const newTokenHash = this.hashToken(newRawToken);
    const { deviceLabel, userAgentSummary } = parseDeviceLabel(userAgent);
    const ipMasked = maskIp(ip);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: {
        userId: session.userId,
        tokenHash: newTokenHash,
        familyId: session.familyId,
        deviceLabel,
        userAgentSummary,
        ipMaskedOrHash: ipMasked,
        expiresAt,
      },
    });

    return { newRawToken };
  }

  /**
   * Logs out an active session by revoking it in the database.
   */
  async logout(rawToken?: string): Promise<void> {
    if (!rawToken || typeof rawToken !== 'string') {
      return;
    }

    const tokenHash = this.hashToken(rawToken.trim());
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
    });

    if (session && !session.revokedAt) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });

      await this.prisma.securityEvent.create({
        data: {
          userId: session.userId,
          eventType: SecurityEventType.SESSION_REVOKED,
          safeMetadata: { sessionId: session.id },
        },
      });
    }
  }

  /**
   * Retrieves sanitized account details for the authenticated user.
   */
  async getMe(userId: string): Promise<{
    id: string;
    email: string;
    emailVerifiedAt: Date | null;
    accountStatus: string;
    createdAt: Date;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    return {
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      accountStatus: user.accountStatus,
      createdAt: user.createdAt,
    };
  }
}
