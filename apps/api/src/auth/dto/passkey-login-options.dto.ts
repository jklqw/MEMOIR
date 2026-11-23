import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class PasskeyLoginOptionsDto {
  @ApiPropertyOptional({
    example: 'archivist@example.com',
    description:
      'Email address of user requesting passkey authentication (optional for discoverable passkeys)',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email address format' })
  @IsString()
  email?: string;
}
