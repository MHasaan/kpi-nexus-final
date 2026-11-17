import { describe, expect, test } from 'vitest';

import { firstPageFor } from './first-page';

describe('firstPageFor', () => {
  test('normally the dashboard', () => {
    expect(firstPageFor(['KPI_VIEW'])).toEqual({ href: '/dashboard', label: 'Dashboard' });
  });

  test('someone the dashboard is closed to is sent to the next page they may open', () => {
    expect(firstPageFor(['KPI_VIEW'], { allow: null, deny: ['/dashboard'] })).toEqual({ href: '/my-kpis', label: 'My KPIs' });
    expect(firstPageFor(['KPI_VIEW'], { allow: ['/kpis'], deny: [] })).toEqual({ href: '/kpis', label: 'KPIs' });
  });

  test('a page they lack the permission for is not offered, even when it is on their list', () => {
    expect(firstPageFor([], { allow: ['/kpis', '/tasks'], deny: [] })).toEqual({ href: '/tasks', label: 'Tasks' });
  });

  test('with every page closed, their profile — which is on no list', () => {
    expect(firstPageFor([], { allow: [], deny: [] })).toEqual({ href: '/profile', label: 'your profile' });
  });
});
