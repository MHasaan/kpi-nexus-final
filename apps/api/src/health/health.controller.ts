import { Controller, Get } from '@nestjs/common';

import { Public } from '../rbac/decorators/public.decorator.js';
import { DbHealthService } from './db-health.service.js';
import { RedisHealthService } from './redis-health.service.js';

export interface HealthResponse {
  db: 'ok' | 'down';
  redis: 'ok' | 'down';
}

@Controller('health')
@Public()
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
