import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Outbound webhook HMAC signing (Stripe-style).
 *
 * Signed payload is `${timestamp}.${body}`. The signature header carries both
 * the timestamp and the v1 HMAC-SHA256 hex digest:
 *
 *   X-KpiNexus-Signature: t=<unixSeconds>,v1=<hex>
 *
 * Verification recomputes the digest and compares in constant time, and
 * rejects timestamps outside a replay window (default 5 minutes).
 */

export interface SignatureParts {
  timestamp: number;
  v1: string;
}

/** Compute the v1 hex HMAC for a (timestamp, body) pair. */
export function computeSignature(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** Build the `X-KpiNexus-Signature` header value. */
export function signWebhook(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${computeSignature(secret, timestamp, body)}`;
}

/** Parse a `t=...,v1=...` header into its parts, or null if malformed. */
export function parseSignatureHeader(header: string | undefined): SignatureParts | null {
  if (!header) return null;
  let t: number | undefined;
  let v1: string | undefined;
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key === 't') {
      const n = Number.parseInt(val, 10);
      if (Number.isFinite(n)) t = n;
    } else if (key === 'v1') {
      v1 = val;
    }
  }
  if (t === undefined || v1 === undefined || v1.length === 0) return null;
  return { timestamp: t, v1 };
}

export interface VerifyOptions {
  /** Replay window in seconds (default 300 = 5 minutes). */
  maxSkewSeconds?: number;
  /** Current time in unix seconds (injectable for tests). */
  nowSeconds?: number;
}

/**
 * Verify a signature header against the raw body. Returns true only when the
 * header parses, the timestamp is within the replay window, and the v1 digest
 * matches in constant time.
 */
export function verifyWebhookSignature(
  secret: string,
  header: string | undefined,
  body: string,
  options: VerifyOptions = {},
): boolean {
  const parts = parseSignatureHeader(header);
  if (!parts) return false;

  const maxSkew = options.maxSkewSeconds ?? 300;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - parts.timestamp) > maxSkew) return false;

  const expected = computeSignature(secret, parts.timestamp, body);
  // Constant-time compare. Lengths must match for timingSafeEqual; a length
  // mismatch is itself a non-match (and avoids throwing).
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(parts.v1, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
