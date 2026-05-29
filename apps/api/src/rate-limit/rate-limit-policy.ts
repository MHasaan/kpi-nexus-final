/**
 * Pure rate-limit policy resolution. Kept free of Redis/Nest for unit testing.
 * Auth routes get a strict per-IP budget (brute-force defense); everything else
 * gets a generous per-org budget.
 */

export interface RateLimitPolicy {
  limit: number;
  windowSec: number;
  bucketKey: string;
}

export function resolveRateLimit(path: string, ip: string, orgId: string | null): RateLimitPolicy {
  if (path.startsWith('/auth')) {
    return { limit: 10, windowSec: 60, bucketKey: `rl:auth:${ip}` };
  }
  return { limit: 600, windowSec: 60, bucketKey: `rl:org:${orgId ?? ip}` };
}
