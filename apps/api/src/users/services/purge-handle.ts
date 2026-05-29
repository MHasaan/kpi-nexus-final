import { createHash } from 'node:crypto';

/**
 * Deterministic, PII-free pseudonym for a purged user. Stable across re-runs
 * (so audit references stay consistent) but reveals nothing about the original
 * identity. Pure — unit-tested in isolation.
 */
export function purgedHandle(organizationId: string, userId: string): string {
  const digest = createHash('sha256').update(`${organizationId}:${userId}`).digest('hex');
  return `former-user-${digest.slice(0, 12)}`;
}
