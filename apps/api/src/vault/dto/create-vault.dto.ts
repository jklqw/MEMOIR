import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsPositive, IsString, Min } from 'class-validator';

export class CreateVaultDto {
  @ApiProperty({
    example: 'ARGON2ID',
    description: 'KDF algorithm used for passphrase key derivation',
  })
  @IsString()
  @IsNotEmpty()
  kdfAlgorithm!: string;

  @ApiProperty({ example: 'ZGV2LXNhbHQtMTZieXRlcw==', description: 'Base64-encoded KDF salt' })
  @IsString()
  @IsNotEmpty()
  kdfSalt!: string;

  @ApiProperty({ example: 65536, description: 'Argon2id memory parameter in KiB' })
  @IsInt()
  @Min(1024)
  kdfMemory!: number;

  @ApiProperty({ example: 3, description: 'Argon2id iterations parameter' })
  @IsInt()
  @IsPositive()
  kdfIterations!: number;

  @ApiProperty({ example: 1, description: 'Argon2id parallelism parameter' })
  @IsInt()
  @IsPositive()
  kdfParallelism!: number;

  @ApiProperty({ example: 'AES-256-GCM', description: 'Key wrap algorithm' })
  @IsString()
  @IsNotEmpty()
  wrapAlgorithm!: string;

  @ApiProperty({ example: 1, description: 'Memoir protocol envelope version' })
  @IsInt()
  @IsPositive()
  envelopeVersion!: number;

  @ApiProperty({
    example: 'base64url-wrapped-dek-bytes',
    description: 'PassphraseKEK-wrapped 256-bit DEK',
  })
  @IsString()
  @IsNotEmpty()
  wrappedDek!: string;

  @ApiProperty({
    example: 'base64url-wrapped-dek-nonce',
    description: '12-byte CSPRNG nonce used for DEK wrapping',
  })
  @IsString()
  @IsNotEmpty()
  wrappedDekNonce!: string;

  @ApiProperty({ example: 'base64url-recovery-salt', description: 'Recovery key HKDF salt' })
  @IsString()
  @IsNotEmpty()
  recoverySalt!: string;

  @ApiProperty({
    example: 'base64url-recovery-wrapped-dek',
    description: 'RecoveryKEK-wrapped 256-bit DEK',
  })
  @IsString()
  @IsNotEmpty()
  recoveryWrappedDek!: string;

  @ApiProperty({
    example: 'base64url-recovery-nonce',
    description: '12-byte CSPRNG nonce used for recovery DEK wrapping',
  })
  @IsString()
  @IsNotEmpty()
  recoveryNonce!: string;

  @ApiProperty({
    example: 'a1b2c3d4...',
    description: 'SHA-256 fingerprint of the recovery key for confirmation',
  })
  @IsString()
  @IsNotEmpty()
  recoveryKeyFingerprint!: string;
}
