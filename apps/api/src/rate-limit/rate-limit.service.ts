import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Redis ZSET sliding-window rate limiter. Each request adds a timestamped
 * member; old members outside the window are evicted; the live count is
 * compared to the limit, and a refused request's member is removed again so
 * only admitted requests count. Fails OPEN (allow) on a Redis error so a cache hiccup
 * never takes the API down.
 */
@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  // Read at construction (after ConfigModule loaded .env), not at module load.
  private readonly redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
    // This runs on EVERY request (global guard). A frozen Redis (socket open, no
    // replies) must not hang the API: reject the command so consume() fails open.
    commandTimeout: 1_000,
  });
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
      if (count > limit) {
        // Refused: take the attempt back out so only ADMITTED requests occupy
        // the window. Otherwise sustained spam keeps a bucket full forever —
        // for a shared bucket (the onboarding-AI daily cap) that's a lockout
        // for everyone (BE-010).
        // Best effort: a failed cleanup must not flip this refusal to "allow".
        await this.redis.zrem(bucketKey, member).catch(() => undefined);
        return { allowed: false, remaining: 0 };
      }
      return { allowed: true, remaining: limit - count };
    } catch (err) {
      this.logger.warn(`rate-limit consume failed for ${bucketKey} (failing open): ${String(err)}`);
      return { allowed: true, remaining: limit };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
