/**
 * Flow walk (teams): a new team's "Assign a KPI" said only "No per-unit KPI
 * left to assign" — a dead end for an organisation that has not made one yet,
 * with no word on where one is made. The page also said members "drive
 * PER_UNIT KPI visibility". It now says which KPIs can be assigned and offers
 * to create one; the new-KPI form opens with that scope and this team chosen.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('a team with no KPI to assign leads to making one for it', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `tlk-${stamp}`,
      slug: `tlk-${stamp}`,
      adminFullName: 'Tia Admin',
      adminEmail: `admin-${stamp}@tlk.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const unit = (await (await api.post('/org-units', { data: { name: `Sales ${stamp}` } })).json()) as { id: string };

  await page.goto('/org-units');
  // No stored key in what the page says about itself.
  await expect(page.getByRole('main')).not.toContainText('PER_UNIT');

  await page.getByTestId(`expand-unit-Sales ${stamp}`).click();
  const panel = page.getByTestId('unit-kpis-panel');
  await expect(panel.getByTestId('unit-kpi-none-to-assign')).toContainText('“Per unit”');
  await panel.getByRole('link', { name: /Create one/ }).click();

  // The new-KPI form opens measured per team, with this team chosen.
  await expect(page).toHaveURL(/\/kpis\/new\?/);
  await expect(page.getByTestId('kpi-scope')).toHaveValue('PER_UNIT');
  await expect(page.getByTestId(`kpi-orgunit-${unit.id}`)).toBeChecked();
});
