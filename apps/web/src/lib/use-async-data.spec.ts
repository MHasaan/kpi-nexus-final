import { describe, expect, test } from 'vitest';

import { ApiError } from './api-client';
import { IDLE, asyncDataReducer, loadErrorMessage } from './use-async-data';

describe('asyncDataReducer (X-02)', () => {
  test('starts loading with nothing', () => {
    expect(asyncDataReducer(IDLE, { type: 'start' })).toEqual({ data: null, error: null, loading: true });
  });

  test('ok stores the data and stops loading', () => {
    expect(asyncDataReducer({ data: null, error: null, loading: true }, { type: 'ok', data: [1, 2] })).toEqual({
      data: [1, 2],
      error: null,
      loading: false,
    });
  });

  test('a failed first load is an error, not an empty result', () => {
    const state = asyncDataReducer({ data: null, error: null, loading: true }, { type: 'fail', error: 'Forbidden' });
    expect(state).toEqual({ data: null, error: 'Forbidden', loading: false });
  });

  test('a failed reload keeps what was on screen and says why it is stale', () => {
    const state = asyncDataReducer({ data: [1], error: null, loading: true }, { type: 'fail', error: 'Network down' });
    expect(state).toEqual({ data: [1], error: 'Network down', loading: false });
  });

  test('reloading keeps the old data visible and clears the old error', () => {
    const state = asyncDataReducer({ data: [1], error: 'Network down', loading: false }, { type: 'start' });
    expect(state).toEqual({ data: [1], error: null, loading: true });
  });
});

describe('loadErrorMessage', () => {
  test('prefers the API message', () => {
    expect(loadErrorMessage(new ApiError(403, 'You need KPI_EDIT to see targets', 'FORBIDDEN'))).toBe(
      'You need KPI_EDIT to see targets',
    );
  });

  test('falls back to a plain sentence', () => {
    expect(loadErrorMessage(new TypeError('Failed to fetch'))).toBe('Failed to fetch');
    expect(loadErrorMessage(undefined)).toBe('Could not load this. Please try again.');
  });
});
