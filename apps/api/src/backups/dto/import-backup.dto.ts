import { IsArray, IsNotEmpty, IsNumber, IsObject, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BackupManifestDto {
  @IsNumber()
  version!: number;

  @IsString()
  @IsNotEmpty()
  exportedAt!: string;

  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsNumber()
  entryCount!: number;

  @IsString()
  @IsNotEmpty()
  checksumSha256!: string;
}

export class VaultBackupDto {
  @IsString()
  @IsNotEmpty()
  kdfAlgorithm!: string;

  @IsString()
  @IsNotEmpty()
  kdfSalt!: string;

  @IsNumber()
  kdfMemory!: number;

  @IsNumber()
  kdfIterations!: number;

  @IsNumber()
  kdfParallelism!: number;

  @IsString()
  @IsNotEmpty()
  wrapAlgorithm!: string;

  @IsNumber()
  envelopeVersion!: number;

  @IsString()
  @IsNotEmpty()
  wrappedDek!: string;

  @IsString()
  @IsNotEmpty()
  wrappedDekNonce!: string;

  @IsString()
  @IsNotEmpty()
  recoverySalt!: string;

  @IsString()
  @IsNotEmpty()
  recoveryWrappedDek!: string;

  @IsString()
  @IsNotEmpty()
  recoveryNonce!: string;

  @IsString()
  @IsNotEmpty()
  recoveryKeyFingerprint!: string;
}

export class ImportBackupDto {
  @IsObject()
  @ValidateNested()
  @Type(() => BackupManifestDto)
  manifest!: BackupManifestDto;

  @IsObject()
  @ValidateNested()
  @Type(() => VaultBackupDto)
  vault!: VaultBackupDto;

  @IsArray()
  memories!: Array<{
    id: string;
    entryDate: string;
    isPinned: boolean;
    isTimeCapsule: boolean;
    unlockAt?: string | null;
    envelopeVersion: number;
    algorithm: string;
    ciphertext: string;
    nonce: string;
    archivedAt?: string | null;
    createdAt: string;
    updatedAt: string;
  }>;

  @IsArray()
  attachments!: Array<{
    id: string;
    memoryId?: string | null;
    isVaultItem: boolean;
    storageKey: string;
    byteSize: number;
    wrappedFileKey: string;
    fileKeyNonce: string;
    encryptedMetadata: string;
    metaNonce: string;
    fileNonce: string;
    createdAt: string;
    updatedAt: string;
  }>;
}
