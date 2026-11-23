import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class RotatePassphraseDto {
  @ApiProperty({
    example: 'ZGV2LW5ldy1zYWx0LTE2Ynl0ZXM=',
    description: 'Fresh Base64-encoded KDF salt',
  })
  @IsString()
  @IsNotEmpty()
  kdfSalt!: string;

  @ApiPropertyOptional({ example: 65536, description: 'Updated Argon2id memory parameter in KiB' })
  @IsOptional()
  @IsInt()
  @Min(1024)
  kdfMemory?: number;

  @ApiPropertyOptional({ example: 3, description: 'Updated Argon2id iterations parameter' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  kdfIterations?: number;

  @ApiPropertyOptional({ example: 1, description: 'Updated Argon2id parallelism parameter' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  kdfParallelism?: number;

  @ApiProperty({
    example: 'base64url-new-wrapped-dek',
    description: 'DEK re-wrapped under fresh PassphraseKEK',
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
}
