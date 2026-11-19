/**
 * Flow walk (Ask): the example questions on an empty Ask page were "Forecast
 * MRR for next 3 months" and "Compare CAC across org units" — KPIs a food
 * distributor does not have. The examples now name the organisation's own
 * KPIs, and fall back to questions about no KPI in particular when it has none.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test("ask: the example questions are about the organisation's own KPIs", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `aek-${stamp}`,
      slug: `aek-${stamp}`,
      adminFullName: 'Aqsa Admin',
      adminEmail: `admin-${stamp}@aek.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const suggestions = page.getByTestId('ask-suggestions');

  // No KPIs yet: nothing is named.
  await page.goto('/ask');
  await expect(suggestions.getByRole('button')).toHaveText(['Which KPIs are off track this quarter?', 'What changed most this month?', 'Where should I focus next?']);

  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  for (const name of [`Deliveries ${stamp}`, `Returns ${stamp}`]) {
    expect((await api.post('/kpis', { data: { name, scope: 'ORG_WIDE' } })).status()).toBe(201);
  }
  await page.reload();
  await expect(suggestions).toContainText(`How is Deliveries ${stamp} doing?`);
  await expect(suggestions).toContainText(`Returns ${stamp}`);
  await expect(suggestions).not.toContainText('MRR');
  await expect(suggestions).not.toContainText('CAC');
});
