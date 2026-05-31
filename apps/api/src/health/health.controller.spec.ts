import { describe, expect, test, vi } from 'vitest';

import type { DbHealthService } from './db-health.service.js';
import { HealthController } from './health.controller.js';
import type { RedisHealthService } from './redis-health.service.js';

function makeController(
  dbResult: boolean,
  redisResult: boolean,
): HealthController {
  const db = {
    ping: vi.fn().mockResolvedValue(dbResult),
  } as unknown as DbHealthService;
  const redis = {
    ping: vi.fn().mockResolvedValue(redisResult),
  } as unknown as RedisHealthService;
  return new HealthController(db, redis);
}

describe('HealthController', () => {
  test('reports ok for both services when both ping succeed', async () => {
    const controller = makeController(true, true);
    expect(await controller.check()).toEqual({ db: 'ok', redis: 'ok' });
  });

  test('reports down for the failing service only', async () => {
    expect(await makeController(false, true).check()).toEqual({
      db: 'down',
      redis: 'ok',
    });
    expect(await makeController(true, false).check()).toEqual({
      db: 'ok',
      redis: 'down',
    });
  });

  test('reports down for both when both pings fail', async () => {
    expect(await makeController(false, false).check()).toEqual({
      db: 'down',
      redis: 'down',
    });
  });
});

describe('HealthController /health/details', () => {
  test('overall status is ok when both components are up', async () => {
    const result = await makeController(true, true).details();

    expect(result.status).toBe('ok');
    expect(result.components).toHaveLength(2);

    const db = result.components.find((c) => c.name === 'database');
    const redis = result.components.find((c) => c.name === 'redis');
    expect(db?.status).toBe('ok');
    expect(redis?.status).toBe('ok');
    expect(typeof db?.latencyMs).toBe('number');
    expect(typeof redis?.latencyMs).toBe('number');
  });

  test('overall status is degraded when database is down', async () => {
    const result = await makeController(false, true).details();

    expect(result.status).toBe('degraded');
    const db = result.components.find((c) => c.name === 'database');
    const redis = result.components.find((c) => c.name === 'redis');
    expect(db?.status).toBe('down');
    expect(redis?.status).toBe('ok');
    expect(typeof db?.latencyMs).toBe('number');
  });

  test('overall status is degraded when redis is down', async () => {
    const result = await makeController(true, false).details();

    expect(result.status).toBe('degraded');
    const db = result.components.find((c) => c.name === 'database');
    const redis = result.components.find((c) => c.name === 'redis');
    expect(db?.status).toBe('ok');
    expect(redis?.status).toBe('down');
    expect(typeof redis?.latencyMs).toBe('number');
  });

  test('overall status is degraded when all components are down', async () => {
    const result = await makeController(false, false).details();

    expect(result.status).toBe('degraded');
    for (const c of result.components) {
      expect(c.status).toBe('down');
      expect(typeof c.latencyMs).toBe('number');
    }
  });

  test('response includes uptimeSeconds and a valid ISO timestamp', async () => {
    const before = Date.now();
    const result = await makeController(true, true).details();
    const after = Date.now();

    expect(typeof result.uptimeSeconds).toBe('number');
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);

    const ts = new Date(result.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
