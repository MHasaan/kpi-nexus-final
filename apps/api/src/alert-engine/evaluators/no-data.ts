import type { NoDataConfig } from '../../alert-rules/dto/alert-rule.dto.js';
import { notTriggered, type EvaluationResult } from './types.js';

/**
 * NO_DATA: triggers when the most recent data point is older than
 * `maxStaleMinutes` (or when there is no data at all). Runs on a cron scan,
 * not a data-point trigger.
 */
export function evaluateNoData(
  config: NoDataConfig,
  lastRecordedAt: Date | null,
  now: Date,
): EvaluationResult {
  if (lastRecordedAt === null) {
    return {
      triggered: true,
      message: `No data ever recorded (stale threshold ${config.maxStaleMinutes}m)`,
    };
  }
  const ageMinutes = (now.getTime() - lastRecordedAt.getTime()) / 60_000;
  if (ageMinutes > config.maxStaleMinutes) {
    return {
      triggered: true,
      message: `No data for ${Math.floor(ageMinutes)}m (threshold ${config.maxStaleMinutes}m)`,
    };
  }
  return notTriggered;
}
