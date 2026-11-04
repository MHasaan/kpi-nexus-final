/**
 * Attach an `error` listener to an ioredis client (BE-005). Without one, ioredis
 * prints "[ioredis] Unhandled error event" for every failed (re)connect. The
 * services using these clients already fail open on command errors; this only
 * makes the connection errors handled and readable.
 *
 * ioredis emits an error on each reconnect attempt, so logging is throttled:
 * the first error is logged, then at most one summary line per window.
 */
export function attachRedisErrorLogger(
  client: { on(event: 'error', listener: (err: Error) => void): unknown },
  logger: { warn(message: string): void },
  name: string,
  opts: { windowMs?: number; now?: () => number } = {},
): void {
  const windowMs = opts.windowMs ?? 30_000;
  const now = opts.now ?? Date.now;
  let lastLoggedAt: number | null = null;
  let suppressed = 0;

  client.on('error', (err: Error) => {
    const t = now();
    if (lastLoggedAt !== null && t - lastLoggedAt < windowMs) {
      suppressed += 1;
      return;
    }
    const extra = suppressed > 0 ? ` (${suppressed} more since last report)` : '';
    logger.warn(`Redis client "${name}" error: ${err.message}${extra}`);
    lastLoggedAt = t;
    suppressed = 0;
  });
}
