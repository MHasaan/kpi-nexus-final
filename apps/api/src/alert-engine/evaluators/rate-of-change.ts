import type { RateOfChangeConfig } from '../../alert-rules/dto/alert-rule.dto.js';
import { type EvaluationResult, notTriggered } from './types.js';

/**
 * RATE_OF_CHANGE: "moved too far, too fast". The new value is compared with
 * the value the KPI had `windowMinutes` ago — the latest one recorded at or
 * before that moment. `pctChange` carries its direction: `20` triggers on a
 * rise of 20% or more, `-20` on a fall of 20% or more.
 *
 * @param baseline that earlier value, or null when nothing was recorded that long ago.
 *
 * Never triggers without a baseline, from a baseline of zero (a percentage of
 * nothing is undefined), or for a `pctChange` of zero (no direction).
 */
export function evaluateRateOfChange(config: RateOfChangeConfig, value: number, baseline: number | null): EvaluationResult {
  if (baseline === null || !Number.isFinite(baseline) || baseline === 0) return notTriggered;
  if (!Number.isFinite(value) || config.pctChange === 0) return notTriggered;
  const change = ((value - baseline) / Math.abs(baseline)) * 100;
  const reached = config.pctChange > 0 ? change >= config.pctChange : change <= config.pctChange;
  if (!reached) return notTriggered;
  const rounded = Math.round(Math.abs(change) * 10) / 10;
  return {
    triggered: true,
    message: `Value ${change > 0 ? 'rose' : 'fell'} ${rounded}% (from ${baseline} to ${value}) within ${describeWindow(config.windowMinutes)}`,
  };
}

function describeWindow(minutes: number): string {
  if (minutes % 1440 === 0) return plural(minutes / 1440, 'day');
  if (minutes % 60 === 0) return plural(minutes / 60, 'hour');
  return plural(minutes, 'minute');
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}
