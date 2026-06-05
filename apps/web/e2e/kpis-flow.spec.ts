/**
 * /kpis page e2e — admin CRUD + inline ORG_WIDE data entry.
 *
 * Creation now lives on the dedicated /kpis/new page (the inline create form
 * was removed in the KPI Pages Overhaul). These tests drive the "New KPI"
 * button from the catalog into /kpis/new (the rich KpiForm), then return to
 * the catalog to exercise the inline ORG_WIDE record-value expansion, the Edit
 * row action, and Delete.
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    console.warn(`[skip] api not reachable at ${API_URL} — kpis e2e skipped`);
  }
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface RegisterResult {
  accessToken: string;
  refreshToken: string;
}

async function registerAndSeed(
  page: import('@playwright/test').Page,
  stamp: string,
): Promise<RegisterResult> {
  const apiCtx = await request.newContext({ baseURL: API_URL });
  const regRes = await apiCtx.post('/auth/register', {
    data: {
      orgName: `Kpis E2E ${stamp}`,
      slug: `kpis-${stamp}`,
      adminEmail: `admin-${stamp}@kpis.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Kpis Admin',
    },
  });
  expect(regRes.status()).toBe(201);
  const reg: RegisterResult = await regRes.json();
  await page.goto('/');
  await page.evaluate(
    ([accessToken, refreshToken]) => {
      window.localStorage.setItem('kpi-nexus.access-token', accessToken);
      window.localStorage.setItem('kpi-nexus.refresh-token', refreshToken);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );
  return reg;
}

/** Fill the /kpis/new KpiForm for an ORG_WIDE KPI and submit. */
async function createOrgWideKpi(
  page: import('@playwright/test').Page,
  name: string,
  opts: { type?: string; unit?: string; target?: string } = {},
): Promise<void> {
  await expect(page.getByTestId('kpi-form')).toBeVisible();
  await page.getByTestId('kpi-name').fill(name);
  if (opts.type) await page.getByTestId('kpi-type').selectOption(opts.type);
  if (opts.unit) await page.getByTestId('kpi-unit').fill(opts.unit);
  if (opts.target) await page.getByTestId('kpi-target').fill(opts.target);
  await page.getByTestId('kpi-submit').click();
}

test.describe('/kpis page — admin CRUD + ORG_WIDE data entry', () => {
  test('admin creates ORG_WIDE KPI via New KPI → records a value → it appears in the data list → deletes', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    await registerAndSeed(page, stamp);

    await page.goto('/kpis');
    await expect(page.getByTestId('kpis-heading')).toBeVisible();
    await expect(page.getByTestId('kpis-empty')).toBeVisible();

    // 1. "New KPI" navigates to the dedicated create page
    await page.getByTestId('new-kpi-button').click();
    await expect(page).toHaveURL(/\/kpis\/new$/);

    const kpiName = `Revenue ${stamp}`;
    await createOrgWideKpi(page, kpiName, { type: 'CURRENCY', unit: 'USD', target: '100000' });

    // KpiForm redirects to the KPI detail page on success; go back to catalog.
    await page.goto('/kpis');
    const row = page.getByTestId(`kpi-row-${kpiName}`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('kpi-scope-badge')).toHaveText('ORG_WIDE');
    await expect(row).toContainText('CURRENCY');

    // 2. Click "Record value" → inline panel appears
    await row.getByTestId(`expand-kpi-${kpiName}`).click();
    const panel = page.getByTestId(`kpi-data-panel-${kpiName}`);
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('no-data-points')).toBeVisible();

    // 3. Fill the record-value form
    await page.getByTestId('record-value-input').fill('42500');
    await page.getByTestId('record-start-input').fill('2026-05-01');
    await page.getByTestId('record-end-input').fill('2026-05-31');
    await page.getByTestId('record-submit-button').click();

    // 4. Row in recent-values shows up
    const valuesList = page.getByTestId(`data-points-${kpiName}`);
    await expect(valuesList).toBeVisible();
    await expect(valuesList).toContainText('42500');
    await expect(valuesList).toContainText('USD');

    // 5. Form fields are cleared
    await expect(page.getByTestId('record-value-input')).toHaveValue('');

    // 6. Delete the KPI
    await page.getByTestId(`delete-kpi-${kpiName}`).click();
    await expect(row).not.toBeVisible();
    await expect(page.getByTestId('kpis-empty')).toBeVisible();
  });

  test('Edit row action navigates to the KPI edit page', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    await registerAndSeed(page, stamp);

    await page.goto('/kpis/new');
    const kpiName = `Editable ${stamp}`;
    await createOrgWideKpi(page, kpiName);

    await page.goto('/kpis');
    const row = page.getByTestId(`kpi-row-${kpiName}`);
    await expect(row).toBeVisible();

    await row.getByText('Edit', { exact: true }).click();
    await expect(page).toHaveURL(/\/kpis\/[^/]+\/edit$/);
  });

  test('New KPI button → create page → short name surfaces a validation error', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');
    await registerAndSeed(page, suffix());

    await page.goto('/kpis');
    await page.getByTestId('new-kpi-button').click();
    await expect(page).toHaveURL(/\/kpis\/new$/);

    await page.getByTestId('kpi-name').fill('X');
    await page.getByTestId('kpi-submit').click();
    await expect(page.getByTestId('kpi-form-error')).toBeVisible();
  });

  test('/kpis without a token redirects to /login', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');
    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.removeItem('kpi-nexus.access-token');
      window.localStorage.removeItem('kpi-nexus.refresh-token');
    });
    await page.goto('/kpis');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('catalog filters: search + scope narrow the list and Clear filters resets', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    await registerAndSeed(page, stamp);

    const alpha = `Alpha ${stamp}`;
    const beta = `Beta ${stamp}`;

    await page.goto('/kpis/new');
    await createOrgWideKpi(page, alpha);
    await page.goto('/kpis/new');
    await createOrgWideKpi(page, beta);

    await page.goto('/kpis');
    await expect(page.getByTestId(`kpi-row-${alpha}`)).toBeVisible();
    await expect(page.getByTestId(`kpi-row-${beta}`)).toBeVisible();

    // Search narrows by name
    await page.getByTestId('kpi-search').fill(alpha);
    await expect(page.getByTestId(`kpi-row-${alpha}`)).toBeVisible();
    await expect(page.getByTestId(`kpi-row-${beta}`)).toHaveCount(0);

    // Clear filters restores both rows
    await page.getByTestId('kpis-clear-filters').click();
    await expect(page.getByTestId(`kpi-row-${beta}`)).toBeVisible();

    // A non-matching search shows the friendly no-matches empty state
    await page.getByTestId('kpi-search').fill('zzz-no-such-kpi');
    await expect(page.getByTestId('kpis-no-matches')).toBeVisible();
  });
});
