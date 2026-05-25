/**
 * /dashboard page e2e — KPI summary cards.
 *
 * Admin registers → /dashboard shows empty state → creates a KPI →
 * records a value → returns to /dashboard → sees the KPI card with
 * the latest value and target progress.
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
    console.warn(`[skip] api not reachable at ${API_URL} — dashboard e2e skipped`);
  }
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface RegisterResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
}

async function registerAndSeed(
  page: import('@playwright/test').Page,
  stamp: string,
): Promise<RegisterResult> {
  const apiCtx = await request.newContext({ baseURL: API_URL });
  const regRes = await apiCtx.post('/auth/register', {
    data: {
      orgName: `Dashboard E2E ${stamp}`,
      slug: `dashboard-${stamp}`,
      adminEmail: `admin-${stamp}@dashboard.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Dashboard Admin',
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

test.describe('/dashboard page — KPI summary cards', () => {
  test('admin lands on dashboard with empty state, then sees cards after creating KPIs', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');
    const stamp = suffix();
    const reg = await registerAndSeed(page, stamp);
    const apiCtx = await request.newContext({ baseURL: API_URL });
    const auth = { authorization: `Bearer ${reg.accessToken}` };

    // 1. First visit shows empty state
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-heading')).toBeVisible();
    await expect(page.getByTestId('dashboard-empty')).toBeVisible();

    // 2. Create two KPIs via api
    const kpiName1 = `Revenue ${stamp}`;
    const kpiName2 = `Conversion ${stamp}`;
    const k1 = await apiCtx.post('/kpis', {
      headers: auth,
      data: {
        name: kpiName1,
        scope: 'ORG_WIDE',
        type: 'CURRENCY',
        unit: 'USD',
        targetValue: 1000,
        aggregationMethod: 'SUM',
      },
    });
    expect(k1.status()).toBe(201);
    const k1Body = (await k1.json()) as { id: string };
    const k2 = await apiCtx.post('/kpis', {
      headers: auth,
      data: {
        name: kpiName2,
        scope: 'ORG_WIDE',
        type: 'PERCENTAGE',
        unit: '%',
        targetValue: 5,
        aggregationMethod: 'AVG',
      },
    });
    const k2Body = (await k2.json()) as { id: string };

    // 3. Record values
    await apiCtx.post(`/kpis/${k1Body.id}/data`, {
      headers: auth,
      data: { value: 750, periodStart: '2026-01-01', periodEnd: '2026-01-31' },
    });
    await apiCtx.post(`/kpis/${k2Body.id}/data`, {
      headers: auth,
      data: { value: 3.2, periodStart: '2026-01-01', periodEnd: '2026-01-31' },
    });

    // 4. Reload dashboard → cards appear
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-summary-grid')).toBeVisible();
    const card1 = page.getByTestId(`dashboard-card-${kpiName1}`);
    const card2 = page.getByTestId(`dashboard-card-${kpiName2}`);
    await expect(card1).toBeVisible();
    await expect(card2).toBeVisible();

    // 5. Latest value renders with unit
    await expect(page.getByTestId(`dashboard-card-value-${kpiName1}`)).toContainText('750');
    await expect(page.getByTestId(`dashboard-card-value-${kpiName1}`)).toContainText('USD');

    // 6. Sign out → back to /login
    await page.getByTestId('dashboard-signout-button').click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('KPI without recorded values shows "No values yet" on its card', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');
    const stamp = suffix();
    const reg = await registerAndSeed(page, stamp);
    const apiCtx = await request.newContext({ baseURL: API_URL });

    const kpiName = `Empty ${stamp}`;
    const k = await apiCtx.post('/kpis', {
      headers: { authorization: `Bearer ${reg.accessToken}` },
      data: { name: kpiName, scope: 'ORG_WIDE' },
    });
    expect(k.status()).toBe(201);

    await page.goto('/dashboard');
    const card = page.getByTestId(`dashboard-card-${kpiName}`);
    await expect(card).toBeVisible();
    await expect(page.getByTestId(`dashboard-card-empty-${kpiName}`)).toBeVisible();
  });

  test('dashboard without a token redirects to /login', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');
    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.removeItem('kpi-nexus.access-token');
      window.localStorage.removeItem('kpi-nexus.refresh-token');
    });
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });
});
