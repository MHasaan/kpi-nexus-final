/**
 * Follow-up to UI-017: with a target in effect on the Targets tab, a figure
 * typed into the KPI's Edit form would last only until the tab's target was
 * written back. The form now shows the figure, says where it comes from, and
 * does not offer to change it there.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('KPI edit form: a target that comes from the Targets tab is shown, not edited, and survives a save', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `kft-${stamp}`,
      slug: `kft-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@kft.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const make = async (name: string) =>
    ((await (await api.post('/kpis', { data: { name: `${name} ${stamp}`, scope: 'ORG_WIDE', targetValue: 100 } })).json()) as { id: string }).id;
  const plain = await make('Plain');
  const withTab = await make('Tabbed');
  expect((await api.post(`/kpis/${withTab}/targets`, { data: { type: 'STATIC', value: 200 } })).status()).toBe(201);

  // No target on the tab: the form's own field is the target, as before.
  await page.goto(`/kpis/${plain}/edit`);
  await expect(page.getByTestId('kpi-target')).toBeEnabled();
  await expect(page.getByTestId('kpi-target-from-tab')).toHaveCount(0);

  // A target in effect on the tab: shown, not editable, with the way to change it.
  await page.goto(`/kpis/${withTab}/edit`);
  await expect(page.getByTestId('kpi-target')).toHaveValue('200');
  await expect(page.getByTestId('kpi-target')).toBeDisabled();
  const note = page.getByTestId('kpi-target-from-tab');
  await expect(note).toContainText('Targets tab');
  await expect(note.getByRole('link')).toHaveAttribute('href', `/kpis/${withTab}?tab=targets`);

  // Saving something else leaves the target as the tab set it.
  await page.getByTestId('kpi-name').fill(`Renamed ${stamp}`);
  await page.getByTestId('kpi-submit').click();
  await page.waitForURL(`**/kpis/${withTab}`);
  expect(await (await api.get(`/kpis/${withTab}`)).json()).toMatchObject({ name: `Renamed ${stamp}`, targetValue: 200 });
});
