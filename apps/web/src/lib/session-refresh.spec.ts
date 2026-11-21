import { beforeEach, describe, expect, test, vi } from 'vitest';

const meRequest = vi.fn();
vi.mock('./api-client', () => ({ meRequest: () => meRequest() }));

import { REFRESH_WINDOW_MS, freshSession, resetFreshSession, samePermissions, sessionChanged } from './session-refresh';

beforeEach(() => {
  meRequest.mockReset();
  resetFreshSession();
});

describe('freshSession', () => {
  test('asks the server once for everything on a page that wants to know', async () => {
    meRequest.mockResolvedValue({ user: { permissions: ['KPI_VIEW'] }, accessProfile: { isAdmin: false } });
    const [a, b] = await Promise.all([freshSession(1_000), freshSession(1_200)]);
    expect(meRequest).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ permissions: ['KPI_VIEW'], accessProfile: { isAdmin: false } });
    expect(b).toBe(a);
  });

  test('asks again once the short while has passed', async () => {
    meRequest.mockResolvedValue({ user: { permissions: ['KPI_VIEW'] } });
    await freshSession(1_000);
    meRequest.mockResolvedValue({ user: { permissions: ['KPI_VIEW', 'ROLES_MANAGE'] } });
    const later = await freshSession(1_000 + REFRESH_WINDOW_MS + 1);
    expect(meRequest).toHaveBeenCalledTimes(2);
    expect(later).toEqual({ permissions: ['KPI_VIEW', 'ROLES_MANAGE'], accessProfile: null });
  });

  test('is null when the server could not be asked, so the kept copy stands', async () => {
    meRequest.mockRejectedValue(new Error('offline'));
    expect(await freshSession(1_000)).toBeNull();
  });
});

describe('samePermissions', () => {
  test('ignores order, notices a key gained or lost', () => {
    expect(samePermissions(['A', 'B'], ['B', 'A'])).toBe(true);
    expect(samePermissions(['A'], ['A', 'B'])).toBe(false);
    expect(samePermissions(['A', 'B'], ['A', 'C'])).toBe(false);
    expect(samePermissions([], [])).toBe(true);
  });
});

describe('a new session', () => {
  test('forgets the answer kept for the session before, so the next ask goes to the server', async () => {
    meRequest.mockResolvedValue({ user: { permissions: ['AUDIT_VIEW'] } });
    await freshSession(1_000);
    meRequest.mockResolvedValue({ user: { permissions: ['KPI_VIEW'] } });

    sessionChanged();

    const next = await freshSession(1_500);
    expect(meRequest).toHaveBeenCalledTimes(2);
    expect(next?.permissions).toEqual(['KPI_VIEW']);
  });
});
