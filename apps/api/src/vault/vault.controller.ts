import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AuthGuard } from '../auth/guards/auth.guard.js';
import { CreateVaultDto } from './dto/create-vault.dto.js';
import { RecoverVaultDto } from './dto/recover-vault.dto.js';
import { RotatePassphraseDto } from './dto/rotate-passphrase.dto.js';
import { VaultService } from './vault.service.js';

@ApiTags('Vault')
@Controller('vault')
@UseGuards(AuthGuard)
@ApiCookieAuth()
export class VaultController {
  constructor(private readonly vaultService: VaultService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initialize User Zero-Knowledge Vault',
    description:
      'Stores client-derived KDF parameters, PassphraseKEK-wrapped DEK, and RecoveryKEK-wrapped DEK. Server never sees plaintext DEK, passphrase, or recovery key.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Vault created successfully.' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Vault already initialized.' })
  async createVault(@CurrentUser() user: User, @Body() dto: CreateVaultDto) {
    const vault = await this.vaultService.createVault(user.id, dto);
    return {
      success: true,
      data: vault,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'Get Vault Metadata and Wrapped DEK',
    description:
      'Returns the user vault record containing KDF salt/parameters and wrapped DEK envelopes required for client-side unlocking.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Vault record returned (or null if not initialized).',
  })
  async getVault(@CurrentUser() user: User) {
    const vault = await this.vaultService.getVault(user.id);
    return {
      success: true,
      data: vault,
    };
  }

  @Post('rotate-passphrase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate Vault Passphrase',
    description:
      'Replaces the PassphraseKEK-wrapped DEK and KDF salt after client re-wraps the DEK with a new passphrase. Zero memories are re-encrypted.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Passphrase rotated successfully.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vault not found.' })
  async rotatePassphrase(@CurrentUser() user: User, @Body() dto: RotatePassphraseDto) {
    const vault = await this.vaultService.rotatePassphrase(user.id, dto);
    return {
      success: true,
      data: vault,
    };
  }

  @Post('recover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recover Vault Access',
    description:
      'Updates wrapped DEK after client unwraps DEK using the Recovery Key and establishes a new Vault Passphrase.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Vault recovered successfully.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Vault not found.' })
  async recoverVault(@CurrentUser() user: User, @Body() dto: RecoverVaultDto) {
    const vault = await this.vaultService.recoverVault(user.id, dto);
    return {
      success: true,
      data: vault,
    };
  }
}
