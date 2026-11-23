import * as crypto from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Ip,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CSRF_COOKIE_NAME } from '../common/guards/csrf.guard.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { PasskeyLoginOptionsDto } from './dto/passkey-login-options.dto.js';
import { PasskeyLoginVerifyDto } from './dto/passkey-login-verify.dto.js';
import { PasskeyRegisterVerifyDto } from './dto/passkey-register-verify.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { TotpDisableDto } from './dto/totp-disable.dto.js';
import { TotpEnableDto } from './dto/totp-enable.dto.js';
import { TotpVerifyDto } from './dto/totp-verify.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { AuthGuard, SESSION_COOKIE_NAME } from './guards/auth.guard.js';

const isProduction = process.env.NODE_ENV === 'production';
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const CSRF_COOKIE_OPTIONS = {
  httpOnly: false, // Must be readable by client JS to send in X-CSRF-Token header
  secure: isProduction,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

@ApiTags('Authentication')
@Throttle({ auth: { limit: 10, ttl: 60000 } })
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Register a new account',
    description:
      'Creates a new user record with server-side Argon2id password hashing and dispatches a verification token. Employs generic anti-enumeration responses.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Registration request received and processed.',
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input parameters.' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify account email address',
    description: 'Validates an unexpired, cryptographically hashed one-time verification token.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Email verified successfully.' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid or expired verification token.',
  })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Get('csrf')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtain a fresh CSRF token' })
  @ApiResponse({ status: HttpStatus.OK, description: 'CSRF token issued successfully.' })
  getCsrfToken(@Res({ passthrough: true }) response: Response) {
    const csrfToken = crypto.randomBytes(32).toString('hex');
    response.cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_OPTIONS);
    return { csrfToken };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate account credentials',
    description:
      'Authenticates email and password, checks account lockout, and issues an opaque HttpOnly cookie session or returns MFA challenge.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Logged in successfully or MFA challenged.' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid credentials or account locked.',
  })
  async login(
    @Body() dto: LoginDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto, userAgent, ip);
    if ('mfaRequired' in result) {
      return result;
    }
    response.cookie(SESSION_COOKIE_NAME, result.rawToken, COOKIE_OPTIONS);
    const csrfToken = crypto.randomBytes(32).toString('hex');
    response.cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_OPTIONS);
    return { user: result.user, csrfToken };
  }

  @Post('2fa/setup')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate TOTP two-factor authentication setup',
    description:
      'Generates a secret key, otpauth QR code data URL, and 10 single-use recovery backup codes.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'TOTP setup payload generated.' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Authentication required.' })
  async setup2Fa(@CurrentUser('id') userId: string) {
    return this.authService.setup2Fa(userId);
  }

  @Post('2fa/enable')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm and activate TOTP two-factor authentication',
    description:
      'Validates enrollment code, KMS-encrypts secret, hashes backup codes, and activates 2FA.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Two-factor authentication enabled successfully.',
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid code or expired session.' })
  async enable2Fa(@CurrentUser('id') userId: string, @Body() dto: TotpEnableDto) {
    return this.authService.enable2Fa(userId, dto.token);
  }

  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify two-factor authentication challenge during login or session check',
    description:
      'Validates 6-digit TOTP code or single-use backup code. Establishes session on success.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Two-factor authentication verified successfully.',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid code or challenge token.',
  })
  async verify2Fa(
    @Body() dto: TotpVerifyDto,
    @Req() request: Request,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const rawToken = (request.cookies as Record<string, string | undefined> | undefined)?.[
      SESSION_COOKIE_NAME
    ];
    let currentUserId: string | undefined;
    if (rawToken) {
      try {
        const tokenHash = this.authService.hashToken(rawToken.trim());
        const session = await this.authService['prisma'].session.findUnique({
          where: { tokenHash },
          select: { userId: true, revokedAt: true, expiresAt: true },
        });
        if (session && !session.revokedAt && session.expiresAt > new Date()) {
          currentUserId = session.userId;
        }
      } catch {
        // Ignored
      }
    }

    const { user, rawToken: newSessionToken } = await this.authService.verify2Fa(
      dto,
      currentUserId,
      userAgent,
      ip,
    );
    response.cookie(SESSION_COOKIE_NAME, newSessionToken, COOKIE_OPTIONS);
    const csrfToken = crypto.randomBytes(32).toString('hex');
    response.cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_OPTIONS);
    return { user, csrfToken };
  }

  @Post('2fa/disable')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disable two-factor authentication',
    description:
      'Requires current account password re-authentication and valid TOTP or backup code.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Two-factor authentication disabled successfully.',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid password or verification code.',
  })
  async disable2Fa(@CurrentUser('id') userId: string, @Body() dto: TotpDisableDto) {
    return this.authService.disable2Fa(userId, dto);
  }

  @Post('change-password')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change account authentication password',
    description:
      'Re-authenticates current password and updates to a new Argon2id password hash. Does not touch user vaults.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Password changed successfully.' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Current password incorrect.' })
  async changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(userId, dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request account password reset email',
    description: 'Dispatches password reset link with generic anti-enumeration response semantics.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Password reset email dispatched if account exists.',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete account password reset',
    description:
      'Validates one-time reset token, updates password hash, and revokes sessions. Vault data is strictly preserved.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Password reset successfully.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid or expired reset token.' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate session token',
    description:
      'Rotates the active session token within the session family. Replay of an already-rotated token triggers family-wide revocation.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Session rotated successfully.' })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid session or replay detected.',
  })
  async refresh(
    @Req() request: Request,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const rawToken = (request.cookies as Record<string, string | undefined> | undefined)?.[
      SESSION_COOKIE_NAME
    ];
    try {
      const { newRawToken } = await this.authService.refreshSession(rawToken ?? '', userAgent, ip);
      response.cookie(SESSION_COOKIE_NAME, newRawToken, COOKIE_OPTIONS);
      const csrfToken = crypto.randomBytes(32).toString('hex');
      response.cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_OPTIONS);
      return { message: 'Session refreshed successfully.', csrfToken };
    } catch (error) {
      response.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      response.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out current session',
    description: 'Revokes the active session in the database and clears the session cookie.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Logged out successfully.' })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const rawToken = (request.cookies as Record<string, string | undefined> | undefined)?.[
      SESSION_COOKIE_NAME
    ];
    await this.authService.logout(rawToken);
    response.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    response.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
    return { message: 'Logged out successfully.' };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Retrieves sanitized user profile details for the authenticated session.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Profile returned successfully.' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Authentication required.' })
  async getMe(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }

  @Post('passkeys/register/options')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate WebAuthn passkey registration options',
    description: 'Generates cryptographic challenge and RP parameters to enroll a new passkey.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Passkey registration options generated.' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Authentication required.' })
  async passkeyRegisterOptions(@CurrentUser('id') userId: string) {
    return this.authService.generatePasskeyRegisterOptions(userId);
  }

  @Post('passkeys/register/verify')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify and persist WebAuthn passkey registration',
    description: 'Verifies the authenticator attestation and registers the passkey public key.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Passkey registered successfully.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid attestation or challenge.' })
  async passkeyRegisterVerify(
    @CurrentUser('id') userId: string,
    @Body() dto: PasskeyRegisterVerifyDto,
    @Headers('origin') originHeader?: string,
  ) {
    return this.authService.verifyPasskeyRegister(userId, dto, originHeader);
  }

  @Post('passkeys/login/options')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate WebAuthn passkey assertion authentication options',
    description: 'Generates challenge for passkey sign-in. Supports discoverable passkeys.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Passkey authentication options generated.' })
  async passkeyLoginOptions(@Body() dto?: PasskeyLoginOptionsDto) {
    return this.authService.generatePasskeyLoginOptions(dto);
  }

  @Post('passkeys/login/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify WebAuthn passkey authentication assertion',
    description: 'Verifies passkey signature and establishes an authenticated session.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Authenticated successfully via passkey.' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Passkey verification failed.' })
  async passkeyLoginVerify(
    @Body() dto: PasskeyLoginVerifyDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('origin') originHeader: string | undefined,
    @Ip() ip: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.verifyPasskeyLogin(dto, userAgent, ip, originHeader);
    response.cookie(SESSION_COOKIE_NAME, result.rawToken, COOKIE_OPTIONS);
    const csrfToken = crypto.randomBytes(32).toString('hex');
    response.cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_OPTIONS);
    return { user: result.user, csrfToken };
  }

  @Get('passkeys')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'List user passkeys',
    description: 'Retrieves all registered passkeys for the authenticated user.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Passkeys returned successfully.' })
  async listPasskeys(@CurrentUser('id') userId: string) {
    return this.authService.listPasskeys(userId);
  }

  @Delete('passkeys/:id')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Remove registered passkey',
    description: 'Deletes a registered passkey for the authenticated user.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Passkey deleted successfully.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Passkey not found.' })
  async deletePasskey(@CurrentUser('id') userId: string, @Param('id') passkeyId: string) {
    return this.authService.deletePasskey(userId, passkeyId);
  }

  @Delete('account')
  @UseGuards(AuthGuard)
  @ApiCookieAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Permanently delete user account and encrypted data',
    description:
      'Requires recent re-authentication with current password and explicit confirmation phrase. Purges all user records and private storage blobs, clearing session cookies and returning honest retention notice.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Account and associated data permanently purged.',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Current password verification failed.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Confirmation string mismatch or account not found.',
  })
  async deleteAccount(
    @CurrentUser('id') userId: string,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.deleteAccount(userId, dto);
    response.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    response.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
    return result;
  }
}
