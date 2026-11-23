import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { AttachmentsService } from './attachments.service.js';
import { CreateAttachmentDto } from './dto/create-attachment.dto.js';

@ApiTags('Attachments')
@Controller('attachments')
@UseGuards(AuthGuard)
@ApiCookieAuth()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Upload Encrypted Attachment',
    description:
      'Stores a client-encrypted binary file and encrypted metadata. Filename, MIME, and bytes are encrypted under per-file keys before submission.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Attachment stored successfully.' })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Exceeded file limit or user quota.',
  })
  async create(@CurrentUser() user: User, @Body() dto: CreateAttachmentDto) {
    const attachment = await this.attachmentsService.create(user.id, dto);
    return {
      success: true,
      data: attachment,
    };
  }

  @Get('quota')
  @ApiOperation({
    summary: 'Get Storage Quota Usage',
    description: 'Returns used bytes, total quota (250 MB), and usage percentage.',
  })
  async getQuota(@CurrentUser() user: User) {
    const quota = await this.attachmentsService.getQuota(user.id);
    return {
      success: true,
      data: quota,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'List Encrypted Attachments',
    description: 'Lists attachments owned by the authenticated user.',
  })
  async findAll(
    @CurrentUser() user: User,
    @Query('memoryId') memoryId?: string,
    @Query('isVaultItem') isVaultItem?: string,
  ) {
    const isVaultItemBool =
      isVaultItem !== undefined ? isVaultItem === 'true' || isVaultItem === '1' : undefined;

    const attachments = await this.attachmentsService.findAll(user.id, {
      memoryId,
      isVaultItem: isVaultItemBool,
    });
    return {
      success: true,
      data: attachments,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Encrypted Attachment Metadata',
    description: 'Retrieves wrapped keys and nonces required for client-side decryption.',
  })
  async findOne(@CurrentUser() user: User, @Param('id', new ParseUUIDPipe()) id: string) {
    const attachment = await this.attachmentsService.findOne(user.id, id);
    return {
      success: true,
      data: attachment,
    };
  }

  @Get(':id/download')
  @ApiOperation({
    summary: 'Download Encrypted Attachment Blob',
    description:
      'Serves raw encrypted ciphertext strictly with application/octet-stream and nosniff headers to prevent MIME sniffing.',
  })
  async download(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    const { buffer } = await this.attachmentsService.download(user.id, id);

    // Invariant: Never serve user content inline; force binary download with nosniff
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="encrypted.bin"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.send(buffer);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete Attachment',
    description: 'Soft-deletes metadata record and removes ciphertext from storage.',
  })
  async delete(@CurrentUser() user: User, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.attachmentsService.delete(user.id, id);
    return {
      success: true,
      message: 'Attachment deleted successfully',
    };
  }
}
