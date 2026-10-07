/**
 * Pure rate-limit policy resolution. Kept free of Redis/Nest for unit testing.
 *
 * A request can hit several buckets; it is rejected when ANY is exhausted:
 * - /auth/*: strict per-IP budget (brute force from one source);
 * - POST /auth/login: also a per-ACCOUNT budget (distributed brute force on
 *   one account — audit BE-017);
 * - POST /onboarding/start and /onboarding/ai/*: these are public (no login),
 *   so they get strict per-IP budgets (BE-010). The onboarding-AI global daily
 *   cap (onboardingAiGlobalPerDay) is enforced by OnboardingAiService, per
 *   real LLM call, not here;
 * - everything else: a generous per-org budget (per-IP when anonymous).
 *
 * Budgets come from env so local test suites (which register many orgs from
 * one IP) can relax them; production defaults are strict.
 */

export interface RateLimitPolicy {
  limit: number;
  windowSec: number;
  bucketKey: string;
}

export interface RateLimitBudgets {
  authPerIpPerMin: number;
  loginPerAccountPer15Min: number;
  orgPerMin: number;
  onboardingStartPerHour: number;
  onboardingAiPerIpPerHour: number;
  onboardingAiGlobalPerDay: number;
}

export const DEFAULT_BUDGETS: RateLimitBudgets = {
  authPerIpPerMin: 10,
  loginPerAccountPer15Min: 20,
  orgPerMin: 600,
  onboardingStartPerHour: 10,
  onboardingAiPerIpPerHour: 30,
  onboardingAiGlobalPerDay: 500,
};

export interface RateLimitRequest {
  path: string;
  ip: string;
  orgId: string | null;
  method: string;
  body: unknown;
}

/** On unless explicitly disabled — a deployment from the templates is protected. */
export function rateLimitEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.RATE_LIMIT_ENABLED !== 'false';
}

export function budgetsFromEnv(env: Record<string, string | undefined> = process.env): RateLimitBudgets {
  const int = (raw: string | undefined, fallback: number) => {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  };
  return {
    authPerIpPerMin: int(env.RATE_LIMIT_AUTH_PER_MIN, DEFAULT_BUDGETS.authPerIpPerMin),
    loginPerAccountPer15Min: int(env.RATE_LIMIT_LOGIN_PER_ACCOUNT, DEFAULT_BUDGETS.loginPerAccountPer15Min),
    orgPerMin: int(env.RATE_LIMIT_ORG_PER_MIN, DEFAULT_BUDGETS.orgPerMin),
    onboardingStartPerHour: int(env.RATE_LIMIT_ONBOARDING_START_PER_HOUR, DEFAULT_BUDGETS.onboardingStartPerHour),
    onboardingAiPerIpPerHour: int(env.RATE_LIMIT_ONBOARDING_AI_PER_HOUR, DEFAULT_BUDGETS.onboardingAiPerIpPerHour),
    onboardingAiGlobalPerDay: int(env.RATE_LIMIT_ONBOARDING_AI_GLOBAL_PER_DAY, DEFAULT_BUDGETS.onboardingAiGlobalPerDay),
  };
}

export function resolveRateLimits(req: RateLimitRequest, budgets: RateLimitBudgets): RateLimitPolicy[] {
  if (req.path.startsWith('/auth')) {
    const policies: RateLimitPolicy[] = [{ limit: budgets.authPerIpPerMin, windowSec: 60, bucketKey: `rl:auth:${req.ip}` }];
    const email = (req.body as { email?: unknown } | undefined)?.email;
    if (req.path === '/auth/login' && typeof email === 'string' && email.trim()) {
      policies.push({ limit: budgets.loginPerAccountPer15Min, windowSec: 900, bucketKey: `rl:login:${email.trim().toLowerCase()}` });
    }
    return policies;
  }
  if (req.path === '/onboarding/start') {
    return [{ limit: budgets.onboardingStartPerHour, windowSec: 3600, bucketKey: `rl:onboarding-start:${req.ip}` }];
  }
  if (req.path.startsWith('/onboarding/ai/')) {
    // The global daily cap is NOT charged here: this guard runs before the
    // draft token is checked, so junk requests would burn the shared budget.
    // OnboardingAiService charges it per real LLM call instead.
    return [{ limit: budgets.onboardingAiPerIpPerHour, windowSec: 3600, bucketKey: `rl:onboarding-ai:${req.ip}` }];
  }
  return [{ limit: budgets.orgPerMin, windowSec: 60, bucketKey: `rl:org:${req.orgId ?? req.ip}` }];
}
