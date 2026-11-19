import { describe, expect, test } from 'vitest';

import { holdersHealth, holdersText } from './holders.js';

// UI-018 (owner's decision, 2026-11-19): in organisation-level views a per-person or per-unit KPI
// reads as a count of holders on track — not as the value of whoever recorded last.
describe('holdersText — a per-person or per-unit KPI in one line', () => {
  test('says how many of the people are on track', () => {
    expect(holdersText({ total: 2, withValue: 2, onTrack: 1 }, 'PER_USER')).toBe('1 of 2 people on track');
    expect(holdersText({ total: 12, withValue: 9, onTrack: 9 }, 'PER_USER')).toBe('9 of 12 people on track');
  });

  test('units are counted as units', () => {
    expect(holdersText({ total: 3, withValue: 3, onTrack: 3 }, 'PER_UNIT')).toBe('3 of 3 units on track');
  });

  test('with nothing recorded by anyone it says so', () => {
    expect(holdersText({ total: 4, withValue: 0, onTrack: 0 }, 'PER_USER')).toBe('No values yet from 4 people');
    expect(holdersText({ total: 2, withValue: 0, onTrack: 0 }, 'PER_UNIT')).toBe('No values yet from 2 units');
  });
});

describe('holdersHealth — one status for the KPI, from its holders', () => {
  test('nobody has a value → no data', () => {
    expect(holdersHealth({ total: 3, withValue: 0, onTrack: 0 })).toBe('NO_DATA');
  });
  test('everyone on track → on track; nobody → off track; some → at risk', () => {
    expect(holdersHealth({ total: 3, withValue: 3, onTrack: 3 })).toBe('ON_TRACK');
    expect(holdersHealth({ total: 3, withValue: 3, onTrack: 0 })).toBe('OFF_TRACK');
    expect(holdersHealth({ total: 3, withValue: 3, onTrack: 2 })).toBe('AT_RISK');
  });
  test('someone who has not recorded yet keeps the KPI from being fully on track', () => {
    expect(holdersHealth({ total: 3, withValue: 2, onTrack: 2 })).toBe('AT_RISK');
  });
});
