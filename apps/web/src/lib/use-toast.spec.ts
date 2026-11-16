import { describe, expect, test } from 'vitest';

import { MAX_TOASTS, toastDurationMs, toastReducer } from './use-toast';

const toast = (id: string) => ({ id, tone: 'info' as const, title: `Toast ${id}` });

describe('toastReducer', () => {
  test('add appends, newest last', () => {
    const state = toastReducer([toast('1')], { type: 'add', toast: toast('2') });
    expect(state.map((t) => t.id)).toEqual(['1', '2']);
  });

  test('never more than MAX_TOASTS on screen: the oldest gives way', () => {
    let state = [] as ReturnType<typeof toastReducer>;
    for (let i = 1; i <= MAX_TOASTS + 2; i += 1) state = toastReducer(state, { type: 'add', toast: toast(String(i)) });
    expect(state).toHaveLength(MAX_TOASTS);
    expect(state[0]?.id).toBe('3');
    expect(state.at(-1)?.id).toBe(String(MAX_TOASTS + 2));
  });

  test('dismiss removes only that toast', () => {
    const state = toastReducer([toast('1'), toast('2'), toast('3')], { type: 'dismiss', id: '2' });
    expect(state.map((t) => t.id)).toEqual(['1', '3']);
  });

  test('dismissing a toast that already went is a no-op (same array back)', () => {
    const before = [toast('1')];
    expect(toastReducer(before, { type: 'dismiss', id: 'gone' })).toBe(before);
  });
});

describe('toastDurationMs', () => {
  test('errors stay longer than confirmations, so they can be read', () => {
    expect(toastDurationMs('error')).toBeGreaterThan(toastDurationMs('success'));
    expect(toastDurationMs('info')).toBe(toastDurationMs('success'));
  });
});
