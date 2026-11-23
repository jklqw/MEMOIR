import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    example: 'd9f2e3a1b4c5e6f7a8b9c0d1e2f3a4b5',
    description: 'Cryptographically secure one-time email verification token received via email',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(16, { message: 'Verification token is required and must be valid' })
  token!: string;
}
