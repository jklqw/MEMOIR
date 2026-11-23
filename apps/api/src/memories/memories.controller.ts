import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CreateMemoryDto } from './dto/create-memory.dto.js';
import { QueryMemoryDto } from './dto/query-memory.dto.js';
import { UpdateMemoryDto } from './dto/update-memory.dto.js';
import { MemoriesService } from './memories.service.js';

@ApiTags('Memories')
@Controller('memories')
@UseGuards(AuthGuard)
@ApiCookieAuth()
export class MemoriesController {
  constructor(private readonly memoriesService: MemoriesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create Encrypted Memory Entry',
    description:
      'Stores a client-encrypted memory ciphertext. Zero plaintext title, prose, tags, or mood are accepted or stored.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Memory created successfully.' })
  async create(@CurrentUser() user: User, @Body() dto: CreateMemoryDto) {
    const memory = await this.memoriesService.create(user.id, dto);
    return {
      success: true,
      data: memory,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'List Encrypted Memory Entries',
    description:
      'Returns paginated ciphertext records for the authenticated user. Masked for locked Time Capsules.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'List of encrypted memories.' })
  async findAll(@CurrentUser() user: User, @Query() query: QueryMemoryDto) {
    const memories = await this.memoriesService.findAll(user.id, query);
    return {
      success: true,
      data: memories,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get Specific Encrypted Memory Entry',
    description: 'Fetches a single encrypted memory record scoped strictly to the current user.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Encrypted memory returned.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Memory not found or unauthorized.' })
  async findOne(@CurrentUser() user: User, @Param('id', new ParseUUIDPipe()) id: string) {
    const memory = await this.memoriesService.findOne(user.id, id);
    return {
      success: true,
      data: memory,
    };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update Encrypted Memory Entry',
    description:
      'Updates an existing encrypted memory. Mandatory fresh nonce required; identical nonces are strictly rejected (400).',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Memory updated successfully.' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Nonce reuse detected.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Memory not found.' })
  async update(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMemoryDto,
  ) {
    const memory = await this.memoriesService.update(user.id, id, dto);
    return {
      success: true,
      data: memory,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete Encrypted Memory Entry',
    description: 'Soft-deletes a memory record. Scoped strictly to authenticated user.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Memory deleted successfully.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Memory not found.' })
  async delete(@CurrentUser() user: User, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.memoriesService.delete(user.id, id);
    return {
      success: true,
      message: 'Memory deleted successfully',
    };
  }

  @Post(':id/pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Toggle Pin on Memory Entry',
    description: 'Toggles pinned status for ordering at top of archive.',
  })
  async togglePin(@CurrentUser() user: User, @Param('id', new ParseUUIDPipe()) id: string) {
    const memory = await this.memoriesService.togglePin(user.id, id);
    return {
      success: true,
      data: memory,
    };
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Toggle Archive Status on Memory Entry',
    description: 'Archives or unarchives a memory without deleting ciphertexts.',
  })
  async toggleArchive(@CurrentUser() user: User, @Param('id', new ParseUUIDPipe()) id: string) {
    const memory = await this.memoriesService.toggleArchive(user.id, id);
    return {
      success: true,
      data: memory,
    };
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore Archived Memory Entry',
    description: 'Restores an archived memory back to active journal timeline.',
  })
  async restore(@CurrentUser() user: User, @Param('id', new ParseUUIDPipe()) id: string) {
    const memory = await this.memoriesService.restore(user.id, id);
    return {
      success: true,
      data: memory,
    };
  }
}
