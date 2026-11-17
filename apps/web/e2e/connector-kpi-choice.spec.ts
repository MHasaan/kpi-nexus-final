/**
 * X-06: the new-connector form asked for a KPI id to be typed. It offers the
 * organisation's KPIs by name now.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('a connector is pointed at a KPI chosen by name', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `cnk-${stamp}`,
      slug: `cnk-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@cnk.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Stars ${stamp}`, scope: 'ORG_WIDE', unit: 'count' } })).json()) as { id: string };

  await page.goto('/connectors');
  await expect(page.getByTestId('connector-kpiid')).toHaveCount(0);
  const choice = page.getByTestId('connector-kpi');
  await expect(choice.locator('option', { hasText: `Stars ${stamp}` })).toHaveCount(1);
  await page.getByTestId('connector-name').fill(`Repo stars ${stamp}`);
  await page.getByTestId('connector-url').fill('https://api.github.com/repos/vercel/next.js');
  await page.getByTestId('connector-valuepath').fill('stargazers_count');
  await choice.selectOption({ label: `Stars ${stamp}` });
  await page.getByTestId('connector-create').click();
  await expect(page.getByText(`Repo stars ${stamp}`)).toBeVisible();

  const saved = (await (await api.get('/connectors')).json()) as Array<{ name: string; config: { kpiId?: string } }>;
  expect(saved.find((c) => c.name === `Repo stars ${stamp}`)?.config.kpiId).toBe(kpi.id);
});
