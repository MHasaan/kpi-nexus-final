/**
 * Flow walk (the invited person): in the KPI list an organisation-wide KPI had
 * a "Record value" button and a per-unit or per-person one had nothing — a
 * manager whose job is to enter their team's number had to know to open the
 * KPI and find its Data tab. Those rows now lead there.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('the KPI list leads to where a per-unit KPI is recorded', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `klr-${stamp}`,
      slug: `klr-${stamp}`,
      adminFullName: 'Lena Admin',
      adminEmail: `admin-${stamp}@klr.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const unit = (await (await api.post('/org-units', { data: { name: `Sales ${stamp}` } })).json()) as { id: string };
  const name = `Orders ${stamp}`;
  const kpi = (await (await api.post('/kpis', { data: { name, scope: 'PER_UNIT', orgUnitIds: [unit.id] } })).json()) as { id: string };

  await page.goto('/kpis');
  const record = page.getByTestId(`record-kpi-${name}`);
  await expect(record).toHaveText('Record value');
  await record.click();

  await expect(page).toHaveURL(new RegExp(`/kpis/${kpi.id}\\?tab=data$`));
  await expect(page.getByTestId('data-unit')).toContainText(`Sales ${stamp}`);
  await expect(page.getByTestId('data-record')).toBeVisible();
});
