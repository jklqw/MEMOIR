import { Controller, Get, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { AuditService } from './audit.service.js';
import { QueryAuditEventsDto } from './dto/query-audit-events.dto.js';

@ApiTags('Audit')
@Controller('audit')
@UseGuards(AuthGuard)
@ApiCookieAuth()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('events')
  @ApiOperation({
    summary: 'List security audit events',
    description:
      'Returns a paginated list of security audit events for the authenticated user, filterable by eventType. Contains zero secrets or unredacted keys.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Paginated security audit log returned.' })
  async getEvents(@CurrentUser() user: User, @Query() query: QueryAuditEventsDto) {
    return this.auditService.getEvents(user.id, query);
  }

  @Get('posture')
  @ApiOperation({
    summary: 'Get account security posture overview',
    description:
      'Evaluates account security settings, active authentication factors, session count, and suspicious activity heuristics.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Security posture evaluation returned.' })
  async getPosture(@CurrentUser() user: User) {
    return this.auditService.getPosture(user.id);
  }
}
