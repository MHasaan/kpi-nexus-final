import type { StaticThresholdConfig } from '../../alert-rules/dto/alert-rule.dto.js';
import { notTriggered, type EvaluationResult } from './types.js';

/**
 * STATIC_THRESHOLD: compare the incoming value against a fixed threshold using
 * the configured operator. Triggers when the comparison is true.
 */
export function evaluateStaticThreshold(
  config: StaticThresholdConfig,
  value: number,
): EvaluationResult {
  const { operator, value: threshold } = config;
  let breach: boolean;
  switch (operator) {
    case '>':
      breach = value > threshold;
      break;
    case '<':
      breach = value < threshold;
      break;
    case '>=':
      breach = value >= threshold;
      break;
    case '<=':
      breach = value <= threshold;
      break;
    case '==':
      breach = value === threshold;
      break;
    default:
      return notTriggered;
  }
  if (!breach) return notTriggered;
  return {
    triggered: true,
    message: `Value ${value} ${operator} threshold ${threshold}`,
  };
}
