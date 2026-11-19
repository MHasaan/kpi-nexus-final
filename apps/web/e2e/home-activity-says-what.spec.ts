/**
 * Flow walk (first use): the home page's "Recent activity" read
 * "Nadia Founder CREATE KPIDataPoint" — the stored codes, and nothing about
 * which KPI or what value. It now says what the Activity page says, and leads
 * to the same place.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('the home page says what was done in words, and leads there', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `has-${stamp}`,
      slug: `has-${stamp}`,
      adminFullName: 'Hana Admin',
      adminEmail: `admin-${stamp}@has.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Sales ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 4321, periodStart: '2026-01-01', periodEnd: '2026-01-31' } })).status()).toBe(201);

  await page.goto('/dashboard');
  const list = page.getByTestId('dashboard-activity-list');
  await expect(list).toContainText(`Hana Admin recorded 4,321 on Sales ${stamp}`);
  await expect(list).toContainText(`Hana Admin created the KPI “Sales ${stamp}”`);
  await expect(list).not.toContainText('KPIDataPoint');
  await expect(list).not.toContainText('CREATE');

  await list.getByRole('link', { name: `recorded 4,321 on Sales ${stamp}` }).click();
  await expect(page).toHaveURL(new RegExp(`/kpis/${kpi.id}$`));
});
