import { Injectable, Logger } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { EnvConfig, EnvSchema } from './config.schema.js';

dotenv.config();

@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);
  private readonly env: EnvConfig;

  constructor() {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const formatted = parsed.error.format();
      this.logger.error(
        `Critical environment validation failure: ${JSON.stringify(formatted, null, 2)}`,
      );
      throw new Error('Invalid environment configuration');
    }
    this.env = parsed.data;
  }

  get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    return this.env[key];
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get isDevelopment(): boolean {
    return this.env.NODE_ENV === 'development';
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }
}
