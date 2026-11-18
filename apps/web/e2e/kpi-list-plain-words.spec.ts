/**
 * Flow walk, 2026-11-18. The KPI list spoke in the database's codes: its
 * heading explained "ORG_WIDE", "PER_UNIT" and "PER_USER" while the rows said
 * "Organisation-wide"; the type column read "NUMBER"; a target of fifty
 * thousand read "50000".
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('KPI list: scope, type and target are written in words and the organisation\'s number format', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `klw-${stamp}`,
      slug: `klw-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@klw.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const name = `Revenue ${stamp}`;
  expect((await api.post('/kpis', { data: { name, scope: 'ORG_WIDE', type: 'CURRENCY', unit: 'USD', targetValue: 50000 } })).status()).toBe(201);

  await page.goto('/kpis');
  const row = page.getByTestId(`kpi-row-${name}`);
  await expect(row).toBeVisible();
  await expect(row.getByTestId('kpi-type')).toHaveText('Currency');
  await expect(row.getByTestId('kpi-target')).toHaveText('50,000 USD');

  // The heading explains the scopes in the words the rows use.
  const heading = page.locator('header, main').filter({ has: page.getByTestId('kpis-heading') }).first();
  await expect(heading).toContainText('Organisation-wide');
  for (const code of ['ORG_WIDE', 'PER_UNIT', 'PER_USER']) await expect(page.locator('main')).not.toContainText(code);

  // And so does the filter.
  await expect(page.getByTestId('kpis-scope-filter').locator('option')).toContainText(['All scopes', 'Organisation-wide']);
});
