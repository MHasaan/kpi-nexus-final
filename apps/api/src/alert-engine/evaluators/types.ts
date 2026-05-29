// Shared evaluator contract. Evaluators are pure functions — no DB, no clock
// reads — so they are trivially unit-testable. The processor gathers the
// inputs (current value, recent history, staleness, clock) and dispatches.

export interface EvaluationResult {
  triggered: boolean;
  /** Human-readable reason, set only when triggered. */
  message?: string;
}

export const notTriggered: EvaluationResult = { triggered: false };
