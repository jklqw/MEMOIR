import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAttachmentDto {
  @ApiProperty({ example: '12345678-1234-1234-1234-123456789abc' })
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({ example: '12345678-1234-1234-1234-123456789abc' })
  @IsOptional()
  @IsUUID()
  memoryId?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isVaultItem?: boolean;

  @ApiProperty({ description: 'Wrapped 256-bit FileKey under user DEK' })
  @IsString()
  @IsNotEmpty()
  wrappedFileKey!: string;

  @ApiProperty({ description: '96-bit CSPRNG nonce for FileKey wrapping' })
  @IsString()
  @IsNotEmpty()
  fileKeyNonce!: string;

  @ApiProperty({ description: 'Encrypted metadata (originalFilename, mimeType, originalSize)' })
  @IsString()
  @IsNotEmpty()
  encryptedMetadata!: string;

  @ApiProperty({ description: '96-bit CSPRNG nonce for metadata envelope' })
  @IsString()
  @IsNotEmpty()
  metaNonce!: string;

  @ApiProperty({ description: '96-bit CSPRNG nonce for file bytes encryption' })
  @IsString()
  @IsNotEmpty()
  fileNonce!: string;

  @ApiProperty({ description: 'Base64URL encoded encrypted binary ciphertext' })
  @IsString()
  @IsNotEmpty()
  ciphertext!: string;
}
