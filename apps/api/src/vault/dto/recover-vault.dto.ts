import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class RecoverVaultDto {
  @ApiProperty({
    example: 'ZGV2LW5ldy1zYWx0LTE2Ynl0ZXM=',
    description: 'Fresh Base64-encoded KDF salt for new passphrase',
  })
  @IsString()
  @IsNotEmpty()
  kdfSalt!: string;

  @ApiPropertyOptional({ example: 65536, description: 'Argon2id memory parameter in KiB' })
  @IsOptional()
  @IsInt()
  @Min(1024)
  kdfMemory?: number;

  @ApiPropertyOptional({ example: 3, description: 'Argon2id iterations parameter' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  kdfIterations?: number;

  @ApiPropertyOptional({ example: 1, description: 'Argon2id parallelism parameter' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  kdfParallelism?: number;

  @ApiProperty({
    example: 'base64url-new-wrapped-dek',
    description: 'DEK wrapped under new PassphraseKEK',
  })
  @IsString()
  @IsNotEmpty()
  wrappedDek!: string;

  @ApiProperty({
    example: 'base64url-fresh-nonce',
    description: 'Fresh 12-byte CSPRNG nonce used for DEK re-wrapping',
  })
  @IsString()
  @IsNotEmpty()
  wrappedDekNonce!: string;

  @ApiPropertyOptional({
    example: 'base64url-fresh-recovery-salt',
    description: 'Optional fresh recovery salt if rotating recovery key',
  })
  @IsOptional()
  @IsString()
  recoverySalt?: string;

  @ApiPropertyOptional({
    example: 'base64url-fresh-recovery-wrapped-dek',
    description: 'Optional fresh recovery wrapped DEK if rotating recovery key',
  })
  @IsOptional()
  @IsString()
  recoveryWrappedDek?: string;

  @ApiPropertyOptional({
    example: 'base64url-fresh-recovery-nonce',
    description: 'Optional fresh recovery nonce if rotating recovery key',
  })
  @IsOptional()
  @IsString()
  recoveryNonce?: string;

  @ApiPropertyOptional({
    example: 'b2c3d4e5...',
    description: 'Optional fresh recovery key fingerprint',
  })
  @IsOptional()
  @IsString()
  recoveryKeyFingerprint?: string;
}
