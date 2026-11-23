import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class UpdateMemoryDto {
  @ApiPropertyOptional({ example: '2026-11-23T12:00:00.000Z', description: 'Updated entry date' })
  @IsOptional()
  @IsDateString()
  entryDate?: string;

  @ApiPropertyOptional({ example: true, description: 'Pin status' })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Time capsule status' })
  @IsOptional()
  @IsBoolean()
  isTimeCapsule?: boolean;

  @ApiPropertyOptional({ example: null, description: 'Unlock date/time for time capsule' })
  @IsOptional()
  @IsDateString()
  unlockAt?: string | null;

  @ApiPropertyOptional({ example: 1, description: 'Envelope version' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  envelopeVersion?: number;

  @ApiPropertyOptional({ example: 'AES-256-GCM', description: 'Cipher algorithm' })
  @IsOptional()
  @IsString()
  algorithm?: string;

  @ApiPropertyOptional({
    example: 'base64url-fresh-ciphertext',
    description: 'Updated padded ciphertext',
  })
  @IsOptional()
  @IsString()
  ciphertext?: string;

  @ApiProperty({
    example: 'base64url-fresh-nonce',
    description: 'Fresh 12-byte CSPRNG nonce. Must NOT match previously stored nonce.',
  })
  @IsString()
  @IsNotEmpty()
  nonce!: string;
}
