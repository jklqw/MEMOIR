import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class PasskeyRegisterVerifyDto {
  @ApiProperty({
    description: 'WebAuthn registration credential response payload from authenticator',
  })
  @IsNotEmpty({ message: 'Registration response is required' })
  @IsObject({ message: 'Registration response must be an object' })
  response!: RegistrationResponseJSON;

  @ApiPropertyOptional({
    example: 'MacBook Touch ID',
    description: 'Human-readable label for this passkey device',
  })
  @IsOptional()
  @IsString({ message: 'Device name must be a string' })
  @MaxLength(100, { message: 'Device name cannot exceed 100 characters' })
  deviceName?: string;
}
