import type { OnboardingAiMode } from '@kpi-nexus/db';

/**
 * Per-mode hourly rate limits for the onboarding AI co-pilot (per session).
 * Generator is expensive (full org) so it's the tightest; explain is cheap.
 * Pure config — the service enforces it via the Redis sliding-window limiter.
 */
export const ONBOARDING_AI_LIMITS: Record<OnboardingAiMode, { limit: number; windowSec: number }> = {
  generator: { limit: 5, windowSec: 3600 },
  assistant: { limit: 30, windowSec: 3600 },
  suggest: { limit: 60, windowSec: 3600 },
  explain: { limit: 100, windowSec: 3600 },
};

export function limitFor(mode: OnboardingAiMode): { limit: number; windowSec: number } {
  return ONBOARDING_AI_LIMITS[mode];
}
