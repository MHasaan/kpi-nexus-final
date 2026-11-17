import type { CompositeConfig } from '../../alert-rules/dto/alert-rule.dto.js';
import { type EvaluationResult, notTriggered } from './types.js';

/**
 * COMPOSITE: several conditions on the same KPI joined by AND (all must hold)
 * or OR (any one). Each part is evaluated by `evaluatePart` against the same
 * new value; a part that cannot be evaluated counts as not holding.
 */
export function evaluateComposite<Part>(
  config: { operator: CompositeConfig['operator']; rules: readonly Part[] },
  evaluatePart: (part: Part) => EvaluationResult,
): EvaluationResult {
  const results = config.rules.map(evaluatePart);
  const held = results.filter((r) => r.triggered);
  const triggered = config.operator === 'AND' ? held.length === results.length && results.length > 0 : held.length > 0;
  if (!triggered) return notTriggered;
  return {
    triggered: true,
    message: held.map((r) => r.message ?? 'Condition met').join(config.operator === 'AND' ? ' and ' : '; '),
  };
}
