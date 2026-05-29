/**
 * Pure quota arithmetic. Kept free of Prisma/Nest for unit testing. A limit of
 * 0 (or negative) means unlimited.
 */

export function checkQuota(limit: number, current: number, increment: number): boolean {
  if (limit <= 0) return true;
  return current + increment <= limit;
}

/** Read a numeric quota for `key` from a plan's `quotas` JSON; missing/invalid → 0 (unlimited). */
export function resolveLimit(quotas: unknown, key: string): number {
  if (quotas === null || typeof quotas !== 'object') return 0;
  const value = (quotas as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
