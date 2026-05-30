import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Pure draft-resumability helpers. The draft token is an HMAC of the session id
 * keyed by a server secret (deterministic, so it can be re-derived); only its
 * SHA-256 hash is stored, so a DB leak doesn't reveal usable tokens. Kept free
 * of Prisma/Nest for unit testing.
 */

export function deriveDraftToken(sessionId: string, secret: string): string {
  return createHmac('sha256', secret).update(sessionId).digest('hex');
}

export function hashDraftToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Timing-safe verification of a presented token against the stored hash. */
export function verifyDraftToken(token: string, storedHash: string | null): boolean {
  if (!storedHash || !token) return false;
  const a = Buffer.from(hashDraftToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Shallow-merge a patch over the current draft payload (patch wins per key). */
export function mergeDraft(
  current: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(current ?? {}), ...patch };
}
