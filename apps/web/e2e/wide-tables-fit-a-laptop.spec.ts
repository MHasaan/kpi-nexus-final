/**
 * Manual QA (2026-11-19, F-033): at about 1140 px the Alert channels table's Disable button was cut off
 * ("Disab…"), and the People and KPI catalog tables lost their Actions column off the right edge. Each table
 * now fits the space it has: the action buttons wrap, and the People page keeps its side column for wider
 * screens only.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('the channels, people and KPI tables fit a 1140-pixel laptop screen', async ({ page }) => {
  test.setTimeout(60_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `fit-${stamp}`,
      slug: `fit-${stamp}`,
      adminFullName: 'Fiona Administrator',
      adminEmail: `admin-${stamp}@fit.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  expect((await api.post('/notification-channels', { data: { name: 'Finance leadership email', kind: 'EMAIL', config: { recipients: ['finance@fit.test.local'] } } })).status()).toBe(201);
  expect((await api.post('/kpis', { data: { name: `Monthly Recurring Revenue ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY', targetValue: 250_000 } })).status()).toBe(201);
  const roles = (await (await api.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const employee = roles.find((r) => r.name === 'Employee')!;
  for (const n of [1, 2, 3]) {
    expect((await api.post('/users', { data: { email: `person${n}-${stamp}@fit.test.local`, fullName: `Person Number ${n}`, roleId: employee.id } })).status()).toBe(201);
  }

  await page.setViewportSize({ width: 1140, height: 800 });
  const fits = async () =>
    page.evaluate(() => {
      const table = document.querySelector('table');
      const wrap = table?.parentElement;
      return table && wrap ? table.scrollWidth - wrap.clientWidth : -1;
    });

  for (const [path, row] of [
    ['/alerts/channels', 'channels-table'],
    ['/users', 'users-list-section'],
    ['/kpis', 'kpis-list'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByTestId(row)).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    expect(await fits(), `${path} table wider than its space`).toBeLessThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${path} page scrolls sideways`).toBe(0);
  }
  // The channel's buttons are all on screen.
  await page.goto('/alerts/channels');
  const disable = page.getByRole('button', { name: 'Disable' });
  await expect(disable).toBeInViewport({ ratio: 1 });
});
