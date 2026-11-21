import type { CircuitBreakerMode } from '@kpi-nexus/contracts';

/**
 * Pure budget gating. Kept free of Redis/Nest so the cap arithmetic and window
 * rollover rules can be unit-tested in isolation. A cap of 0 means unlimited.
 */

export interface BudgetState {
  dailySpend: number;
  monthlySpend: number;
  dailyCapUsd: number;
  monthlyCapUsd: number;
  /** Calls made today, whatever they cost. */
  dailyCalls: number;
  /** Calls allowed per day; 0 means unlimited. */
  dailyCallCap: number;
  circuitBreaker: CircuitBreakerMode;
}

export type BudgetBlockReason = 'DAILY_CAP' | 'MONTHLY_CAP' | 'DAILY_CALLS';

export interface BudgetDecision {
  allowed: boolean;
  reason?: BudgetBlockReason;
  /** Echoed so the router knows whether to fail closed or try the fallback. */
  mode: CircuitBreakerMode;
}

/**
 * Decide whether a call estimated at `estimatedCost` USD fits within the caps.
 * The daily spend cap is checked first, then the monthly one, then the day's call count. A call landing exactly on a cap is allowed;
 * one that would push spend strictly above is blocked.
 */
export function evaluateBudget(state: BudgetState, estimatedCost: number): BudgetDecision {
  const mode = state.circuitBreaker;
  if (state.dailyCapUsd > 0 && state.dailySpend + estimatedCost > state.dailyCapUsd) {
    return { allowed: false, reason: 'DAILY_CAP', mode };
  }
  if (state.monthlyCapUsd > 0 && state.monthlySpend + estimatedCost > state.monthlyCapUsd) {
    return { allowed: false, reason: 'MONTHLY_CAP', mode };
  }
  // Calls are counted as well as dollars: the free tier records no spend, so the dollar caps never
  // triggered and a busy day could use the provider's whole free quota (F-045).
  if (state.dailyCallCap > 0 && state.dailyCalls >= state.dailyCallCap) {
    return { allowed: false, reason: 'DAILY_CALLS', mode };
  }
  return { allowed: true, mode };
}

/** True when `nowMs` falls on a different UTC calendar day than the period start. */
export function shouldRollDaily(periodStartMs: number, nowMs: number): boolean {
  const a = new Date(periodStartMs);
  const b = new Date(nowMs);
  return (
    a.getUTCFullYear() !== b.getUTCFullYear() ||
    a.getUTCMonth() !== b.getUTCMonth() ||
    a.getUTCDate() !== b.getUTCDate()
  );
}

/** True when `nowMs` falls in a different UTC year-month than the period start. */
export function shouldRollMonthly(periodStartMs: number, nowMs: number): boolean {
  const a = new Date(periodStartMs);
  const b = new Date(nowMs);
  return a.getUTCFullYear() !== b.getUTCFullYear() || a.getUTCMonth() !== b.getUTCMonth();
}
