/**
 * Flow walk (dashboards): in the add-widget form the two preview kinds read
 * "A…" and "S…" — their names were cut to make room for a "Preview" badge on
 * the same line — and the hint under the KPI list said "Pick a kpi card
 * target before you can add it."
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('every kind of widget can be read by name, and the hint says to choose a KPI', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `wtn-${stamp}`,
      slug: `wtn-${stamp}`,
      adminFullName: 'Wes Admin',
      adminEmail: `admin-${stamp}@wtn.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  expect((await api.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE' } })).status()).toBe(201);
  const dashboard = (await (await api.post('/dashboards', { data: { name: `Board ${stamp}` } })).json()) as { id: string };

  await page.goto(`/dashboards/${dashboard.id}`);
  await page.getByTestId('dashboard-add-widget-toggle').click();

  // No name is cut short: what is drawn is as wide as the text itself.
  for (const [type, name] of [['activity', 'Activity'], ['strategy_map', 'Strategy map'], ['kpi_card', 'KPI card']] as const) {
    const label = page.getByTestId(`widget-type-${type}`).getByTestId('widget-type-name');
    await expect(label).toHaveText(name);
    const cut = await label.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(cut, `${name} is cut short`).toBe(false);
  }
  await expect(page.getByTestId('widget-type-activity')).toContainText('Preview');

  await expect(page.getByTestId('widget-kpi-hint')).toHaveText('Choose the KPI this KPI card shows.');
  await expect(page.getByTestId('widget-editor')).not.toContainText('target before you can add');
});
