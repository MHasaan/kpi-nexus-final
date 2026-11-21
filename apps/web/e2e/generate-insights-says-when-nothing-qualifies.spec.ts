/**
 * Manual QA (2026-11-19, F-042): "Generate insights" did nothing and said nothing when no KPI had enough
 * history or enough change. The page now says what was skipped and why.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('insights: when nothing qualifies, the page says what was skipped and why', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `ins-${stamp}`,
      slug: `ins-${stamp}`,
      adminFullName: 'Ina Admin',
      adminEmail: `admin-${stamp}@ins.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const one = (await (await api.post('/kpis', { data: { name: `One value ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  expect((await api.post(`/kpis/${one.id}/data`, { data: { value: 100, periodStart: '2026-01-01', periodEnd: '2026-01-31' } })).status()).toBe(201);
  const flat = (await (await api.post('/kpis', { data: { name: `Barely moved ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  for (const [month, value] of [['01', 100], ['02', 101]] as const) {
    expect((await api.post(`/kpis/${flat.id}/data`, { data: { value, periodStart: `2026-${month}-01`, periodEnd: `2026-${month}-28` } })).status()).toBe(201);
  }

  await page.goto('/insights');
  await page.getByTestId('insights-generate').click();
  const notice = page.getByTestId('insights-notice');
  await expect(notice).toContainText('Nothing to add');
  await expect(notice).toContainText('1 KPI has fewer than two values');
  await expect(notice).toContainText('1 changed less than 10%');
  await expect(page.getByTestId('insights-empty')).toBeVisible();
});
