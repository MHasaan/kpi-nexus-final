/**
 * Flow walk (KPI pages): a KPI's Forecast, Anomalies, What-if and Embed pages
 * were headed "Forecast", "What-if simulator"… with "KPIs / Forecast" in the
 * top bar — nothing said which KPI was on the screen, or led back to it.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test("a KPI's analysis pages say which KPI they are about, and lead back to it", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `ksn-${stamp}`,
      slug: `ksn-${stamp}`,
      adminFullName: 'Kim Admin',
      adminEmail: `admin-${stamp}@ksn.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const name = `Revenue ${stamp}`;
  const kpi = (await (await api.post('/kpis', { data: { name, scope: 'ORG_WIDE' } })).json()) as { id: string };

  for (const sub of ['forecast', 'anomalies', 'whatif', 'embed']) {
    await page.goto(`/kpis/${kpi.id}/${sub}`);
    // The heading names the KPI.
    await expect(page.getByTestId('kpi-page-kpi-name'), sub).toHaveText(name);
    // The top bar leads back to it.
    const back = page.getByRole('banner').getByRole('link', { name });
    await expect(back, sub).toHaveAttribute('href', `/kpis/${kpi.id}`);
  }
});
