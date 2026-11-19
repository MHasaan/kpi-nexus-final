/**
 * Flow walk (reports): the list said "Every day at 8:00" for four known
 * schedules, the report's own page printed "0 8 * * *", and nothing said whose
 * clock that 8:00 is on. One helper now words a schedule everywhere.
 */
import { describe, expect, test } from 'vitest';

import { scheduleInWords } from './report-schedule';

describe('scheduleInWords', () => {
  test('daily, weekly and monthly schedules read as words', () => {
    expect(scheduleInWords('0 8 * * *')).toBe('Every day at 08:00');
    expect(scheduleInWords('30 7 * * *')).toBe('Every day at 07:30');
    expect(scheduleInWords('0 9 * * 1')).toBe('Every Monday at 09:00');
    expect(scheduleInWords('0 9 * * 0')).toBe('Every Sunday at 09:00');
    expect(scheduleInWords('0 9 * * 7')).toBe('Every Sunday at 09:00');
    expect(scheduleInWords('0 9 1 * *')).toBe('On the 1st of every month at 09:00');
    expect(scheduleInWords('15 18 22 * *')).toBe('On the 22nd of every month at 18:15');
  });
  test('weekday ranges and lists', () => {
    expect(scheduleInWords('0 9 * * 1-5')).toBe('Monday to Friday at 09:00');
    expect(scheduleInWords('0 9 * * 1,3,5')).toBe('Every Monday, Wednesday and Friday at 09:00');
  });
  test('anything else is called a custom schedule, with the schedule itself', () => {
    expect(scheduleInWords('*/15 * * * *')).toBe('Custom schedule (*/15 * * * *)');
    expect(scheduleInWords('0 9 1 1 *')).toBe('Custom schedule (0 9 1 1 *)');
    expect(scheduleInWords('  nonsense ')).toBe('Custom schedule (nonsense)');
  });
});
