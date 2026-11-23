import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { StorageProvider } from '../storage.interface.js';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly baseDir: string;

  constructor(customPath?: string) {
    // Resolve absolute path outside public web roots
    this.baseDir = path.resolve(customPath || process.env['STORAGE_DIR'] || './storage/attachments');
  }

  private validateKey(key: string): void {
    // Invariant: Storage keys must strictly be UUIDv4 format + .enc
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.enc$/i;
    if (!uuidRegex.test(key)) {
      throw new BadRequestException('Invalid storage key: directory traversal attempt rejected.');
    }
  }

  private getFilePath(key: string): string {
    this.validateKey(key);
    const resolved = path.resolve(this.baseDir, key);
    // Double check resolved path is inside baseDir
    if (!resolved.startsWith(this.baseDir)) {
      throw new BadRequestException('Path traversal rejected.');
    }
    return resolved;
  }

  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch (err) {
      this.logger.error(`Failed to ensure base directory ${this.baseDir}:`, err);
    }
  }

  async upload(storageKey: string, data: Buffer): Promise<void> {
    await this.ensureDir();
    const filePath = this.getFilePath(storageKey);
    await fs.writeFile(filePath, data);
  }

  async download(storageKey: string): Promise<Buffer> {
    const filePath = this.getFilePath(storageKey);
    return fs.readFile(filePath);
  }

  async delete(storageKey: string): Promise<void> {
    const filePath = this.getFilePath(storageKey);
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    const filePath = this.getFilePath(storageKey);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
