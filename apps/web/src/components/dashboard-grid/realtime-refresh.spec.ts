import { describe, expect, test } from 'vitest';

import { REFRESH_DEBOUNCE_MS, isDataEvent } from './realtime-refresh';

describe('isDataEvent', () => {
  test('a new value and a corrected value make the numbers on screen stale', () => {
    expect(isDataEvent('data_point_added')).toBe(true);
    expect(isDataEvent('data_point_updated')).toBe(true);
  });

  test('a ping, an alert, or an untyped message does not', () => {
    for (const type of ['ping', 'alert_triggered', 'alert_digest', 'message', '']) expect(isDataEvent(type), type).toBe(false);
  });

  test('a burst is gathered for under a second, so "live" still feels live', () => {
    expect(REFRESH_DEBOUNCE_MS).toBeLessThan(1000);
  });
});
