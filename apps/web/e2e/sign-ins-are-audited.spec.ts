/**
 * Manual QA (2026-11-19, F-058): the audit log's LOGIN filter showed nothing after a day of sign-ins, and
 * sign-outs were never written. Both are now rows an auditor can filter to.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('signing in and out leaves LOGIN and LOGOUT rows in the audit log', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `admin-${stamp}@sia.test.local`;
  const password = 'correct-horse-battery-staple';
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, { orgName: `sia-${stamp}`, slug: `sia-${stamp}`, adminFullName: 'Sia Admin', adminEmail: email, adminPassword: password });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const open = await request.newContext({ baseURL: API_URL });
  const device = (await (await open.post('/auth/login', { data: { email, password } })).json()) as { accessToken: string; refreshToken: string };
  expect(
    (await open.post('/auth/logout', { headers: { authorization: `Bearer ${device.accessToken}` }, data: { refreshToken: device.refreshToken } })).status(),
  ).toBeLessThan(300);

  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const rows = async (action: string) => (await (await api.get(`/audit?action=${action}`)).json()) as Array<{ action: string; userEmail: string | null; entityType: string | null }>;
  // Registering made a session and signing in made another: at least two LOGIN rows, all for this person.
  const logins = await rows('LOGIN');
  expect(logins.length).toBeGreaterThanOrEqual(2);
  for (const row of logins) expect(row).toMatchObject({ action: 'LOGIN', entityType: 'User', userEmail: email });
  const logouts = await rows('LOGOUT');
  expect(logouts.length).toBeGreaterThanOrEqual(1);
  expect(logouts[0]).toMatchObject({ action: 'LOGOUT', userEmail: email });

  await page.goto('/settings/audit');
  await page.getByTestId('filter-action').selectOption({ label: 'Signed in' });
  await page.getByTestId('audit-filters').getByRole('button', { name: /apply/i }).click();
  await expect(page.locator('[data-testid^="audit-row-"]').first().getByTestId('audit-action-badge')).toHaveText('LOGIN');
});
