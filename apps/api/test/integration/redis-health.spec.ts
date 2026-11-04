/**
 * RedisHealthService — live regression test against the docker-compose Redis.
 *
 * The client is created with `lazyConnect` + `enableOfflineQueue: false`, so a
 * command issued before the socket is open is rejected instead of queued. The
 * very first /health after an api boot therefore reported `redis: "down"` while
 * Redis was perfectly healthy. ping() must open the lazy connection first.
 */
import { createConnection } from 'node:net';

import { afterEach, describe, expect, test } from 'vitest';

import { RedisHealthService } from '../../src/health/redis-health.service';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

async function isRedisUp(): Promise<boolean> {
  const { hostname, port } = new URL(REDIS_URL);
  return new Promise((resolve) => {
    const sock = createConnection({ host: hostname, port: Number(port || 6379) });
    sock.setTimeout(2000);
    sock.once('connect', () => {
      sock.end();
      resolve(true);
    });
    sock.once('error', () => resolve(false));
    sock.once('timeout', () => {
      sock.destroy();
      resolve(false);
    });
  });
}

const redisUp = await isRedisUp();
if (!redisUp) console.warn(`[redis-health.spec] Redis not reachable at ${REDIS_URL} — skipping`);

describe.skipIf(!redisUp)('RedisHealthService (live)', () => {
  let service: RedisHealthService | undefined;

  afterEach(async () => {
    await service?.onModuleDestroy();
    service = undefined;
  });

  test('first ping on a fresh service reports Redis up', async () => {
    service = new RedisHealthService();
    expect(await service.ping()).toBe(true);
  });

  test('subsequent pings stay up', async () => {
    service = new RedisHealthService();
    await service.ping();
    expect(await service.ping()).toBe(true);
  });
});
