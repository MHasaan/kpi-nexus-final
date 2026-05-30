/**
 * P5 KPI analytics pages (browser e2e): /kpis/[id]/{anomalies,forecast,whatif}.
 * Drives each page against the live ML sidecar (via the api). Requires the api
 * ($API_URL) + ML sidecar running; the web app is auto-started by Playwright.
 */
import { expect, request, test, type Page, type APIRequestContext } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const ML_URL = process.env.ML_SIDECAR_URL ?? 'http://localhost:8000';

async function up(url: string): Promise<boolean> {
  try {
    return (await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

let ready = false;
test.beforeAll(async () => {
  ready = (await up(API_URL)) && (await up(ML_URL));
  if (!ready) console.warn('[skip] api or ML sidecar not reachable — ai-analytics-ui skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Reg { accessToken: string; refreshToken: string }

async function setup(page: Page): Promise<{ kpiId: string; reg: Reg }> {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `AUI ${stamp}`,
      slug: `aui-${stamp}`,
      adminEmail: `admin-${stamp}@aui.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'AUI Admin',
    },
  })).json()) as Reg;
  const api: APIRequestContext = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Latency ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'LOWER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };
  const values = [10, 11, 9, 10, 12, 8, 10, 11, 9, 100, 10, 9];
  for (let i = 0; i < values.length; i += 1) {
    const m = String(i + 1).padStart(2, '0');
    await api.post(`/kpis/${kpi.id}/data`, { data: { value: values[i], periodStart: `2026-${m}-01`, periodEnd: `2026-${m}-28` } });
  }

  await page.goto('/');
  await page.evaluate(
    ([at, rt]) => {
      window.localStorage.setItem('kpi-nexus.access-token', at);
      window.localStorage.setItem('kpi-nexus.refresh-token', rt);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );
  return { kpiId: kpi.id, reg };
}

test('anomalies page: chart renders, detect & save flags the spike, confirm works', async ({ page }) => {
  test.skip(!ready, 'api/ML not reachable');
  test.setTimeout(60_000);
  const { kpiId } = await setup(page);

  await page.goto(`/kpis/${kpiId}/anomalies`);
  await expect(page.getByTestId('anom-chart')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('anom-method').selectOption('zscore');
  await page.getByTestId('anom-detect-persist').click();
  await expect(page.getByTestId('anom-detected')).toBeVisible({ timeout: 15_000 });

  const row = page.locator('[data-testid^="anom-row-"]').first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.locator('[data-testid^="anom-confirm-"]').click();
  await expect(page.locator('[data-testid^="anom-confirmed-"]').first()).toBeVisible({ timeout: 10_000 });
});

test('forecast page: generate renders chart + fit metrics', async ({ page }) => {
  test.skip(!ready, 'api/ML not reachable');
  test.setTimeout(60_000);
  const { kpiId } = await setup(page);

  await page.goto(`/kpis/${kpiId}/forecast`);
  await page.getByTestId('fc-horizon').fill('5');
  await page.getByTestId('fc-run').click();
  await expect(page.getByTestId('fc-chart')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('fc-metrics')).toBeVisible();
});

test('whatif page: simulate renders ~10% lift', async ({ page }) => {
  test.skip(!ready, 'api/ML not reachable');
  test.setTimeout(60_000);
  const { kpiId } = await setup(page);

  await page.goto(`/kpis/${kpiId}/whatif`);
  await page.getByTestId('wi-delta').fill('10');
  await page.getByTestId('wi-run').click();
  await expect(page.getByTestId('wi-result')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('wi-lift-pct')).toContainText('10.0%');
});
