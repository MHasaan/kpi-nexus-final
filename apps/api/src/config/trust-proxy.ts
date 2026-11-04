/**
 * Fastify `trustProxy` from the TRUST_PROXY env var (audit OT-009).
 *
 * Unset / "false" / "0" → don't trust X-Forwarded-* (req.ip is the socket
 * peer — correct when the API is exposed directly, and unspoofable).
 * "true" → trust every hop (only behind a proxy that strips client XFF).
 * "1", "2"… → trust that many proxy hops (typical: 1 behind a load balancer).
 * Anything else → comma-separated proxy IPs / CIDRs to trust.
 */
export function parseTrustProxy(raw: string | undefined): boolean | number | string[] {
  const value = raw?.trim().toLowerCase() ?? '';
  if (value === '' || value === 'false' || value === '0') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The adapter's typings take a hop count as a trust function `(addr, hop) => boolean`. */
export function fastifyTrustProxy(
  raw: string | undefined,
): boolean | string[] | ((address: string, hop: number) => boolean) {
  const parsed = parseTrustProxy(raw);
  return typeof parsed === 'number' ? (_address, hop) => hop < parsed : parsed;
}
