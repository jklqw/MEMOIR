import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module.js';
import { ConfigModule } from './config/config.module.js';
import { HealthModule } from './health/health.module.js';
import { MailModule } from './mail/mail.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    MailModule,
    AuthModule,
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
})
export class AppModule {}
