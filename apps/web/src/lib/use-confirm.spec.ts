import { describe, expect, test } from 'vitest';

import { ApiError } from './api-client';
import { CLOSED, confirmErrorMessage, confirmReducer } from './use-confirm';

const request = { title: 'Delete role?', confirmLabel: 'Delete role', tone: 'danger' as const };

describe('confirmReducer', () => {
  test('open shows the request, idle and with no error', () => {
    expect(confirmReducer(CLOSED, { type: 'open', request })).toEqual({ request, busy: false, error: null });
  });

  test('start marks the action as running and clears an earlier failure', () => {
    const failed = { request, busy: false, error: 'Nope' };
    expect(confirmReducer(failed, { type: 'start' })).toEqual({ request, busy: true, error: null });
  });

  test('fail keeps the dialog open with the reason, ready for another try', () => {
    const running = { request, busy: true, error: null };
    expect(confirmReducer(running, { type: 'fail', error: 'Three users still hold this role.' })).toEqual({
      request,
      busy: false,
      error: 'Three users still hold this role.',
    });
  });

  test('close resets everything', () => {
    expect(confirmReducer({ request, busy: true, error: 'x' }, { type: 'close' })).toEqual(CLOSED);
  });

  test('opening a second request replaces the first and starts clean', () => {
    const other = { title: 'Remove member?' };
    const state = confirmReducer({ request, busy: false, error: 'old' }, { type: 'open', request: other });
    expect(state).toEqual({ request: other, busy: false, error: null });
  });
});

describe('confirmErrorMessage', () => {
  test('uses the API message when there is one', () => {
    expect(confirmErrorMessage(new ApiError(409, 'Three users still hold this role.', 'CONFLICT'))).toBe(
      'Three users still hold this role.',
    );
  });

  test('uses a plain Error message', () => {
    expect(confirmErrorMessage(new Error('Network down'))).toBe('Network down');
  });

  test('falls back to a sentence a user can act on', () => {
    expect(confirmErrorMessage('boom')).toBe('Something went wrong. Please try again.');
    expect(confirmErrorMessage(new Error(''))).toBe('Something went wrong. Please try again.');
  });
});
