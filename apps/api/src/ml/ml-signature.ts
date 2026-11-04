import { createHash, createHmac } from 'node:crypto';

export interface MlSignedRequest {
  tenantId: string;
  tsMs: number;
  method: string;
  /** Request path only, e.g. `/forecast` (no host, no query). */
  path: string;
  /** The exact body string sent on the wire. */
  body: string;
}

/**
 * HMAC-SHA256 request signature for the ML sidecar. MUST stay byte-for-byte
 * identical to the sidecar's `compute_signature` (apps/ml/app/middleware/
 * hmac_auth.py): hex digest of
 * `${tsMs}.${tenantId}.${METHOD}.${path}.${sha256hex(body)}` keyed by the shared
 * secret. Binding method, path and body stops a captured request being replayed
 * against another endpoint or with a different payload (BE-024). Pure —
 * unit-tested against a reference value produced by the Python side.
 */
export function signMlRequest(secret: string, req: MlSignedRequest): string {
  const bodyHash = createHash('sha256').update(req.body).digest('hex');
  return createHmac('sha256', secret)
    .update(`${req.tsMs}.${req.tenantId}.${req.method.toUpperCase()}.${req.path}.${bodyHash}`)
    .digest('hex');
}
