/**
 * Plan 7.4: a submit button with no busy state let a slow save be sent again
 * by pressing it a second time. The KPI's Targets form is the example here;
 * the same form component is used on the other KPI tabs and the saved views.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('a form being sent is busy and is not sent twice', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `bsy-${stamp}`,
      slug: `bsy-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@bsy.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Margin ${stamp}`, scope: 'ORG_WIDE', unit: '%' } })).json()) as { id: string };

  // Hold every "add target" request for a moment and count them.
  let sent = 0;
  await page.route(`**/kpis/${kpi.id}/targets`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    sent += 1;
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });

  await page.goto(`/kpis/${kpi.id}?tab=targets`);
  await page.getByTestId('target-value').fill('42');
  const add = page.getByTestId('target-add');
  await add.click();
  await expect(add).toBeDisabled();
  // A second press while it is being sent does nothing.
  await add.click({ force: true });
  await page.getByTestId('target-value').press('Enter');
  await expect(add).toBeEnabled({ timeout: 10_000 });
  expect(sent).toBe(1);
});
