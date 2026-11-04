import { describe, expect, test } from 'vitest';

import { loginRedirectPath, safeNextPath } from './auth-redirect';

// FE-009: signed-out users (expired session, deep link) landed on
// "/unauthorized" with no way to sign in, and weren't returned afterwards.
describe('loginRedirectPath', () => {
  test('sends the current page along as ?next=', () => {
    expect(loginRedirectPath('/kpis/abc', '?tab=data')).toBe('/login?next=%2Fkpis%2Fabc%3Ftab%3Ddata');
    expect(loginRedirectPath('/dashboards', '')).toBe('/login?next=%2Fdashboards');
  });

  test('no next for auth pages themselves (no /login?next=/login loops)', () => {
    expect(loginRedirectPath('/login', '')).toBe('/login');
    expect(loginRedirectPath('/unauthorized', '')).toBe('/login');
  });
});

describe('safeNextPath — never an open redirect', () => {
  test.each([
    ['/kpis/abc?tab=data', '/kpis/abc?tab=data'],
    ['/dashboards', '/dashboards'],
  ])('accepts in-app path %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  test.each([
    null,
    '',
    'https://evil.example/phish',
    '//evil.example/phish',
    '/\\evil.example',
    'javascript:alert(1)',
    'kpis',
    '/login',
    '/login?next=/x',
  ])('rejects %j', (input) => {
    expect(safeNextPath(input)).toBeNull();
  });
});
