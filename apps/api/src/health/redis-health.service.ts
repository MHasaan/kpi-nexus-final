import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisHealthService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisHealthService.name);
  private readonly redis = new Redis(
    process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    },
  );

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      this.logger.warn(`Redis quit failed: ${String(error)}`);
    }
  }

  async ping(): Promise<boolean> {
    try {
      // lazyConnect + no offline queue: a command sent before the socket is
      // open is rejected, not queued — so open it first or the first health
      // check after boot falsely reports Redis as down.
      if (this.redis.status === 'wait') await this.redis.connect();
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}
