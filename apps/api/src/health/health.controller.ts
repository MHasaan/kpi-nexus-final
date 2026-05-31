import { Controller, Get } from '@nestjs/common';

import { Public } from '../rbac/decorators/public.decorator.js';
import { DbHealthService } from './db-health.service.js';
import { RedisHealthService } from './redis-health.service.js';

export interface HealthResponse {
  db: 'ok' | 'down';
  redis: 'ok' | 'down';
}

export interface ComponentStatus {
  name: string;
  status: 'ok' | 'down';
  latencyMs: number;
}

export interface HealthDetailsResponse {
  status: 'ok' | 'degraded';
  components: ComponentStatus[];
  uptimeSeconds: number;
  timestamp: string;
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

  @Get('details')
  async details(): Promise<HealthDetailsResponse> {
    const [dbResult, redisResult] = await Promise.all([
      this.pingWithLatency('database', () => this.db.ping()),
      this.pingWithLatency('redis', () => this.redis.ping()),
    ]);

    const components: ComponentStatus[] = [dbResult, redisResult];
    const allOk = components.every((c) => c.status === 'ok');

    return {
      status: allOk ? 'ok' : 'degraded',
      components,
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  private async pingWithLatency(
    name: string,
    ping: () => Promise<boolean>,
  ): Promise<ComponentStatus> {
    const start = performance.now();
    const up = await ping();
    const latencyMs = Math.round(performance.now() - start);
    return { name, status: up ? 'ok' : 'down', latencyMs };
  }
}
