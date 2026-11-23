import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { StorageProvider } from '../storage.interface.js';

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor() {
    this.bucket = process.env['S3_BUCKET'] || 'memoir-private-vault';
    this.endpoint = process.env['S3_ENDPOINT'] || 'https://s3.amazonaws.com';
  }

  private validateKey(key: string): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.enc$/i;
    if (!uuidRegex.test(key)) {
      throw new BadRequestException('Invalid storage key: directory traversal attempt rejected.');
    }
  }

  async upload(storageKey: string, data: Buffer): Promise<void> {
    this.validateKey(storageKey);
    this.logger.debug(
      `S3 upload: ${storageKey} (${data.length} bytes) to ${this.endpoint}/${this.bucket}`,
    );
    // In production, would sign AWS v4 HTTP request or call S3Client
  }

  async download(storageKey: string): Promise<Buffer> {
    this.validateKey(storageKey);
    this.logger.debug(`S3 download: ${storageKey} from ${this.endpoint}/${this.bucket}`);
    return Buffer.from('');
  }

  async delete(storageKey: string): Promise<void> {
    this.validateKey(storageKey);
    this.logger.debug(`S3 delete: ${storageKey} from ${this.endpoint}/${this.bucket}`);
  }

  async exists(storageKey: string): Promise<boolean> {
    this.validateKey(storageKey);
    return true;
  }
}
