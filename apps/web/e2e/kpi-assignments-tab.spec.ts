/**
 * UI-004: nothing in the web app could give a KPI to a unit or a person after
 * it was created, so `/my-kpis`, `/team` and a KPI's own page stayed empty in
 * a real organisation. The KPI form even said "create the KPI and assign
 * later" with no later to speak of.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('a per-unit KPI can be given to a unit, and taken away again', async ({ page }) => {
  const stamp = suffix();
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `assign-${stamp}`,
      slug: `assign-${stamp}`,
      adminFullName: 'Assign Admin',
      adminEmail: `admin-${stamp}@assign.test.local`,
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

  const unit = (await (await api.post('/org-units', { data: { name: `Support ${stamp}` } })).json()) as { id: string };
  // Created with one unit, so it is valid; we assign a second from the UI.
  const other = (await (await api.post('/org-units', { data: { name: `Sales ${stamp}` } })).json()) as { id: string };
  const kpi = (await (await api.post('/kpis', {
    data: {
      name: `Resolution Time ${stamp}`,
      scope: 'PER_UNIT',
      type: 'NUMBER',
      direction: 'LOWER_IS_BETTER',
      aggregationMethod: 'LAST',
      frequency: 'MONTHLY',
      orgUnitIds: [unit.id],
    },
  })).json()) as { id: string };

  await page.goto(`/kpis/${kpi.id}`);
  await page.getByTestId('tab-assignments').click();

  // The unit it was created with is listed.
  await expect(page.getByText(`Support ${stamp}`)).toBeVisible();

  // Assign the second unit from the UI.
  await page.getByTestId('assignment-holder').selectOption({ label: `Sales ${stamp}` });
  await page.getByTestId('assignment-target').fill('3');
  await page.getByTestId('assignment-add').click();
  await expect(page.getByText(`Sales ${stamp}`)).toBeVisible();

  const afterAdd = (await (await api.get(`/kpis/${kpi.id}/assignments`)).json()) as {
    units: Array<{ assignmentId: string; orgUnitId: string; targetValue: number | null }>;
  };
  const added = afterAdd.units.find((u) => u.orgUnitId === other.id);
  expect(added, 'the unit now holds the KPI').toBeDefined();
  expect(added!.targetValue).toBe(3);

  // Take it away again, through the confirm dialog. Scope to the row: once it
  // is removed the unit is offered again in the assign dropdown, so matching
  // on its name alone would find two elements.
  const row = page.getByTestId(`assignment-row-${added!.assignmentId}`);
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Remove' }).click();
  const dialog = page.getByTestId('assignment-remove-confirm');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`Remove Sales ${stamp} from this KPI?`);
  await page.getByTestId('assignment-remove-confirm-confirm').click();

  await expect(row).toBeHidden();
  const afterRemove = (await (await api.get(`/kpis/${kpi.id}/assignments`)).json()) as {
    units: Array<{ orgUnitId: string }>;
  };
  expect(afterRemove.units.some((u) => u.orgUnitId === other.id)).toBe(false);
});
