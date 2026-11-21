/**
 * Plan 3.6 step 4 (UI-005): KPIs could only come from a template or the AI.
 * The step builds categories and KPIs by hand, including which units hold a
 * per-unit KPI, and they become real, recordable KPIs.
 */
import { type Page, expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    return (await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Enter the wizard with an administrator role and a small unit tree already in the draft. */
async function enterKpis(page: Page, stamp: string): Promise<void> {
  await page.goto('/signup');
  await page.getByTestId('signup-email').fill(`admin-${stamp}@kpis.test.local`);
  await page.getByTestId('signup-org').fill(`Kpis ${stamp}`);
  await page.getByTestId('entry-full').click();
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Kpis ${stamp}`, { timeout: 15_000 });
  const handle = await page.evaluate(() => JSON.parse(window.localStorage.getItem('kpi-nexus.onboarding-draft')!) as { sessionId: string; draftToken: string });
  const anon = await request.newContext({ baseURL: API_URL });
  expect((await anon.put(`/onboarding/${handle.sessionId}`, {
    headers: { 'x-draft-token': handle.draftToken },
    data: {
      patch: {
        roles: [{ name: 'Admin', isAdmin: true }],
        orgUnitTypes: [{ name: 'Department' }],
        orgUnits: [
          { name: 'Engineering', type: 'Department' },
          { name: 'Platform', type: 'Department', parent: 'Engineering' },
          { name: 'Sales', type: 'Department' },
        ],
      },
    },
  })).status()).toBe(200);
  await page.goto('/signup/wizard?step=kpis');
  await expect(page.getByTestId('kpi-add')).toBeVisible({ timeout: 15_000 });
}

test('wizard KPIs step: categories and KPIs built by hand become real KPIs, held by the units chosen', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(90_000);
  const stamp = suffix();
  await enterKpis(page, stamp);

  // A KPI needs a category first.
  await expect(page.getByTestId('kpi-add')).toBeDisabled();
  await page.getByTestId('kpi-category-suggest-Financial').click();
  await page.getByTestId('kpi-category-add').click();
  await page.getByTestId('kpi-category-name-1').fill('Delivery');

  // An organisation-wide KPI in money.
  await page.getByTestId('kpi-add').click();
  await page.getByTestId('kpi-name-0').fill('Monthly Revenue');
  await page.getByTestId('kpi-details-0').click();
  await page.getByTestId('kpi-type-0').selectOption('CURRENCY');
  await page.getByTestId('kpi-unit-0').fill('USD');
  await page.getByTestId('kpi-target-0').fill('100000');
  await page.getByTestId('kpi-quadrant-0').selectOption('FINANCIAL');
  // Flow walk (first use): the row's one-line summary read "target 100000 USD".
  await expect(page.getByTestId('kpi-details-0')).toContainText('target 100,000 USD');

  // A per-unit KPI, lower is better, held by Engineering.
  await page.getByTestId('kpi-add').click();
  await page.getByTestId('kpi-name-1').fill('Cycle Time');
  await page.getByTestId('kpi-category-1').selectOption('Delivery');
  await page.getByTestId('kpi-details-1').click();
  await page.getByTestId('kpi-scope-1').selectOption('PER_UNIT');
  await page.getByTestId('kpi-direction-1').selectOption('LOWER_IS_BETTER');
  await page.getByTestId('kpi-frequency-1').selectOption('WEEKLY');
  await page.getByTestId('kpi-unit-1').fill('days');
  await page.getByTestId('kpi-target-1').fill('5');
  // Until a unit is chosen it says who will hold it.
  await expect(page.getByTestId('kpi-units-hint-1')).toContainText('Engineering, Sales');
  await page.getByTestId('kpi-1-unit-Engineering').check();
  await expect(page.getByTestId('kpi-units-hint-1')).toContainText('units below');
  await expect(page.getByTestId('count-kpis')).toHaveText('2');
  await expect(page.getByTestId('count-kpiCategories')).toHaveText('2');

  // A category with KPIs in it cannot be removed; renaming it takes them along.
  await expect(page.getByTestId('kpi-category-remove-1')).toBeDisabled();
  await page.getByTestId('kpi-category-name-1').fill('Engineering health');
  await expect(page.getByTestId('kpi-category-1')).toHaveValue('Engineering health');

  // A duplicate KPI name is flagged on its row.
  await page.getByTestId('kpi-add').click();
  await page.getByTestId('kpi-name-2').fill('cycle time');
  await expect(page.getByTestId('kpi-problem-2')).toContainText('already a KPI called');
  await page.getByTestId('kpi-remove-2').click();
  await expect(page.getByTestId('wizard-step-problems-kpis')).toHaveCount(0);

  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'saved');
  await page.reload();
  await expect(page.getByTestId('kpi-name-1')).toHaveValue('Cycle Time', { timeout: 15_000 });
  await page.getByTestId('kpi-details-1').click();
  await expect(page.getByTestId('kpi-1-unit-Engineering')).toBeChecked();
  await expect(page.getByTestId('kpi-target-1')).toHaveValue('5');

  // Finish and look at the real KPIs.
  await page.getByTestId('wizard-step-review').click();
  await expect(page.getByTestId('wizard-ready')).toBeVisible();
  await page.getByTestId('admin-name').fill('Kpis Admin');
  await page.getByTestId('admin-password').fill('correct-horse-battery-staple');
  await page.getByTestId('admin-password-confirm').fill('correct-horse-battery-staple');
  await page.getByTestId('org-slug').fill(`kpis-${stamp}`);
  await page.getByTestId('wizard-complete').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  const token = await page.evaluate(() => window.localStorage.getItem('kpi-nexus.access-token'));
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${token}` } });
  const kpis = (await (await api.get('/kpis')).json()) as Array<Record<string, unknown> & { id: string; name: string }>;
  expect(kpis.find((k) => k.name === 'Monthly Revenue')).toMatchObject({
    scope: 'ORG_WIDE',
    type: 'CURRENCY',
    unit: 'USD',
    targetValue: 100000,
    scorecardQuadrant: 'FINANCIAL',
  });
  const cycle = kpis.find((k) => k.name === 'Cycle Time')!;
  expect(cycle).toMatchObject({ scope: 'PER_UNIT', direction: 'LOWER_IS_BETTER', frequency: 'WEEKLY', unit: 'days', targetValue: 5 });
  const held = (await (await api.get(`/kpis/${cycle.id}/assignments`)).json()) as { units: Array<{ name: string; inherited: boolean }> };
  expect(held.units.map((u) => [u.name, u.inherited]).sort()).toEqual([['Engineering', false], ['Platform', true]]);
  const categories = (await (await api.get('/kpi-categories')).json()) as Array<{ name: string }>;
  expect(categories.map((c) => c.name).sort()).toEqual(['Engineering health', 'Financial']);
});

test('wizard KPIs step: a per-unit KPI with no units to hold it says so', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  await page.goto('/signup');
  await page.getByTestId('signup-email').fill(`admin-${stamp}@kpis.test.local`);
  await page.getByTestId('signup-org').fill(`Kpis ${stamp}`);
  await page.getByTestId('entry-full').click();
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Kpis ${stamp}`, { timeout: 15_000 });
  await page.getByTestId('wizard-step-kpis').click();

  await page.getByTestId('kpi-category-suggest-Operations').click();
  await page.getByTestId('kpi-add').click();
  await page.getByTestId('kpi-name-0').fill('Tickets Closed');
  await page.getByTestId('kpi-details-0').click();
  await page.getByTestId('kpi-scope-0').selectOption('PER_UNIT');
  await expect(page.getByTestId('kpi-problem-0')).toContainText('there are no units yet');
  await expect(page.getByTestId('kpi-0-go-structure')).toBeVisible();
  await page.getByTestId('kpi-0-go-structure').click();
  await expect(page).toHaveURL(/step=structure/);
});
