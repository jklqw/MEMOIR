export interface StorageProvider {
  upload(storageKey: string, data: Buffer): Promise<void>;
  download(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
