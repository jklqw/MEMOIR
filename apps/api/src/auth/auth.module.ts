import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './guards/auth.guard.js';

import { WebAuthnService } from './webauthn.service.js';

@Module({
  imports: [PrismaModule, MailModule, StorageModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, WebAuthnService],
  exports: [AuthService, AuthGuard, WebAuthnService],
})
export class AuthModule {}
