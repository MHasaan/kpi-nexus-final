import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Redis ZSET sliding-window rate limiter. Each request adds a timestamped
 * member; old members outside the window are evicted; the live count is
 * compared to the limit. Fails OPEN (allow) on a Redis error so a cache hiccup
 * never takes the API down.
 */
@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
  private seq = 0;

  async consume(bucketKey: string, limit: number, windowSec: number, nowMs: number): Promise<RateLimitResult> {
    const windowStart = nowMs - windowSec * 1000;
    const member = `${nowMs}-${this.seq++}`;
    try {
      const result = await this.redis
        .multi()
        .zremrangebyscore(bucketKey, 0, windowStart)
        .zadd(bucketKey, nowMs, member)
        .zcard(bucketKey)
        .expire(bucketKey, windowSec)
        .exec();
      // result[2] = [err, count] from ZCARD.
      const count = Number(result?.[2]?.[1] ?? 0);
      return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
    } catch (err) {
      this.logger.warn(`rate-limit consume failed for ${bucketKey} (failing open): ${String(err)}`);
      return { allowed: true, remaining: limit };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
