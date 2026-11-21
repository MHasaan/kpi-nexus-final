import type { DynamicStddevConfig } from '../../alert-rules/dto/alert-rule.dto.js';
import { detectOutlierFromMean } from '../../kpis/outlier-detector.js';
import { type EvaluationResult, notTriggered } from './types.js';

/**
 * DYNAMIC_STDDEV: "unusual for this KPI". The new value is compared with the
 * mean and spread of the `windowSize` values before it; it triggers when it
 * sits `sigmas` or more standard deviations away, in either direction.
 *
 * @param history earlier values, newest first; only the first `windowSize` are used.
 *
 * Never triggers with fewer than two earlier values, or when they are all the
 * same (no spread to measure against).
 */
export function evaluateDynamicStddev(config: DynamicStddevConfig, value: number, history: readonly number[]): EvaluationResult {
  const window = history.slice(0, config.windowSize);
  // The rule's own meaning: far from the mean and spread of the last N values (the Data tab's flag follows the trend instead, F-018).
  const result = detectOutlierFromMean([...window], value, config.sigmas);
  if (!result.isOutlier) return notTriggered;
  const direction = value > result.mean ? 'above' : 'below';
  return {
    triggered: true,
    message: `Value ${value} is ${round(result.z)} standard deviations ${direction} the average of the last ${window.length} values (${round(result.mean)})`,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
