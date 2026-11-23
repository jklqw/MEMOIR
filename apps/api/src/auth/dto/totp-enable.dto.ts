import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class TotpEnableDto {
  @ApiProperty({
    example: '123456',
    description: 'Six-digit verification code from the authenticator application',
  })
  @IsNotEmpty({ message: 'Verification code is required' })
  @IsString({ message: 'Verification code must be a string' })
  @Length(6, 6, { message: 'Verification code must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'Verification code must consist of 6 numeric digits' })
  token!: string;
}
