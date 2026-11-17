/**
 * X-01 (plan 7.1, part 2): on a KPI's tabs, Delete on a target, a threshold
 * band or a benchmark and Detach on a cascade acted on one click, with no way
 * back — and a failure was dropped without a word.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('KPI tabs: deleting a target, a band, a benchmark or a cascade link asks first', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `ktd-${stamp}`,
      slug: `ktd-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@ktd.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Margin ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  const parent = (await (await api.post('/kpis', { data: { name: `Profit ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  const made = async (path: string, data: Record<string, unknown>) => {
    const res = await api.post(path, { data });
    expect(res.status(), path).toBe(201);
  };
  await made(`/kpis/${kpi.id}/targets`, { type: 'STATIC', value: 42 });
  await made(`/kpis/${kpi.id}/threshold-bands`, { name: 'On track', lower: 40, upper: null, color: '#16a34a', order: 0 });
  await made(`/kpis/${kpi.id}/benchmarks`, { kind: 'EXTERNAL_INDUSTRY', value: 38, source: 'Survey' });
  await made('/kpi-cascades', { parentKpiId: parent.id, childKpiId: kpi.id, method: 'SUM', weight: 1 });

  const counts = async () => ({
    targets: ((await (await api.get(`/kpis/${kpi.id}/targets`)).json()) as unknown[]).length,
    bands: ((await (await api.get(`/kpis/${kpi.id}/threshold-bands`)).json()) as unknown[]).length,
    benchmarks: ((await (await api.get(`/kpis/${kpi.id}/benchmarks`)).json()) as unknown[]).length,
  });
  expect(await counts()).toEqual({ targets: 1, bands: 1, benchmarks: 1 });

  for (const [tab, button, dialogId, says] of [
    ['targets', 'Delete', 'target-delete-confirm', 'Delete the static target?'],
    ['thresholds', 'Delete', 'band-delete-confirm', 'Delete the band “On track”?'],
    ['benchmarks', 'Delete', 'benchmark-delete-confirm', 'Delete the external industry benchmark?'],
    ['cascade', 'Detach', 'cascade-detach-confirm', `Detach from “Profit ${stamp}”?`],
  ] as const) {
    await page.goto(`/kpis/${kpi.id}?tab=${tab}`);
    // The row's own button — not the page header's "Delete", which deletes the KPI.
    const rowButtons = page.getByRole('button', { name: button, exact: true }).and(page.locator(':not([data-testid="kpi-detail-delete"])'));
    const trigger = rowButtons.first();
    await trigger.click();
    const dialog = page.getByTestId(dialogId);
    await expect(dialog, tab).toContainText(says);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(trigger, `${tab}: cancel keeps it`).toBeVisible();
    await trigger.click();
    await page.getByTestId(`${dialogId}-confirm`).click();
    await expect(rowButtons, `${tab}: confirmed`).toHaveCount(0);
  }
  expect(await counts()).toEqual({ targets: 0, bands: 0, benchmarks: 0 });
  expect(((await (await api.get('/kpi-cascades')).json()) as Array<{ childKpiId: string }>).filter((c) => c.childKpiId === kpi.id)).toEqual([]);
});
