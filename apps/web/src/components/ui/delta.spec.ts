import { describe, expect, test } from 'vitest';

import { formatDeltaMagnitude } from './delta';

describe('formatDeltaMagnitude (FE-016)', () => {
  test('floating-point noise never reaches the screen', () => {
    expect(formatDeltaMagnitude(10.000000000000016, true, 1)).toBe('10.0');
    expect(formatDeltaMagnitude(10.000000000000016, true)).toBe('10');
    expect(formatDeltaMagnitude(3.14159, false)).toBe('3.14');
  });

  test('defaults: up to 1 decimal for %, up to 2 for values; whole numbers stay whole', () => {
    expect(formatDeltaMagnitude(7, true)).toBe('7');
    expect(formatDeltaMagnitude(12.345, true)).toBe('12.3');
    expect(formatDeltaMagnitude(1234.5678, false)).toBe('1,234.57');
  });
});
