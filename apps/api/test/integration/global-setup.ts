/**
 * Integration-suite gate (audit OT-006).
 *
 * Most integration specs probe the live API in `beforeAll` and, if it is down,
 * `return` early from every test — which vitest reports as PASSED. A run
 * without a live API therefore looked green while testing nothing (e.g. the
 * cross-tenant fuzz).
 *
 * This probe runs once before the suite. If the API is unreachable the run
 * FAILS with an explicit message. To deliberately run only the specs that
 * don't need the API (e.g. the Redis-level ones), set INTEGRATION_ALLOW_NO_API=1.
 */
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export default async function setup(): Promise<void> {
  let reachable = false;
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3000) });
    reachable = res.ok;
  } catch {
    reachable = false;
  }
  if (reachable) return;

  if (process.env.INTEGRATION_ALLOW_NO_API === '1') {
    console.warn(
      `\n[integration] API not reachable at ${API_URL} — API-backed specs will NOT exercise anything ` +
        `(INTEGRATION_ALLOW_NO_API=1). Do not read their "passed" as coverage.\n`,
    );
    return;
  }
  throw new Error(
    `[integration] API not reachable at ${API_URL}/health. Start it first ` +
      `(pnpm --filter @kpi-nexus/api start), or set INTEGRATION_ALLOW_NO_API=1 to run only ` +
      `the specs that don't need it.`,
  );
}
