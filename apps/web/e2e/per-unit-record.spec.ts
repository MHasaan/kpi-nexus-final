/**
 * UI-003: a PER_UNIT KPI could not be given a value anywhere in the web app.
 * The Data tab only offered a form for ORG_WIDE; for the other scopes it said
 * "record via its scope-specific endpoint" and stopped there.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('a per-unit KPI can be recorded from its Data tab, against a chosen unit', async ({ page }) => {
  const stamp = suffix();
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `perunit-${stamp}`,
      slug: `perunit-${stamp}`,
      adminFullName: 'Per Unit Admin',
      adminEmail: `admin-${stamp}@perunit.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` },
  });

  const unit = (await (await api.post('/org-units', { data: { name: `Engineering ${stamp}` } })).json()) as {
    id: string;
  };
  const kpi = (await (await api.post('/kpis', {
    data: {
      name: `Lead Time ${stamp}`,
      scope: 'PER_UNIT',
      type: 'NUMBER',
      direction: 'LOWER_IS_BETTER',
      aggregationMethod: 'LAST',
      frequency: 'MONTHLY',
      orgUnitIds: [unit.id],
    },
  })).json()) as { id: string };

  await page.goto(`/kpis/${kpi.id}`);
  await expect(page.getByTestId('kpi-detail-name')).toContainText(`Lead Time ${stamp}`);
  await page.getByTestId('tab-data').click();

  // The form knows which unit it is recording for, and offers this month.
  const unitPicker = page.getByTestId('data-unit');
  await expect(unitPicker).toBeVisible();
  await expect(unitPicker).toContainText(`Engineering ${stamp}`);
  const now = new Date();
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  await expect(page.getByTestId('data-period-start')).toHaveValue(firstOfMonth);

  await page.getByTestId('data-value').fill('4.5');
  await page.getByTestId('data-record').click();

  // The value lands, against that unit.
  const row = page.getByTestId('data-point-value').first();
  await expect(row).toHaveText('4.5');
  await expect(page.getByTestId('data-point-owner').first()).toContainText(`Engineering ${stamp}`);

  // And it really is stored against the unit's assignment, not the org.
  const points = (await (await api.get(`/kpis/${kpi.id}/data`)).json()) as Array<{
    value: number;
    orgUnitId: string | null;
  }>;
  expect(points[0]?.value).toBe(4.5);
  expect(points[0]?.orgUnitId).toBe(unit.id);
});
