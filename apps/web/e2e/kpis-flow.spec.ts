/**
 * /kpis page e2e — admin CRUD + inline ORG_WIDE data entry.
 *
 * Admin registers → /kpis renders empty → creates an ORG_WIDE KPI with
 * type CURRENCY and a target → row appears with scope/type/frequency
 * badges → clicks "Record value" → fills the inline form → row appears
 * in the recent-values list → deletes the KPI.
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

test.describe('/kpis page — admin CRUD + ORG_WIDE data entry', () => {
  test('admin creates ORG_WIDE KPI → records a value → it appears in the data list → deletes', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    await registerAndSeed(page, stamp);

    await page.goto('/kpis');
    await expect(page.getByTestId('kpis-heading')).toBeVisible();
    await expect(page.getByTestId('kpis-empty')).toBeVisible();

    // 1. Create an ORG_WIDE KPI
    const kpiName = `Revenue ${stamp}`;
    await page.getByTestId('kpi-name-input').fill(kpiName);
    await page.getByTestId('kpi-type-select').selectOption('CURRENCY');
    await page.getByTestId('kpi-unit-input').fill('USD');
    await page.getByTestId('kpi-target-input').fill('100000');
    await page.getByTestId('kpi-submit-button').click();

    const row = page.getByTestId(`kpi-row-${kpiName}`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('kpi-scope-badge')).toHaveText('ORG_WIDE');
    await expect(row).toContainText('CURRENCY');
    await expect(row).toContainText('MONTHLY');

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

  test('create with name shorter than 2 chars → api validation error surfaces', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');
    await registerAndSeed(page, suffix());

    await page.goto('/kpis');
    await page.getByTestId('kpi-name-input').fill('X');
    await page.getByTestId('kpi-submit-button').click();
    await expect(page.getByTestId('kpi-error')).toBeVisible();
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

  test('PER_UNIT KPI: scope change reveals org-unit picker, selecting one creates an assigned KPI', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    const reg = await registerAndSeed(page, stamp);
    // Need at least one org-unit. Create via the api so the page sees it
    // when it loads.
    const apiCtx = await request.newContext({ baseURL: API_URL });
    const unitName = `Engineering ${stamp}`;
    const unitRes = await apiCtx.post('/org-units', {
      headers: { authorization: `Bearer ${reg.accessToken}` },
      data: { name: unitName },
    });
    expect(unitRes.status()).toBe(201);

    await page.goto('/kpis');
    // PER_UNIT picker is hidden by default
    await expect(page.getByTestId('kpi-orgunit-picker')).toHaveCount(0);

    await page.getByTestId('kpi-scope-select').selectOption('PER_UNIT');
    await expect(page.getByTestId('kpi-orgunit-picker')).toBeVisible();

    const kpiName = `Velocity ${stamp}`;
    await page.getByTestId('kpi-name-input').fill(kpiName);
    await page.getByTestId(`orgunit-checkbox-${unitName}`).check();
    await page.getByTestId('kpi-submit-button').click();

    const row = page.getByTestId(`kpi-row-${kpiName}`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('kpi-scope-badge')).toHaveText('PER_UNIT');
    await expect(
      page.getByTestId(`kpi-assignment-count-${kpiName}`),
    ).toContainText('1 unit');
  });

  test('PER_USER KPI: scope change reveals user picker, selecting self creates an assigned KPI', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    const reg = await registerAndSeed(page, stamp);
    const adminEmail = `admin-${stamp}@kpis.test.local`;

    await page.goto('/kpis');
    await expect(page.getByTestId('kpi-user-picker')).toHaveCount(0);

    await page.getByTestId('kpi-scope-select').selectOption('PER_USER');
    await expect(page.getByTestId('kpi-user-picker')).toBeVisible();

    const kpiName = `Sales Calls ${stamp}`;
    await page.getByTestId('kpi-name-input').fill(kpiName);
    await page.getByTestId(`user-checkbox-${adminEmail}`).check();
    await page.getByTestId('kpi-submit-button').click();

    const row = page.getByTestId(`kpi-row-${kpiName}`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('kpi-scope-badge')).toHaveText('PER_USER');
    await expect(
      page.getByTestId(`kpi-assignment-count-${kpiName}`),
    ).toContainText('1');
  });

  test('PER_UNIT without any unit selected → api 400 surfaces inline', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');
    const stamp = suffix();
    await registerAndSeed(page, stamp);

    await page.goto('/kpis');
    await page.getByTestId('kpi-scope-select').selectOption('PER_UNIT');
    await page.getByTestId('kpi-name-input').fill(`Bad ${stamp}`);
    await page.getByTestId('kpi-submit-button').click();
    await expect(page.getByTestId('kpi-error')).toBeVisible();
  });
});
