import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateMemoryDto {
  @ApiPropertyOptional({
    example: 'b8e5c102-39f1-4df6-8488-82df31d5b3a1',
    description: 'Client-generated UUIDv4 for pre-bound AAD',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({
    example: '2026-11-23T12:00:00.000Z',
    description: 'Operational entry date bucket',
  })
  @IsDateString()
  entryDate!: string;

  @ApiPropertyOptional({ example: false, description: 'Whether this memory is pinned to top' })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Whether this entry is a time capsule' })
  @IsOptional()
  @IsBoolean()
  isTimeCapsule?: boolean;

  @ApiPropertyOptional({ example: null, description: 'Unlock date/time for time capsule entries' })
  @IsOptional()
  @IsDateString()
  unlockAt?: string | null;

  @ApiPropertyOptional({ example: 1, description: 'Memoir protocol envelope version' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  envelopeVersion?: number;

  @ApiPropertyOptional({ example: 'AES-256-GCM', description: 'Cipher algorithm' })
  @IsOptional()
  @IsString()
  algorithm?: string;

  @ApiProperty({
    example: 'base64url-padded-ciphertext-and-tag',
    description: 'Padded AES-256-GCM ciphertext + 16-byte GCM tag',
  })
  @IsString()
  @IsNotEmpty()
  ciphertext!: string;

  @ApiProperty({ example: 'base64url-12byte-nonce', description: 'Fresh 12-byte CSPRNG nonce' })
  @IsString()
  @IsNotEmpty()
  nonce!: string;
}
