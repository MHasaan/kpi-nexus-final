import { describe, expect, test } from 'vitest';

import { nothingToAddNotice } from './insights-notice';

describe('nothingToAddNotice', () => {
  test('names each reason with its count, in words', () => {
    expect(nothingToAddNotice({ insights: [], skipped: { tooFewValues: 1, littleChange: 2 }, thresholdChangePct: 10 })).toBe(
      'Nothing to add: 1 KPI has fewer than two values and 2 changed less than 10% since their first value.',
    );
    expect(nothingToAddNotice({ insights: [], skipped: { tooFewValues: 3, littleChange: 0 }, thresholdChangePct: 10 })).toBe('Nothing to add: 3 KPIs have fewer than two values.');
    expect(nothingToAddNotice({ insights: [], skipped: { tooFewValues: 0, littleChange: 1 }, thresholdChangePct: 25 })).toBe(
      'Nothing to add: 1 changed less than 25% since its first value.',
    );
    expect(nothingToAddNotice({ insights: [], skipped: { tooFewValues: 0, littleChange: 0 }, thresholdChangePct: 10 })).toBe('Nothing to add: there are no KPIs to look at yet.');
  });

  test('says nothing when something was made', () => {
    expect(nothingToAddNotice({ insights: [{} as never], skipped: { tooFewValues: 1, littleChange: 0 }, thresholdChangePct: 10 })).toBeNull();
  });
});
