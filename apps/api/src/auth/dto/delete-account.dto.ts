import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    example: 'Ultra-Secure-Password-123!',
    description: 'Current account authentication password for re-authentication verification',
  })
  @IsNotEmpty({ message: 'Current password is required' })
  @IsString({ message: 'Current password must be a string' })
  @MinLength(1, { message: 'Current password is required' })
  password!: string;

  @ApiProperty({
    example: 'DELETE MY ACCOUNT',
    description: 'Explicit confirmation string, must match "DELETE MY ACCOUNT"',
  })
  @IsNotEmpty({ message: 'Confirmation string is required' })
  @IsString({ message: 'Confirmation string must be a string' })
  confirmation!: string;
}
