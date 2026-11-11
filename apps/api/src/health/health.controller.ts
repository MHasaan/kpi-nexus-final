import { Controller, Get } from '@nestjs/common';

import { Public } from '../rbac/decorators/public.decorator.js';
import { DbHealthService } from './db-health.service.js';
import { RedisHealthService } from './redis-health.service.js';

/**
 * Upper bound for one dependency ping. A dependency that accepts the socket but
 * never answers (e.g. a paused Redis) used to hang GET /health indefinitely —
 * a liveness probe would then restart a healthy API (BE-018).
 */
const PING_TIMEOUT_MS = Number(process.env.HEALTH_PING_TIMEOUT_MS) > 0 ? Number(process.env.HEALTH_PING_TIMEOUT_MS) : 2_000;

/** Resolve the ping, or false once the timeout elapses (whichever is first). */
function bounded(ping: () => Promise<boolean>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), PING_TIMEOUT_MS);
  });
  return Promise.race([ping().catch(() => false), timeout]).finally(() => clearTimeout(timer));
}

export interface HealthResponse {
  db: 'ok' | 'down';
  redis: 'ok' | 'down';
  /** Build identifier (the commit SHA in deployed images), so a deploy can confirm what is live. */
  version: string;
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
    const [db, redis] = await Promise.all([bounded(() => this.db.ping()), bounded(() => this.redis.ping())]);
    return {
      db: db ? 'ok' : 'down',
      redis: redis ? 'ok' : 'down',
      version: process.env.APP_VERSION || 'dev',
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
    const up = await bounded(ping);
    const latencyMs = Math.round(performance.now() - start);
    return { name, status: up ? 'ok' : 'down', latencyMs };
  }
}
