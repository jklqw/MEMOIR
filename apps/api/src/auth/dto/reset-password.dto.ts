import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'd9e8f7a6b5c4d3e2f1...',
    description: 'One-time password reset token dispatched via email',
  })
  @IsNotEmpty({ message: 'Reset token is required' })
  @IsString({ message: 'Reset token must be a string' })
  @MinLength(16, { message: 'Invalid reset token format' })
  token!: string;

  @ApiProperty({
    example: 'New-Ultra-Secure-Password-456!',
    description: 'New account authentication password',
  })
  @IsNotEmpty({ message: 'New password is required' })
  @IsString({ message: 'New password must be a string' })
  @MinLength(12, { message: 'Password must be at least 12 characters long' })
  @MaxLength(128, { message: 'Password cannot exceed 128 characters' })
  newPassword!: string;
}
