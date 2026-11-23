import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Session, User } from '@prisma/client';
import { CurrentSession, CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { SessionsService } from './sessions.service.js';

@ApiTags('Sessions')
@Controller('sessions')
@UseGuards(AuthGuard)
@ApiCookieAuth()
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List active sessions',
    description:
      'Returns all active, unrevoked device sessions for the authenticated user with masked IP addresses and device labels.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of active sessions returned.' })
  async listActiveSessions(@CurrentUser() user: User, @CurrentSession() currentSession: Session) {
    return this.sessionsService.listActiveSessions(user.id, currentSession.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke specific device session',
    description:
      'Remotely terminates and revokes an active session. Strictly scoped to the authenticated user (cross-user access denied).',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Session revoked successfully.' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Session not found or belongs to another user.',
  })
  async revokeSession(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.sessionsService.revokeSession(user.id, sessionId);
  }

  @Post('revoke-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke all other sessions',
    description:
      'Terminates all active sessions for the current user except the session making this request.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'All other sessions revoked successfully.' })
  async revokeAllOtherSessions(
    @CurrentUser() user: User,
    @CurrentSession() currentSession: Session,
  ) {
    return this.sessionsService.revokeAllOtherSessions(user.id, currentSession.id);
  }
}
