import { describe, expect, test } from 'vitest';

import { starterQuestions } from './ask-starters';

describe('starterQuestions', () => {
  test('names nothing when the organisation has no KPIs in sight', () => {
    expect(starterQuestions([])).toEqual(['Which KPIs are off track this quarter?', 'What changed most this month?', 'Where should I focus next?']);
  });

  test('names the one KPI there is', () => {
    expect(starterQuestions(['Orders delivered'])).toEqual(['Which KPIs are off track this quarter?', 'How is Orders delivered doing?', 'Where should I focus next?']);
  });

  test('names the first two, by name, whatever order they arrive in', () => {
    expect(starterQuestions(['Returns', 'Orders delivered', 'Monthly revenue'])).toEqual([
      'Which KPIs are off track this quarter?',
      'How is Monthly revenue doing?',
      'What is the trend in Orders delivered over the last 3 months?',
    ]);
  });

  test('ignores blanks and repeats', () => {
    expect(starterQuestions(['  ', 'Returns', 'Returns'])).toEqual(['Which KPIs are off track this quarter?', 'How is Returns doing?', 'Where should I focus next?']);
  });
});
