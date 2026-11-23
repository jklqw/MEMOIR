import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigService } from '../config/config.service.js';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit() {
    try {
      this.client = new Redis({
        host: this.config.get('REDIS_HOST'),
        port: this.config.get('REDIS_PORT'),
        password: this.config.get('REDIS_PASSWORD'),
        connectTimeout: 3000,
        maxRetriesPerRequest: 2,
        lazyConnect: true,
      });
      await this.client.connect();
      this.logger.log('Redis connected successfully');
    } catch (err) {
      this.logger.warn(
        `Redis connection failed: ${(err as Error).message}. Running in fallback mode.`,
      );
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) return;
    try {
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (err) {
      this.logger.warn(`Redis set failed for key ${key}: ${(err as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch (err) {
      this.logger.warn(`Redis del failed for key ${key}: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
    }
  }
}
