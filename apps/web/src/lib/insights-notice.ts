import type { InsightBatch } from './api-client';

/**
 * What to say when "Generate insights" made nothing (F-042: it said nothing). Null when it made something.
 * "Nothing to add: 1 KPI has fewer than two values and 2 changed less than 10% since their first value."
 */
export function nothingToAddNotice(batch: Pick<InsightBatch, 'insights' | 'skipped' | 'thresholdChangePct'>): string | null {
  if (batch.insights.length > 0) return null;
  const { tooFewValues, littleChange } = batch.skipped;
  const reasons: string[] = [];
  if (tooFewValues > 0) reasons.push(`${tooFewValues} KPI${tooFewValues === 1 ? ' has' : 's have'} fewer than two values`);
  if (littleChange > 0) reasons.push(`${littleChange} changed less than ${batch.thresholdChangePct}% since ${littleChange === 1 ? 'its' : 'their'} first value`);
  if (reasons.length === 0) return 'Nothing to add: there are no KPIs to look at yet.';
  return `Nothing to add: ${reasons.join(' and ')}.`;
}
