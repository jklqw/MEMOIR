import crypto from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SecurityEventType } from '@prisma/client';
import argon2 from 'argon2';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { VerifyEmailDto } from './dto/verify-email.dto.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
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
   * Generates a CSPRNG one-time verification token.
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
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24-hour expiration

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
}
