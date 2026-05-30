import { createHmac } from 'node:crypto';

/**
 * HMAC-SHA256 request signature for the ML sidecar. MUST stay byte-for-byte
 * identical to the sidecar's `compute_signature` (apps/ml/app/middleware/
 * hmac_auth.py): hex digest of the message `${tsMs}.${tenantId}` keyed by the
 * shared secret. Pure — unit-tested against a reference value produced by the
 * Python side.
 */
export function signMlRequest(secret: string, tenantId: string, tsMs: number): string {
  return createHmac('sha256', secret).update(`${tsMs}.${tenantId}`).digest('hex');
}
