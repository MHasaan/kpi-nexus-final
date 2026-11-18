/**
 * Plan 7.7 (thresholds): the band form was five unlabelled boxes — "name",
 * "lower", "upper", a bare number — with no way to choose the colour, and
 * nothing said that a band's name decides the status it gives.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('threshold bands: labelled fields, a colour, and what each band counts as', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `tbf-${stamp}`,
      slug: `tbf-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@tbf.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Margin ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };

  await page.goto(`/kpis/${kpi.id}?tab=thresholds`);

  // Choosing what the band means fills its name and colour.
  await page.getByLabel('Counts as').selectOption('AT_RISK');
  await expect(page.getByLabel('Name')).toHaveValue('At risk');
  await expect(page.getByLabel('Colour')).toHaveValue('#d97706');
  await page.getByLabel('From').fill('50');
  await page.getByLabel('To', { exact: true }).fill('80');
  await page.getByTestId('band-add').click();

  const row = page.getByTestId('band-row-At risk');
  await expect(row).toContainText('50 to 80');
  await expect(row).toContainText('Counts as At risk');

  // A name of one's own: the form says what it will count as before it is saved.
  await page.getByLabel('Name').fill('Critical zone');
  await expect(page.getByTestId('band-meaning-hint')).toHaveText('A band with this name counts as Off track.');
  await page.getByLabel('Colour').fill('#7c3aed');
  await page.getByLabel('To', { exact: true }).fill('49');
  await page.getByTestId('band-add').click();
  await expect(page.getByTestId('band-row-Critical zone')).toContainText('up to 49');

  // What was stored.
  const bands = (await (await api.get(`/kpis/${kpi.id}/threshold-bands`)).json()) as Array<{ name: string; color: string; lower: number | null; upper: number | null }>;
  expect(bands.find((b) => b.name === 'At risk')).toMatchObject({ color: '#d97706', lower: 50, upper: 80 });
  expect(bands.find((b) => b.name === 'Critical zone')).toMatchObject({ color: '#7c3aed', lower: null, upper: 49 });
});
