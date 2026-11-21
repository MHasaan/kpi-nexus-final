/**
 * Manual QA (2026-11-19, F-057): six of the audit log's action filters were values the log never records, and
 * choosing one gave "Internal server error"; the actions it does record could not be chosen. The filter now
 * offers exactly what is recorded, in words, and the API answers an unknown value with a 400.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('audit log: the action filter offers what is recorded, and a chosen action loads', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `af-${stamp}`,
      slug: `af-${stamp}`,
      adminFullName: 'Aud Admin',
      adminEmail: `admin-${stamp}@af.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  // An action the log never records is refused, not a server error.
  expect((await api.get('/audit?action=INVITE')).status()).toBe(400);
  expect((await api.get('/audit?action=APPROVE')).status()).toBe(200);

  await page.goto('/settings/audit');
  await expect(page.getByTestId('filter-action').locator('option')).toHaveText([
    '(all actions)',
    'Created',
    'Updated',
    'Deleted',
    'Signed in',
    'Signed out',
    'Imported',
    'Exported',
    'Started impersonating',
    'Stopped impersonating',
    'Approved',
    'Rejected',
  ]);
  await page.getByTestId('filter-action').selectOption({ label: 'Approved' });
  await page.getByTestId('audit-filters').getByRole('button', { name: /apply/i }).click();
  await expect(page.getByText('Internal server error')).toHaveCount(0);
  await expect(page.getByTestId('audit-filters')).toBeVisible();
});
