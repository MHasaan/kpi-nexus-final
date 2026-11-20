/**
 * Flow walk: the menu said "Org units" and the page it opens was titled
 * "Teams"; the menu said "People" and that page was titled "Members". Each
 * pair now carries one name — "Teams" and "People" — in the menu, the top bar
 * and the page's own heading. An organisation that renames "Team" or "Member"
 * in its settings still gets its own word in all three.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('the menu, the top bar and the page agree on what Teams and People are called', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `mpn-${stamp}`,
      slug: `mpn-${stamp}`,
      adminFullName: 'Maha Admin',
      adminEmail: `admin-${stamp}@mpn.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const trail = page.getByRole('banner').getByTestId('top-bar-trail');

  await page.goto('/org-units');
  await expect(page.getByTestId('org-units-heading')).toHaveText('Teams');
  await expect(nav.locator('a[href="/org-units"]')).toHaveText('Teams');
  await expect(trail).toHaveText(/^Organize\s*\/\s*Teams$/);

  await page.goto('/users');
  await expect(page.getByTestId('users-heading')).toHaveText('People');
  await expect(nav.locator('a[href="/users"]')).toHaveText('People');
  await expect(trail).toHaveText(/^Organize\s*\/\s*People$/);

  // An organisation's own words still win, everywhere.
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  expect((await api.patch('/organizations/me', { data: { groupLabel: 'Department', memberLabel: 'Employee' } })).ok()).toBe(true);
  await page.goto('/users');
  await expect(page.getByTestId('users-heading')).toHaveText('Employees');
  await expect(nav.locator('a[href="/users"]')).toHaveText('Employees');
  await expect(nav.locator('a[href="/org-units"]')).toHaveText('Departments');
});
