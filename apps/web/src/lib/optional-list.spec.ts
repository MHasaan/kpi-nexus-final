import { describe, expect, test, vi } from 'vitest';

import { ApiError } from './api-client';
import { optionalList } from './optional-list';

describe('optionalList — a list a page can do without, whose failure is still said', () => {
  test('a list that loads is passed through and nothing is reported', async () => {
    const failed = vi.fn();
    expect(await optionalList(Promise.resolve([1, 2]), 'KPIs', failed)).toEqual([1, 2]);
    expect(failed).not.toHaveBeenCalled();
  });

  test('a list that fails comes back empty, and the page is told which list and why', async () => {
    const failed = vi.fn();
    const out = await optionalList(Promise.reject(new ApiError(503, 'Service unavailable')), 'KPIs', failed);
    expect(out).toEqual([]);
    expect(failed).toHaveBeenCalledWith('KPIs could not be loaded: Service unavailable');
  });

  test('a failure with no message of its own still names the list', async () => {
    const failed = vi.fn();
    await optionalList(Promise.reject(new Error('boom')), 'Objectives', failed);
    expect(failed).toHaveBeenCalledWith('Objectives could not be loaded.');
  });
});
