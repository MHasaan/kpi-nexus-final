import { Controller, Get } from '@nestjs/common';

import { type DbHealthService } from './db-health.service.js';
import { type RedisHealthService } from './redis-health.service.js';

export interface HealthResponse {
  db: 'ok' | 'down';
  redis: 'ok' | 'down';
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DbHealthService,
    private readonly redis: RedisHealthService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const [db, redis] = await Promise.all([this.db.ping(), this.redis.ping()]);
    return {
      db: db ? 'ok' : 'down',
      redis: redis ? 'ok' : 'down',
    };
  }
}
