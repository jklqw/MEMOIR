import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse as SwaggerResponse, ApiTags } from '@nestjs/swagger';
import { MEMOIR_PROTOCOL_VERSION } from '@memoir/shared';
import { Redis } from 'ioredis';
import pg from 'pg';
import { AppConfigService } from '../config/config.service.js';

interface HealthCheckResult {
  status: 'ok' | 'degraded';
  protocolVersion: number;
  services: {
    postgres: 'connected' | 'disconnected';
    redis: 'connected' | 'disconnected';
  };
  uptimeSeconds: number;
  timestamp: string;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness and readiness health check' })
  @SwaggerResponse({ status: 200, description: 'Service health status' })
  async check(): Promise<HealthCheckResult> {
    const postgresStatus = await this.checkPostgres();
    const redisStatus = await this.checkRedis();

    const isHealthy = postgresStatus === 'connected' && redisStatus === 'connected';

    return {
      status: isHealthy ? 'ok' : 'degraded',
      protocolVersion: MEMOIR_PROTOCOL_VERSION,
      services: {
        postgres: postgresStatus,
        redis: redisStatus,
      },
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  private async checkPostgres(): Promise<'connected' | 'disconnected'> {
    const client = new pg.Client({
      connectionString: this.config.get('DATABASE_URL'),
      connectionTimeoutMillis: 2000,
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return 'connected';
    } catch {
      try {
        await client.end();
      } catch {
        // ignore close error
      }
      return 'disconnected';
    }
  }

  private async checkRedis(): Promise<'connected' | 'disconnected'> {
    let redis: Redis | null = null;
    try {
      redis = new Redis({
        host: this.config.get('REDIS_HOST'),
        port: this.config.get('REDIS_PORT'),
        password: this.config.get('REDIS_PASSWORD'),
        connectTimeout: 2000,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });
      await redis.connect();
      const pong = await redis.ping();
      await redis.quit();
      return pong === 'PONG' ? 'connected' : 'disconnected';
    } catch {
      if (redis) {
        redis.disconnect();
      }
      return 'disconnected';
    }
  }
}
