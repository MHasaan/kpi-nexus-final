/**
 * UI-012 (plan 5.1, remainder): pages reachable only by typing their address —
 * a widget's detail view, the board pack, and from Settings the connected
 * apps, data connectors, alert channels, automations and plugins.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('onward links: widget → detail view, reports → board pack, settings → the pages it governs', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `onl-${stamp}`,
      slug: `onl-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@onl.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  const dashboard = (await (await api.post('/dashboards', { data: { name: `Board ${stamp}` } })).json()) as { id: string };
  const add = async (widgetType: string, x: number, config: Record<string, unknown>) =>
    ((await (await api.post(`/dashboards/${dashboard.id}/widgets`, { data: { widgetType, position: { x, y: 0, w: 6, h: 3 }, config } })).json()) as { id: string }).id;
  const card = await add('kpi_card', 0, { kpiId: kpi.id });
  const activity = await add('activity', 6, {});

  // A widget on a KPI opens its detail view; one with no KPI has nothing to open.
  await page.goto(`/dashboards/${dashboard.id}`);
  await expect(page.getByTestId(`widget-card-${activity}`)).toContainText('Activity'); // a name, not "activity"
  await expect(page.getByTestId(`widget-open-${activity}`)).toHaveCount(0);
  await page.getByTestId(`widget-open-${card}`).click();
  await expect(page).toHaveURL(new RegExp(`/dashboards/${dashboard.id}/widgets/${card}$`));

  // Reports → board pack.
  await page.goto('/reports');
  await page.getByTestId('reports-board-pack-link').click();
  await expect(page).toHaveURL(/\/reports\/board-pack$/);

  // Settings → each page it governs, and each opens (no bounce to /unauthorized).
  for (const [testId, path] of [
    ['settings-link-integrations', '/integrations'],
    ['settings-link-connectors', '/connectors'],
    ['settings-link-alerts-channels', '/alerts/channels'],
    ['settings-link-workflows', '/workflows'],
    ['settings-link-plugins', '/plugins'],
  ] as const) {
    await page.goto('/settings');
    await page.getByTestId(testId).click();
    await expect(page, `${testId} opens ${path}`).toHaveURL(new RegExp(`${path}$`));
  }
});
