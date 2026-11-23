import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'archivist@example.com',
    description: 'Registered user account email address',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Invalid email address' })
  email!: string;

  @ApiProperty({
    example: 'Correct-Horse-Battery-Staple-42!',
    description: 'Account authentication password',
  })
  @IsString()
  @MinLength(1, { message: 'Password is required' })
  password!: string;

  @ApiPropertyOptional({
    example: '123456',
    description: 'Six-digit Time-based One-Time Password if TOTP 2FA is active',
  })
  @IsOptional()
  @IsString()
  @Length(6, 6, { message: 'TOTP code must be exactly 6 digits' })
  totpCode?: string;
}
