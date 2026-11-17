import { describe, expect, test } from 'vitest';

import { timeAgo } from './time-ago';

const NOW = new Date('2026-11-17T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('timeAgo', () => {
  test('reads the way a person would say it', () => {
    expect(timeAgo(ago(5_000), NOW)).toBe('just now');
    expect(timeAgo(ago(MIN), NOW)).toBe('1 minute ago');
    expect(timeAgo(ago(59 * MIN), NOW)).toBe('59 minutes ago');
    expect(timeAgo(ago(HOUR), NOW)).toBe('1 hour ago');
    expect(timeAgo(ago(23 * HOUR), NOW)).toBe('23 hours ago');
    expect(timeAgo(ago(DAY), NOW)).toBe('yesterday');
    expect(timeAgo(ago(6 * DAY), NOW)).toBe('6 days ago');
    expect(timeAgo(ago(30 * DAY), NOW)).toBe(new Date(NOW.getTime() - 30 * DAY).toLocaleDateString());
  });

  test('a clock a little ahead of the server still says "just now"; nonsense says nothing', () => {
    expect(timeAgo(ago(-3_000), NOW)).toBe('just now');
    expect(timeAgo('not a date', NOW)).toBe('');
  });
});
