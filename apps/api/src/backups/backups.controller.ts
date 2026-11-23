import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { BackupsService } from './backups.service.js';
import { ImportBackupDto } from './dto/import-backup.dto.js';
import type { MemoirEncryptedBackup, BackupHistoryItem, BackupRestoreResult } from '@memoir/shared';

@ApiTags('Backups')
@Controller('backups')
@UseGuards(AuthGuard)
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export complete zero-knowledge encrypted backup archive with SHA-256 manifest',
  })
  @ApiResponse({
    status: 200,
    description: 'Encrypted backup payload generated successfully',
  })
  async exportBackup(@CurrentUser('id') userId: string): Promise<MemoirEncryptedBackup> {
    return this.backupsService.exportBackup(userId);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate and restore encrypted backup archive into the user account',
  })
  @ApiResponse({
    status: 200,
    description: 'Backup archive restored successfully',
  })
  async importBackup(
    @CurrentUser('id') userId: string,
    @Body() payload: ImportBackupDto,
  ): Promise<BackupRestoreResult> {
    return this.backupsService.importBackup(userId, payload);
  }

  @Get('history')
  @ApiOperation({
    summary: 'Get export history of backups for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Backup history retrieved successfully',
  })
  async getHistory(@CurrentUser('id') userId: string): Promise<BackupHistoryItem[]> {
    return this.backupsService.getHistory(userId);
  }
}
