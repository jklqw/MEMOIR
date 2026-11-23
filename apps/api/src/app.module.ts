import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AttachmentsModule } from './attachments/attachments.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BackupsModule } from './backups/backups.module.js';
import { MemoirThrottlerGuard } from './common/throttler/throttler.guard.js';
import { ThrottlerStorageRedisService } from './common/throttler/throttler-storage-redis.service.js';
import { ConfigModule } from './config/config.module.js';
import { HealthModule } from './health/health.module.js';
import { MailModule } from './mail/mail.module.js';
import { MemoriesModule } from './memories/memories.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { RedisService } from './redis/redis.service.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { StorageModule } from './storage/storage.module.js';
import { VaultModule } from './vault/vault.module.js';

@Module({
  imports: [
    ConfigModule,
    RedisModule,
    PrismaModule,
    MailModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redisService: RedisService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60000, // 60s
            limit: 100, // 100 requests per minute
          },
          {
            name: 'auth',
            ttl: 60000, // 60s
            limit: 10, // 10 login/register attempts per minute
          },
          {
            name: 'recovery',
            ttl: 300000, // 5 minutes
            limit: 5, // 5 recovery attempts per 5 minutes
          },
        ],
        storage: new ThrottlerStorageRedisService(redisService),
      }),
    }),
    AuthModule,
    SessionsModule,
    VaultModule,
    MemoriesModule,
    StorageModule,
    AttachmentsModule,
    BackupsModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            '*.password',
            '*.currentPassword',
            '*.newPassword',
            '*.passphrase',
            '*.token',
            '*.refreshToken',
            '*.totpCode',
            '*.totpSecret',
            '*.backupCode',
            '*.recoveryKey',
            '*.ciphertext',
            '*.wrappedDek',
            '*.wrappedFileKey',
            '*.encryptedMeta',
          ],
          censor: '[REDACTED_SECRET]',
        },
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                  translateTime: 'HH:MM:ss Z',
                  ignore: 'pid,hostname',
                },
              }
            : undefined,
      },
    }),
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: MemoirThrottlerGuard,
    },
  ],
})
export class AppModule {}
