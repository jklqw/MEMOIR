import * as crypto from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Ip,
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
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
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
      'Authenticates email and password, checks account lockout, and issues an opaque HttpOnly cookie session.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Logged in successfully.' })
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
    const { user, rawToken } = await this.authService.login(dto, userAgent, ip);
    response.cookie(SESSION_COOKIE_NAME, rawToken, COOKIE_OPTIONS);
    const csrfToken = crypto.randomBytes(32).toString('hex');
    response.cookie(CSRF_COOKIE_NAME, csrfToken, CSRF_COOKIE_OPTIONS);
    return { user, csrfToken };
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
}
