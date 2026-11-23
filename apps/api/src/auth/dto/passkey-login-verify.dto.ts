import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class PasskeyLoginVerifyDto {
  @ApiProperty({
    description: 'WebAuthn authentication assertion response from authenticator',
  })
  @IsNotEmpty({ message: 'Authentication response is required' })
  @IsObject({ message: 'Authentication response must be an object' })
  response!: AuthenticationResponseJSON;

  @ApiPropertyOptional({
    description: 'Challenge associated with the authentication assertion if supplied by client',
  })
  @IsOptional()
  @IsString()
  challenge?: string;
}
