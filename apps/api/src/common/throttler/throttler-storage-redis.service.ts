import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from '../../redis/redis.service.js';

export interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

@Injectable()
export class ThrottlerStorageRedisService implements ThrottlerStorage {
  private readonly logger = new Logger(ThrottlerStorageRedisService.name);

  // In-memory fallback if Redis is temporarily unreachable
  private readonly memoryHits = new Map<string, { count: number; expiresAt: number }>();
  private readonly memoryBlocks = new Map<string, number>();

  constructor(@Inject(RedisService) private readonly redisService: RedisService) {}

  async increment(
    key: string,
    ttl: number, // in milliseconds
    limit: number,
    blockDuration: number, // in milliseconds
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const client = this.redisService.getClient();

    if (client) {
      try {
        const hitKey = `memoir:throttle:${throttlerName}:${key}`;
        const blockKey = `memoir:throttle:block:${throttlerName}:${key}`;

        // 1. Check if key is currently blocked
        const blockPttl = await client.pttl(blockKey);
        if (blockPttl > 0) {
          const timeToBlockExpire = Math.max(1, Math.ceil(blockPttl / 1000));
          return {
            totalHits: limit + 1,
            timeToExpire: timeToBlockExpire,
            isBlocked: true,
            timeToBlockExpire,
          };
        }

        // 2. Increment hit count
        const hits = await client.incr(hitKey);
        if (hits === 1) {
          await client.pexpire(hitKey, ttl);
        }

        let hitPttl = await client.pttl(hitKey);
        if (hitPttl < 0) {
          await client.pexpire(hitKey, ttl);
          hitPttl = ttl;
        }

        const isBlocked = hits > limit;
        let timeToBlockExpire = 0;

        if (isBlocked && blockDuration > 0) {
          await client.psetex(blockKey, blockDuration, '1');
          timeToBlockExpire = Math.max(1, Math.ceil(blockDuration / 1000));
        }

        return {
          totalHits: hits,
          timeToExpire: Math.max(1, Math.ceil(hitPttl / 1000)),
          isBlocked,
          timeToBlockExpire,
        };
      } catch (err) {
        this.logger.warn(
          `Redis rate limit check failed: ${(err as Error).message}. Using in-memory fallback.`,
        );
      }
    }

    return this.incrementMemory(key, ttl, limit, blockDuration, throttlerName);
  }

  private incrementMemory(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): ThrottlerStorageRecord {
    const fullKey = `${throttlerName}:${key}`;
    const now = Date.now();

    const blockUntil = this.memoryBlocks.get(fullKey);
    if (blockUntil && blockUntil > now) {
      const timeToBlockExpire = Math.max(1, Math.ceil((blockUntil - now) / 1000));
      return {
        totalHits: limit + 1,
        timeToExpire: timeToBlockExpire,
        isBlocked: true,
        timeToBlockExpire,
      };
    }

    const hit = this.memoryHits.get(fullKey);
    if (!hit || hit.expiresAt <= now) {
      this.memoryHits.set(fullKey, { count: 1, expiresAt: now + ttl });
      return {
        totalHits: 1,
        timeToExpire: Math.max(1, Math.ceil(ttl / 1000)),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }

    hit.count += 1;
    const timeToExpire = Math.max(1, Math.ceil((hit.expiresAt - now) / 1000));
    const isBlocked = hit.count > limit;
    let timeToBlockExpire = 0;

    if (isBlocked && blockDuration > 0) {
      this.memoryBlocks.set(fullKey, now + blockDuration);
      timeToBlockExpire = Math.max(1, Math.ceil(blockDuration / 1000));
    }

    return {
      totalHits: hit.count,
      timeToExpire,
      isBlocked,
      timeToBlockExpire,
    };
  }
}
