import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'archivist@example.com',
    description: 'User email address for account authentication and recovery notices',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Invalid email address' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    example: 'Correct-Horse-Battery-Staple-42!',
    description: 'Account authentication password (minimum 10 characters, maximum 128)',
  })
  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters long' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  password!: string;
}
