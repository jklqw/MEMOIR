import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class TotpDisableDto {
  @ApiProperty({
    example: 'Correct-Horse-Battery-Staple-42!',
    description: 'Current account authentication password for re-authentication',
  })
  @IsNotEmpty({ message: 'Current password is required' })
  @IsString({ message: 'Current password must be a string' })
  password!: string;

  @ApiProperty({
    example: '123456',
    description: 'Current 6-digit TOTP code or single-use backup code',
  })
  @IsNotEmpty({ message: 'Authentication code is required' })
  @IsString({ message: 'Authentication code must be a string' })
  @MinLength(6, { message: 'Authentication code must be at least 6 characters' })
  @MaxLength(32, { message: 'Authentication code cannot exceed 32 characters' })
  code!: string;
}
