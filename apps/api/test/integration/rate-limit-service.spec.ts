/**
 * RateLimitService — live regression test against the docker-compose Redis.
 *
 * A denied request must not occupy the sliding window. Before BE-010 every
 * attempt was ZADDed and kept even when refused, so sustained spam kept a
 * bucket full forever — for the shared onboarding-AI daily cap that meant
 * anyone could lock out every real signup indefinitely.
 */
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';

import { Redis } from 'ioredis';
import { afterAll, describe, expect, test } from 'vitest';

import { RateLimitService } from '../../src/rate-limit/rate-limit.service';

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
if (!redisUp) console.warn(`[rate-limit-service.spec] Redis not reachable at ${REDIS_URL} — skipping`);

describe.skipIf(!redisUp)('RateLimitService (live)', () => {
  const service = new RateLimitService();
  const redis = new Redis(REDIS_URL);
  const keys: string[] = [];
  const key = () => {
    const k = `rl:test:${randomUUID()}`;
    keys.push(k);
    return k;
  };

  afterAll(async () => {
    if (keys.length) await redis.del(...keys);
    await redis.quit();
    await service.onModuleDestroy();
  });

  test('admits exactly `limit` requests, and refused attempts do not occupy the window', async () => {
    const k = key();
    const now = Date.now();
    const results = [];
    for (let i = 0; i < 5; i++) results.push((await service.consume(k, 2, 60, now + i)).allowed);
    expect(results).toEqual([true, true, false, false, false]);
    expect(await redis.zcard(k)).toBe(2);
  });

  test('admits again once the admitted requests age out, despite spam while full', async () => {
    const k = key();
    const t0 = Date.now();
    expect((await service.consume(k, 1, 1, t0)).allowed).toBe(true);
    for (let i = 1; i <= 10; i++) expect((await service.consume(k, 1, 1, t0 + i * 50)).allowed).toBe(false);
    // 1.1 s after the only ADMITTED request; before the fix the refused ones (up to t0+500) still filled it.
    expect((await service.consume(k, 1, 1, t0 + 1100)).allowed).toBe(true);
  });
});

// BE-018 follow-up: with Redis frozen (socket accepted, no replies — e.g.
// `docker pause`) a rate-limit command never settled, and since the limiter
// runs on EVERY request (a global guard, on by default since BE-017) the whole
// API hung — not just /health. A stalled command must fail open fast.
describe('RateLimitService — fails open fast when Redis stops answering', () => {
  test('consume() resolves allowed=true within ~2s against a black-hole Redis', async () => {
    const { createServer } = await import('node:net');
    const sockets: import('node:net').Socket[] = [];
    const blackhole = createServer((s) => {
      sockets.push(s); // accept, never reply
    });
    await new Promise<void>((r) => blackhole.listen(0, '127.0.0.1', () => r()));
    const port = (blackhole.address() as import('node:net').AddressInfo).port;

    const prev = process.env.REDIS_URL;
    process.env.REDIS_URL = `redis://127.0.0.1:${port}`;
    const service = new RateLimitService();
    process.env.REDIS_URL = prev;
    try {
      const started = Date.now();
      const result = await service.consume(`rl:test:${randomUUID()}`, 5, 60, Date.now());
      expect(result.allowed).toBe(true);
      expect(Date.now() - started).toBeLessThan(2_500);
    } finally {
      await service.onModuleDestroy().catch(() => undefined);
      for (const s of sockets) s.destroy();
      await new Promise<void>((r) => blackhole.close(() => r()));
    }
  }, 15_000);
});
