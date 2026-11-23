import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/config.module.js';
import { AppConfigService } from '../config/config.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LocalStorageProvider } from './providers/local-storage.provider.js';
import { S3StorageProvider } from './providers/s3-storage.provider.js';
import { STORAGE_PROVIDER } from './storage.interface.js';
import { StorageService } from './storage.service.js';

@Module({
  imports: [PrismaModule, AppConfigModule],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      useFactory: (config: AppConfigService) => {
        const driver = process.env['STORAGE_DRIVER'] || 'local';
        if (driver === 's3') {
          return new S3StorageProvider();
        }
        return new LocalStorageProvider(config.get('STORAGE_DIR'));
      },
      inject: [AppConfigService],
    },
    StorageService,
  ],
  exports: [StorageService, STORAGE_PROVIDER],
})
export class StorageModule {}
