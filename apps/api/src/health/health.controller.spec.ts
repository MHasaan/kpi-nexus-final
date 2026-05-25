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
