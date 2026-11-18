import type { StaticThresholdConfig } from '../../alert-rules/dto/alert-rule.dto.js';
import { type EvaluationResult, notTriggered } from './types.js';

const OPERATOR_WORDS: Record<StaticThresholdConfig['operator'], string> = {
  '>': 'above',
  '<': 'below',
  '>=': 'at or above',
  '<=': 'at or below',
  '==': 'exactly',
};

/** A number as a person writes it: thousands grouped, no trailing noise. */
const plain = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 6 });

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
  // Said in words, with the numbers grouped: this line is what people read in the inbox, the bell,
  // an email and a chat message. It used to be "Value 38000 < threshold 45000".
  return {
    triggered: true,
    message: `Value ${plain(value)} is ${OPERATOR_WORDS[operator]} ${plain(threshold)}`,
  };
}
