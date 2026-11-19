/**
 * Flow walk (new dashboard): ticking the first starter KPI inserted a
 * "1 selected" line above the list, so every row moved down under the pointer
 * and the next click landed on the wrong one. The count now sits below the
 * list, in the place the "none picked" note already held.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('ticking a starter KPI does not move the list under the pointer', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `sld-${stamp}`,
      slug: `sld-${stamp}`,
      adminFullName: 'Dana Admin',
      adminEmail: `admin-${stamp}@sld.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const ids: string[] = [];
  for (const name of ['Alpha', 'Beta']) {
    ids.push(((await (await api.post('/kpis', { data: { name: `${name} ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string }).id);
  }

  await page.goto('/dashboards/new');
  const rows = ids.map((id) => page.getByTestId(`starter-kpi-${id}`));
  await expect(rows[0]!).toBeVisible();
  const top = async () => Promise.all(rows.map(async (r) => Math.round((await r.boundingBox())!.y)));

  const before = await top();
  await rows[0]!.click();
  await expect(page.getByTestId('starter-kpis-count')).toHaveText('1 selected');
  expect(await top()).toEqual(before);

  // So a second click, made where the second row was, ticks the second row.
  await rows[1]!.click();
  await expect(page.getByTestId('starter-kpis-count')).toHaveText('2 selected');
  expect(await top()).toEqual(before);
});
