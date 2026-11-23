import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { CsrfGuard } from './common/guards/csrf.guard.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';
import { setupSecurityMiddleware } from './common/security/security-headers.js';
import { AppConfigService } from './config/config.service.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const config = app.get(AppConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Security middlewares (Helmet, strict CSP, HSTS, Permissions-Policy, CORS, Cookies)
  setupSecurityMiddleware(app, config);

  // Trust first proxy (Nginx reverse proxy for accurate client IP resolution)
  const expressApp = app.getHttpAdapter().getInstance();
  if (typeof expressApp?.set === 'function') {
    expressApp.set('trust proxy', 1);
  }

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Global guards (CSRF protection on cookie-authenticated mutations)
  app.useGlobalGuards(new CsrfGuard(config));

  // Global pipes, filters, interceptors
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger / OpenAPI documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Memoir API')
    .setDescription(
      'Privacy-First, End-to-End Encrypted Personal Diary Platform API. All diary content is stored as opaque ciphertext envelopes.',
    )
    .setVersion('1.0.0')
    .addCookieAuth('session')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = config.get('PORT');
  const host = config.get('HOST');

  await app.listen(port, host);
  logger.log(`Memoir API listening on http://${host}:${port}/api/v1 (Docs at /docs)`);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap failure:', err);
  process.exit(1);
});
