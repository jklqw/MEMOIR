import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class TotpVerifyDto {
  @ApiPropertyOptional({
    example: 'mfa_7d8e4f1a2b3c4d5e...',
    description: 'Short-lived MFA challenge token issued during step 1 login',
  })
  @IsOptional()
  @IsString({ message: 'MFA challenge token must be a string' })
  mfaToken?: string;

  @ApiProperty({
    example: '123456',
    description: 'Six-digit TOTP code or single-use backup code',
  })
  @IsNotEmpty({ message: 'Authentication code is required' })
  @IsString({ message: 'Authentication code must be a string' })
  @MinLength(6, { message: 'Authentication code must be at least 6 characters' })
  @MaxLength(32, { message: 'Authentication code cannot exceed 32 characters' })
  code!: string;
}
