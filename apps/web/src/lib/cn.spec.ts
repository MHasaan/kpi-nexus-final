import { describe, expect, test } from 'vitest';
import { cn } from '@kpi-nexus/ui';

describe('cn helper (re-exported from @kpi-nexus/ui)', () => {
  test('resolves Tailwind class conflicts so the latest utility wins', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  test('drops falsy values', () => {
    expect(cn('foo', false, undefined, null, '')).toBe('foo');
  });

  test('supports conditional class objects', () => {
    expect(cn('base', { hidden: true, block: false })).toBe('base hidden');
  });
});
