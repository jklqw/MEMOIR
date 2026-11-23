import crypto from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, SecurityEventType } from '@prisma/client';
import argon2 from 'argon2';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { AppConfigService } from '../config/config.service.js';
import { RedisService } from '../redis/redis.service.js';
import { decryptWithKms, encryptWithKms } from '../common/security/kms.util.js';
import { maskIp, parseDeviceLabel } from '../common/utils/device.util.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { DeleteAccountDto } from './dto/delete-account.dto.js';
import type { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { ResetPasswordDto } from './dto/reset-password.dto.js';
import type { TotpDisableDto } from './dto/totp-disable.dto.js';
import type { TotpVerifyDto } from './dto/totp-verify.dto.js';
import type { VerifyEmailDto } from './dto/verify-email.dto.js';
import type { AuthenticatorTransport } from '@simplewebauthn/server';
import { WebAuthnService } from './webauthn.service.js';
import type { PasskeyRegisterVerifyDto } from './dto/passkey-register-verify.dto.js';
import type { PasskeyLoginOptionsDto } from './dto/passkey-login-options.dto.js';
import type { PasskeyLoginVerifyDto } from './dto/passkey-login-verify.dto.js';
import type { DeleteAccountResponse, PasskeyResponse } from '@memoir/shared';

// Precomputed Argon2id dummy hash for anti-enumeration timing defense
const DUMMY_ARGON2ID_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$4oA70RyFrB8PYtheEl9SfQ$dTgtd32mihCgYeHOI1ePViW/IYpou+3J5CokRnoaxXA';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // In-memory fallback if Redis is temporarily unreachable
  private readonly memoryStore = new Map<string, { value: string; expiresAt: number }>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MailService) private readonly mailService: MailService,
    @Inject(RedisService) private readonly redisService: RedisService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(WebAuthnService) private readonly webauthnService: WebAuthnService,
    @Inject(StorageService) private readonly storageService: StorageService,
  ) {}

  private async cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redisService.set(key, value, ttlSeconds);
    this.memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  private async cacheGet(key: string): Promise<string | null> {
    const redisVal = await this.redisService.get(key);
    if (redisVal) return redisVal;
    const mem = this.memoryStore.get(key);
    if (mem && mem.expiresAt > Date.now()) return mem.value;
    return null;
  }

  private async cacheDel(key: string): Promise<void> {
    await this.redisService.del(key);
    this.memoryStore.delete(key);
  }

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
   * Creates and registers a new authenticated session for a user.
   */
  private async createSessionForUser(
    user: { id: string; email: string },
    userAgent?: string,
    ip?: string,
    loginMetadata?: Record<string, unknown>,
    suspiciousContext?: { previousFailedAttempts?: number },
  ): Promise<{ user: { id: string; email: string }; rawToken: string }> {
    const rawToken = `memoir_s_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHash = this.hashToken(rawToken);
    const familyId = crypto.randomUUID();
    const { deviceLabel, userAgentSummary } = parseDeviceLabel(userAgent);
    const ipMasked = maskIp(ip);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Suspicious Login Heuristics Evaluation
    const pastSessions = await this.prisma.session.findMany({
      where: { userId: user.id },
      select: { deviceLabel: true, ipMaskedOrHash: true },
      take: 50,
    });

    const suspiciousReasons: string[] = [];
    if (suspiciousContext?.previousFailedAttempts && suspiciousContext.previousFailedAttempts > 0) {
      suspiciousReasons.push(
        `Login succeeded after ${suspiciousContext.previousFailedAttempts} failed attempt(s)`,
      );
    }

    if (pastSessions.length > 0) {
      const knownDevices = new Set(pastSessions.map((s) => s.deviceLabel));
      const knownIps = new Set(pastSessions.map((s) => s.ipMaskedOrHash));

      if (deviceLabel && !knownDevices.has(deviceLabel)) {
        suspiciousReasons.push(`New or unrecognized device: ${deviceLabel}`);
      }
      if (ipMasked && !knownIps.has(ipMasked)) {
        suspiciousReasons.push(`New IP address or network subnet: ${ipMasked}`);
      }
    }

    if (suspiciousReasons.length > 0) {
      await this.prisma.securityEvent.create({
        data: {
          userId: user.id,
          eventType: SecurityEventType.SUSPICIOUS_LOGIN,
          safeMetadata: {
            reasons: suspiciousReasons,
            deviceLabel,
            ipMasked,
            failedAttemptsPreceding: suspiciousContext?.previousFailedAttempts || 0,
            timestamp: new Date().toISOString(),
          },
        },
      });
    }

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
          ...(loginMetadata || {}),
        },
      },
    });

    return {
      user: { id: user.id, email: user.email },
      rawToken,
    };
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
   * Authenticates user credentials, checks account lockout, and either issues session or triggers 2FA challenge.
   */
  async login(
    dto: LoginDto,
    userAgent?: string,
    ip?: string,
  ): Promise<
    | { user: { id: string; email: string }; rawToken: string }
    | { mfaRequired: true; mfaToken: string }
  > {
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
      let lockedUntil: Date | null = null;

      if (willLock) {
        // Exponential backoff: 5 attempts = 15m, 6 attempts = 30m, 7 = 60m ... capped at 24h
        const exponent = Math.min(failedAttempts - 5, 6);
        const lockoutMinutes = Math.min(15 * Math.pow(2, exponent), 1440);
        lockedUntil = new Date(Date.now() + lockoutMinutes * 60 * 1000);
      }

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
            reason: willLock ? 'Exceeded failed login attempts threshold' : 'Invalid password',
            failedAttempts,
            lockedUntil: lockedUntil ? lockedUntil.toISOString() : undefined,
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

    const previousFailedAttempts = user.failedLoginAttempts;

    // Reset failed login attempts on successful password verification
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    }

    // Two-factor authentication check if active
    if (user.totpEnabled) {
      if (dto.totpCode) {
        const cleanCode = dto.totpCode.trim().replace(/-/g, '').toLowerCase();
        const codeHash = this.hashToken(cleanCode);
        const storedCodes = (
          Array.isArray(user.totpBackupCodesHash) ? (user.totpBackupCodesHash as string[]) : []
        ) as string[];
        const matchIdx = storedCodes.indexOf(codeHash);
        let codeValid = false;

        if (matchIdx !== -1) {
          codeValid = true;
          const updatedCodes = [...storedCodes];
          updatedCodes.splice(matchIdx, 1);
          await this.prisma.user.update({
            where: { id: user.id },
            data: { totpBackupCodesHash: updatedCodes },
          });
        } else if (user.totpSecretEncrypted) {
          try {
            const secret = decryptWithKms(
              user.totpSecretEncrypted,
              this.config.get('SERVER_KMS_KEY'),
            );
            const verification = verifySync({ token: dto.totpCode.trim(), secret });
            if (verification && verification.valid) {
              codeValid = true;
            }
          } catch {
            codeValid = false;
          }
        }

        if (!codeValid) {
          await this.prisma.securityEvent.create({
            data: {
              userId: user.id,
              eventType: SecurityEventType.LOGIN_FAILED,
              safeMetadata: { reason: 'Invalid 2FA code during login', ipMasked: maskIp(ip) },
            },
          });
          throw new UnauthorizedException('Invalid two-factor authentication code.');
        }

        return this.createSessionForUser(user, userAgent, ip, undefined, {
          previousFailedAttempts,
        });
      }

      // 2FA required: issue short-lived challenge token
      const mfaToken = `mfa_${crypto.randomBytes(32).toString('hex')}`;
      await this.cacheSet(
        `memoir:mfa:${mfaToken}`,
        JSON.stringify({ userId: user.id }),
        300, // 5 minutes TTL
      );

      return {
        mfaRequired: true,
        mfaToken,
      };
    }

    return this.createSessionForUser(user, userAgent, ip, undefined, { previousFailedAttempts });
  }

  /**
   * Initiates TOTP 2FA setup by generating a secret, QR code, and 10 single-use backup codes.
   */
  async setup2Fa(
    userId: string,
  ): Promise<{ secret: string; qrCodeUrl: string; backupCodes: string[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    const secret = generateSecret();
    const uri = generateURI({ secret, label: user.email, issuer: 'Memoir' });
    const qrCodeUrl = await QRCode.toDataURL(uri);

    const backupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
      backupCodes.push(`${hex.slice(0, 4)}-${hex.slice(4, 8)}`);
    }

    await this.cacheSet(
      `memoir:2fa:setup:${user.id}`,
      JSON.stringify({ secret, backupCodes }),
      600, // 10 minutes TTL
    );

    return { secret, qrCodeUrl, backupCodes };
  }

  /**
   * Activates TOTP 2FA by verifying the enrollment token and encrypting the secret with SERVER_KMS_KEY.
   */
  async enable2Fa(userId: string, token: string): Promise<{ message: string }> {
    const cached = await this.cacheGet(`memoir:2fa:setup:${userId}`);
    if (!cached) {
      throw new BadRequestException('2FA setup session expired. Please begin setup again.');
    }

    const { secret, backupCodes } = JSON.parse(cached) as { secret: string; backupCodes: string[] };
    const verification = verifySync({ token: token.trim(), secret });
    if (!verification || !verification.valid) {
      throw new BadRequestException('Invalid authentication code.');
    }

    const hashedBackupCodes = backupCodes.map((code) =>
      this.hashToken(code.replace(/-/g, '').toLowerCase()),
    );
    const encryptedSecret = encryptWithKms(secret, this.config.get('SERVER_KMS_KEY'));

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabled: true,
        totpSecretEncrypted: encryptedSecret,
        totpBackupCodesHash: hashedBackupCodes,
      },
    });

    await this.cacheDel(`memoir:2fa:setup:${userId}`);

    await this.prisma.securityEvent.create({
      data: {
        userId,
        eventType: SecurityEventType.TOTP_ENABLED,
        safeMetadata: { timestamp: new Date().toISOString() },
      },
    });

    return { message: 'Two-factor authentication enabled successfully.' };
  }

  /**
   * Verifies a 2FA code during login (via mfaToken challenge) or within an authenticated session.
   */
  async verify2Fa(
    dto: TotpVerifyDto,
    currentUserId?: string,
    userAgent?: string,
    ip?: string,
  ): Promise<{ user: { id: string; email: string }; rawToken: string }> {
    let userId = currentUserId;

    if (dto.mfaToken) {
      const cached = await this.cacheGet(`memoir:mfa:${dto.mfaToken}`);
      if (!cached) {
        throw new UnauthorizedException('MFA session expired or invalid. Please log in again.');
      }
      const data = JSON.parse(cached) as { userId: string };
      userId = data.userId;
    }

    if (!userId) {
      throw new BadRequestException('MFA challenge token or active session required.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.totpEnabled || !user.totpSecretEncrypted) {
      throw new BadRequestException('Two-factor authentication is not active on this account.');
    }

    const cleanCode = dto.code.trim().replace(/-/g, '').toLowerCase();
    const codeHash = this.hashToken(cleanCode);
    const storedCodes = (
      Array.isArray(user.totpBackupCodesHash) ? (user.totpBackupCodesHash as string[]) : []
    ) as string[];
    const matchIdx = storedCodes.indexOf(codeHash);
    let codeValid = false;

    if (matchIdx !== -1) {
      codeValid = true;
      const updatedCodes = [...storedCodes];
      updatedCodes.splice(matchIdx, 1);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { totpBackupCodesHash: updatedCodes },
      });
    } else {
      try {
        const secret = decryptWithKms(user.totpSecretEncrypted, this.config.get('SERVER_KMS_KEY'));
        const verification = verifySync({ token: dto.code.trim(), secret });
        if (verification && verification.valid) {
          codeValid = true;
        }
      } catch {
        codeValid = false;
      }
    }

    if (!codeValid) {
      await this.prisma.securityEvent.create({
        data: {
          userId: user.id,
          eventType: SecurityEventType.LOGIN_FAILED,
          safeMetadata: { reason: 'Invalid 2FA code during verification', ipMasked: maskIp(ip) },
        },
      });
      throw new UnauthorizedException('Invalid two-factor authentication code or backup code.');
    }

    if (dto.mfaToken) {
      await this.cacheDel(`memoir:mfa:${dto.mfaToken}`);
    }

    return this.createSessionForUser(user, userAgent, ip);
  }

  /**
   * Disables two-factor authentication requiring account password re-authentication.
   */
  async disable2Fa(userId: string, dto: TotpDisableDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.totpEnabled || !user.totpSecretEncrypted) {
      throw new BadRequestException('Two-factor authentication is not currently enabled.');
    }

    const isPasswordValid = await this.verifyPassword(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password does not match.');
    }

    const cleanCode = dto.code.trim().replace(/-/g, '').toLowerCase();
    const codeHash = this.hashToken(cleanCode);
    const storedBackupCodes = (
      Array.isArray(user.totpBackupCodesHash) ? (user.totpBackupCodesHash as string[]) : []
    ) as string[];
    const matchIdx = storedBackupCodes.indexOf(codeHash);
    let codeValid = false;

    if (matchIdx !== -1) {
      codeValid = true;
    } else {
      try {
        const secret = decryptWithKms(user.totpSecretEncrypted, this.config.get('SERVER_KMS_KEY'));
        const verification = verifySync({ token: dto.code.trim(), secret });
        if (verification && verification.valid) {
          codeValid = true;
        }
      } catch {
        codeValid = false;
      }
    }

    if (!codeValid) {
      throw new UnauthorizedException('Invalid authentication code or backup code.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabled: false,
        totpSecretEncrypted: null,
        totpBackupCodesHash: Prisma.DbNull,
      },
    });

    await this.prisma.securityEvent.create({
      data: {
        userId,
        eventType: SecurityEventType.TOTP_DISABLED,
        safeMetadata: { timestamp: new Date().toISOString() },
      },
    });

    return { message: 'Two-factor authentication disabled successfully.' };
  }

  /**
   * Re-authenticated account password change without affecting user vaults.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    const isPasswordValid = await this.verifyPassword(user.passwordHash, dto.currentPassword);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password does not match.');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from current password.');
    }

    const newHash = await this.hashPassword(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    await this.prisma.securityEvent.create({
      data: {
        userId,
        eventType: SecurityEventType.PASSWORD_CHANGED,
        safeMetadata: { timestamp: new Date().toISOString() },
      },
    });

    return { message: 'Account password changed successfully.' };
  }

  /**
   * Initiates account password reset via email dispatch with anti-enumeration protection.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const genericResponse = {
      message: 'If this email address is registered, a password reset link has been dispatched.',
    };

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });

    if (!user) {
      await this.verifyPassword(DUMMY_ARGON2ID_HASH, 'dummy-password');
      return genericResponse;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: expiresAt,
      },
    });

    await this.mailService.sendPasswordResetEmail(user.email, rawToken);

    return genericResponse;
  }

  /**
   * Completes account password reset using a one-time token.
   * Strictly isolates password reset from user vaults: user_vaults is completely unaffected.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = this.hashToken(dto.token.trim());

    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }

    const newPasswordHash = await this.hashPassword(dto.newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Revoke all existing sessions upon password reset
    await this.prisma.session.deleteMany({
      where: { userId: user.id },
    });

    await this.prisma.securityEvent.create({
      data: {
        userId: user.id,
        eventType: SecurityEventType.PASSWORD_CHANGED,
        safeMetadata: { resetViaToken: true, timestamp: new Date().toISOString() },
      },
    });

    return { message: 'Password has been reset successfully. You may now log in.' };
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
      throw new UnauthorizedException('Missing session token.');
    }

    const tokenHash = this.hashToken(rawToken.trim());
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
    });

    if (!session) {
      throw new UnauthorizedException('Session not found or expired.');
    }

    if (session.revokedAt) {
      // Replay attack detected: revoke entire session family immediately
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.prisma.securityEvent.create({
        data: {
          userId: session.userId,
          eventType: SecurityEventType.SUSPICIOUS_LOGIN,
          safeMetadata: {
            reason: 'Session token replay detected — family revoked',
            familyId: session.familyId,
            ipMasked: maskIp(ip),
          },
        },
      });

      this.logger.warn(`Session replay detected for family: ${session.familyId}. Family revoked.`);
      throw new UnauthorizedException(
        'Security warning: Session token reuse detected. All active sessions in this family have been revoked.',
      );
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired.');
    }

    // Revoke current token
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    // Issue rotated token within the same family
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
        deviceLabel: deviceLabel || session.deviceLabel,
        userAgentSummary: userAgentSummary || session.userAgentSummary,
        ipMaskedOrHash: ipMasked,
        expiresAt,
      },
    });

    return { newRawToken };
  }

  /**
   * Logs out an active session by setting its revokedAt timestamp.
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
    totpEnabled: boolean;
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
      totpEnabled: user.totpEnabled,
      createdAt: user.createdAt,
    };
  }

  /**
   * Generates WebAuthn registration options for an authenticated user.
   */
  async generatePasskeyRegisterOptions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { webauthnCredentials: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    const rpName = this.config.get('RP_NAME') || 'Memoir';
    const rpID = this.config.get('RP_ID') || 'localhost';

    const options = await this.webauthnService.generateRegistrationOptions({
      rpName,
      rpID,
      userID: Buffer.from(user.id, 'utf-8'),
      userName: user.email,
      userDisplayName: user.email,
      attestationType: 'none',
      excludeCredentials: user.webauthnCredentials.map((c) => ({
        id: c.credentialId,
        transports: c.transports as AuthenticatorTransport[],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    await this.cacheSet(`memoir:webauthn:reg:${user.id}`, options.challenge, 300);
    return options;
  }

  /**
   * Verifies WebAuthn registration response and persists the new credential.
   */
  async verifyPasskeyRegister(
    userId: string,
    dto: PasskeyRegisterVerifyDto,
    originHeader?: string,
  ): Promise<{ message: string; credentialId: string }> {
    const expectedChallenge = await this.cacheGet(`memoir:webauthn:reg:${userId}`);
    if (!expectedChallenge) {
      throw new BadRequestException('Passkey registration challenge expired or not found.');
    }
    await this.cacheDel(`memoir:webauthn:reg:${userId}`);

    const rpID = this.config.get('RP_ID') || 'localhost';
    const configuredOrigin = this.config.get('WEB_URL');
    const allowedOrigins = [configuredOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'];
    if (originHeader && !allowedOrigins.includes(originHeader)) {
      allowedOrigins.push(originHeader);
    }

    let verification;
    try {
      verification = await this.webauthnService.verifyRegistrationResponse({
        response: dto.response,
        expectedChallenge,
        expectedOrigin: allowedOrigins,
        expectedRPID: rpID,
        requireUserVerification: false,
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Passkey registration verification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadRequestException('Passkey registration verification failed.');
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Passkey registration could not be verified.');
    }

    const { credential } = verification.registrationInfo;

    const created = await this.prisma.webAuthnCredential.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: credential.transports || [],
        deviceName: dto.deviceName || 'Passkey Device',
      },
    });

    await this.prisma.securityEvent.create({
      data: {
        userId,
        eventType: SecurityEventType.PASSKEY_ADDED,
        safeMetadata: {
          credentialId: credential.id,
          deviceName: created.deviceName,
        },
      },
    });

    return { message: 'Passkey registered successfully.', credentialId: credential.id };
  }

  /**
   * Generates WebAuthn authentication options for passkey sign-in.
   */
  async generatePasskeyLoginOptions(dto?: PasskeyLoginOptionsDto) {
    const rpID = this.config.get('RP_ID') || 'localhost';
    let allowCredentials;

    if (dto?.email) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      const user = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: { webauthnCredentials: true },
      });
      if (user && user.webauthnCredentials.length > 0) {
        allowCredentials = user.webauthnCredentials.map((c) => ({
          id: c.credentialId,
          transports: c.transports as AuthenticatorTransport[],
        }));
      }
    }

    const options = await this.webauthnService.generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials,
    });

    await this.cacheSet(
      `memoir:webauthn:auth:${options.challenge}`,
      JSON.stringify({ challenge: options.challenge, email: dto?.email }),
      300,
    );

    return options;
  }

  /**
   * Verifies WebAuthn authentication assertion and establishes session upon success.
   */
  async verifyPasskeyLogin(
    dto: PasskeyLoginVerifyDto,
    userAgent?: string,
    ip?: string,
    originHeader?: string,
  ): Promise<{ user: { id: string; email: string }; rawToken: string }> {
    const credentialId = dto.response?.id;
    if (!credentialId) {
      throw new BadRequestException('Passkey credential ID missing.');
    }

    const cred = await this.prisma.webAuthnCredential.findUnique({
      where: { credentialId },
      include: { user: true },
    });

    if (!cred) {
      throw new UnauthorizedException('Unrecognized passkey credential.');
    }

    if (cred.user.accountStatus !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active.');
    }

    if (cred.user.lockedUntil && cred.user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account is temporarily locked. Please try again later.');
    }

    // Determine challenge from clientDataJSON or dto
    let challenge = dto.challenge;
    if (!challenge && dto.response?.response?.clientDataJSON) {
      try {
        const parsed = JSON.parse(
          Buffer.from(dto.response.response.clientDataJSON, 'base64url').toString('utf-8'),
        );
        challenge = parsed.challenge;
      } catch {
        // ignore
      }
    }

    if (!challenge) {
      throw new BadRequestException('Authentication challenge could not be identified.');
    }

    const storedData = await this.cacheGet(`memoir:webauthn:auth:${challenge}`);
    if (!storedData) {
      throw new BadRequestException('Passkey login challenge expired or invalid.');
    }
    await this.cacheDel(`memoir:webauthn:auth:${challenge}`);

    const rpID = this.config.get('RP_ID') || 'localhost';
    const configuredOrigin = this.config.get('WEB_URL');
    const allowedOrigins = [configuredOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'];
    if (originHeader && !allowedOrigins.includes(originHeader)) {
      allowedOrigins.push(originHeader);
    }

    let verification;
    try {
      verification = await this.webauthnService.verifyAuthenticationResponse({
        response: dto.response,
        expectedChallenge: challenge,
        expectedOrigin: allowedOrigins,
        expectedRPID: rpID,
        credential: {
          id: cred.credentialId,
          publicKey: new Uint8Array(cred.publicKey),
          counter: Number(cred.counter),
          transports: cred.transports as AuthenticatorTransport[],
        },
        requireUserVerification: false,
      });
    } catch (err: unknown) {
      await this.prisma.securityEvent.create({
        data: {
          userId: cred.userId,
          eventType: SecurityEventType.LOGIN_FAILED,
          safeMetadata: {
            method: 'passkey',
            credentialId,
            reason: err instanceof Error ? err.message : 'verification_exception',
          },
        },
      });
      throw new UnauthorizedException('Passkey authentication verification failed.');
    }

    if (!verification.verified || !verification.authenticationInfo) {
      await this.prisma.securityEvent.create({
        data: {
          userId: cred.userId,
          eventType: SecurityEventType.LOGIN_FAILED,
          safeMetadata: {
            method: 'passkey',
            credentialId,
            reason: 'unverified_assertion',
          },
        },
      });
      throw new UnauthorizedException('Passkey authentication could not be verified.');
    }

    // Update counter and lastUsedAt
    await this.prisma.webAuthnCredential.update({
      where: { id: cred.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });

    const previousFailedAttempts = cred.user.failedLoginAttempts;

    // Reset failed login attempts
    await this.prisma.user.update({
      where: { id: cred.userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    return this.createSessionForUser(
      { id: cred.user.id, email: cred.user.email },
      userAgent,
      ip,
      {
        method: 'passkey',
        credentialId: cred.credentialId,
      },
      { previousFailedAttempts },
    );
  }

  /**
   * Lists all registered passkeys for an authenticated user.
   */
  async listPasskeys(userId: string): Promise<PasskeyResponse[]> {
    const creds = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        credentialId: true,
        deviceName: true,
        createdAt: true,
        lastUsedAt: true,
        transports: true,
      },
    });

    return creds.map((c) => ({
      id: c.id,
      credentialId: c.credentialId,
      deviceName: c.deviceName,
      createdAt: c.createdAt.toISOString(),
      lastUsedAt: c.lastUsedAt ? c.lastUsedAt.toISOString() : null,
      transports: c.transports,
    }));
  }

  /**
   * Deletes a registered passkey.
   */
  async deletePasskey(userId: string, passkeyId: string): Promise<{ message: string }> {
    const cred = await this.prisma.webAuthnCredential.findFirst({
      where: { id: passkeyId, userId },
    });
    if (!cred) {
      throw new BadRequestException('Passkey credential not found.');
    }

    await this.prisma.webAuthnCredential.delete({
      where: { id: cred.id },
    });

    await this.prisma.securityEvent.create({
      data: {
        userId,
        eventType: SecurityEventType.PASSKEY_REMOVED,
        safeMetadata: {
          id: cred.id,
          credentialId: cred.credentialId,
        },
      },
    });

    return { message: 'Passkey credential removed successfully.' };
  }

  /**
   * Permanently deletes user account, purging all live encrypted memories,
   * user vaults, sessions, backups, credentials, and disk/S3 attachment files.
   */
  async deleteAccount(userId: string, dto: DeleteAccountDto): Promise<DeleteAccountResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new BadRequestException('Account not found.');
    }

    // 1. Re-authenticate account password
    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      this.logger.warn(`Failed account deletion attempt for user ${userId}: invalid password`);
      throw new UnauthorizedException('Incorrect password. Account deletion aborted.');
    }

    // 2. Explicit confirmation string check
    if (dto.confirmation.trim().toUpperCase() !== 'DELETE MY ACCOUNT') {
      throw new BadRequestException(
        'Confirmation string mismatch. You must explicitly type "DELETE MY ACCOUNT" to proceed.',
      );
    }

    // 3. Purge all physical attachment files stored on disk or S3
    const attachments = await this.prisma.attachment.findMany({
      where: { userId },
      select: { storageKey: true },
    });

    for (const attachment of attachments) {
      try {
        await this.storageService.deleteFile(attachment.storageKey);
      } catch (err) {
        this.logger.warn(
          `Failed to delete physical storage file ${attachment.storageKey} during account purge: ${err}`,
        );
      }
    }

    this.logger.log(
      `Executing irreversible account deletion for user ${userId} (${attachments.length} attachment files purged).`,
    );

    // 4. Atomic cascade delete from PostgreSQL
    // (Cascades to user_vaults, sessions, memories, attachments, backups, security_events, webauthn_credentials)
    await this.prisma.user.delete({
      where: { id: userId },
    });

    return {
      message: 'Account and associated encrypted data permanently deleted.',
      backupRetentionNotice:
        'All live memories, vaults, attachments, and credentials have been permanently deleted immediately. Encrypted database snapshots are securely rotated and purged per our 30-day disaster recovery retention policy.',
    };
  }
}
