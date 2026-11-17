/**
 * Plan 2.9: /org-units showed a unit's members and nothing about its KPIs. A
 * unit's KPIs — the ones it holds directly and the ones it inherits from a
 * parent — could not be seen, assigned, given their own target, recorded or
 * removed from the unit's own page.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface UnitKpi {
  kpiId: string;
  inherited: boolean;
  targetValue: number | null;
  currentValue: number | null;
}

test('a unit shows its KPIs and can be given one, its own target, a value, and lose it', async ({ page }) => {
  const stamp = suffix();
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `unitpanel-${stamp}`,
      slug: `unitpanel-${stamp}`,
      adminFullName: 'Panel Admin',
      adminEmail: `admin-${stamp}@unitpanel.test.local`,
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
  const post = async <T,>(url: string, data: unknown) => (await (await api.post(url, { data })).json()) as T;

  const parent = await post<{ id: string }>('/org-units', { name: `Operations ${stamp}` });
  const child = await post<{ id: string }>('/org-units', { name: `Support ${stamp}`, parentUnitId: parent.id });
  const elsewhere = await post<{ id: string }>('/org-units', { name: `Sales ${stamp}` });
  const kpiBody = { scope: 'PER_UNIT', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST', frequency: 'MONTHLY' };
  // Held by the parent, so the child inherits it.
  const inheritedKpi = await post<{ id: string }>('/kpis', { ...kpiBody, name: `Uptime ${stamp}`, orgUnitIds: [parent.id] });
  // Assigning through the unit endpoint is what cascades to the units below.
  await post(`/org-units/${parent.id}/kpis`, { kpiId: inheritedKpi.id });
  // Held somewhere else, so the child can be given it.
  const otherKpi = await post<{ id: string }>('/kpis', { ...kpiBody, name: `Tickets Closed ${stamp}`, orgUnitIds: [elsewhere.id] });
  const childKpis = async () => (await (await api.get(`/org-units/${child.id}/kpis`)).json()) as UnitKpi[];

  await page.goto('/org-units');
  await page.getByTestId(`expand-unit-Support ${stamp}`).click();
  const panel = page.getByTestId('unit-kpis-panel');
  await expect(panel).toBeVisible();

  // The inherited KPI is listed, and says where it comes from.
  const inheritedRow = panel.getByTestId(`unit-kpi-row-${inheritedKpi.id}`);
  await expect(inheritedRow).toContainText(`Uptime ${stamp}`);
  await expect(inheritedRow).toContainText(`Inherited from Operations ${stamp}`);

  // Give the unit its own target for it: the row becomes the unit's own.
  await inheritedRow.getByTestId(`unit-kpi-target-edit-${inheritedKpi.id}`).click();
  await panel.getByTestId('unit-kpi-target-input').fill('99.5');
  await panel.getByTestId('unit-kpi-target-save').click();
  await expect(inheritedRow).not.toContainText('Inherited from');
  await expect(inheritedRow).toContainText('99.5');
  const own = (await childKpis()).find((k) => k.kpiId === inheritedKpi.id);
  expect(own?.inherited).toBe(false);
  expect(own?.targetValue).toBe(99.5);

  // Assign a KPI the unit does not hold yet.
  await panel.getByTestId('unit-kpi-assign-select').selectOption({ label: `Tickets Closed ${stamp}` });
  await panel.getByTestId('unit-kpi-assign-target').fill('40');
  await panel.getByTestId('unit-kpi-assign-button').click();
  const addedRow = panel.getByTestId(`unit-kpi-row-${otherKpi.id}`);
  await expect(addedRow).toContainText(`Tickets Closed ${stamp}`);
  expect((await childKpis()).find((k) => k.kpiId === otherKpi.id)?.targetValue).toBe(40);

  // Record a value for it, for this unit.
  await addedRow.getByTestId(`unit-kpi-record-toggle-${otherKpi.id}`).click();
  await panel.getByTestId('unit-kpi-value').fill('37');
  await panel.getByTestId('unit-kpi-record').click();
  await expect(addedRow.getByTestId('unit-kpi-current')).toHaveText('37');
  expect((await childKpis()).find((k) => k.kpiId === otherKpi.id)?.currentValue).toBe(37);

  // Take it away again, through the confirm dialog.
  await addedRow.getByTestId(`unit-kpi-remove-${otherKpi.id}`).click();
  const dialog = page.getByTestId('unit-kpi-remove-confirm');
  await expect(dialog).toContainText(`Remove Tickets Closed ${stamp} from Support ${stamp}?`);
  await page.getByTestId('unit-kpi-remove-confirm-confirm').click();
  await expect(addedRow).toBeHidden();
  expect((await childKpis()).some((k) => k.kpiId === otherKpi.id)).toBe(false);
});
