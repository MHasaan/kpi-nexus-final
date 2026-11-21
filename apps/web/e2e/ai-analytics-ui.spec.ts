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

async function setup(page: Page, values: number[] = [10, 11, 9, 10, 12, 8, 10, 11, 9, 100, 10, 9]): Promise<{ kpiId: string; reg: Reg }> {
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
  for (let i = 0; i < values.length; i += 1) {
    const m = String(i + 1).padStart(2, '0');
    await api.post(`/kpis/${kpi.id}/data`, { data: { value: values[i], periodStart: `2025-${m}-01`, periodEnd: `2025-${m}-28` } });
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

  // Flow walk (anomalies): the methods were offered by their code names, with nothing on what each flags.
  expect(await page.getByTestId('anom-method').locator('option').allTextContents()).toEqual([
    'Several methods together',
    'Far from the average',
    'Far from the recent trend',
    'Unlike the rest',
  ]);
  await page.getByTestId('anom-method').selectOption('zscore');
  await expect(page.getByTestId('anom-method-about')).toContainText('far from the average');
  await page.getByTestId('anom-detect-persist').click();
  await expect(page.getByTestId('anom-detected')).toBeVisible({ timeout: 15_000 });

  const row = page.locator('[data-testid^="anom-row-"]').first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  // Flow walk (anomalies): a saved anomaly was a score and a method. It says which value, and when: the 100 recorded for October.
  await expect(page.getByTestId('anom-saved').getByRole('columnheader')).toHaveText(['Period', 'Value', 'How unusual', 'Method', 'State']);
  await expect(row).toContainText('2025-10-01');
  await expect(row).toContainText('100');
  await expect(row).toContainText('Far from the average');
  await expect(row).not.toContainText('ZSCORE');
  await row.locator('[data-testid^="anom-confirm-"]').click();
  await expect(page.locator('[data-testid^="anom-confirmed-"]').first()).toBeVisible({ timeout: 10_000 });
});

// Flow walk (anomalies): "Look, and save" pressed a second time saved the same value's anomaly a second
// time — two rows for one value, each waiting to be confirmed.
test('anomalies page: looking and saving again does not save the same anomaly twice', async ({ page }) => {
  test.skip(!ready, 'api/ML not reachable');
  test.setTimeout(60_000);
  const { kpiId, reg } = await setup(page);
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` } });
  const saved = async () => ((await (await api.get(`/kpis/${kpiId}/anomalies`)).json()) as Array<{ dataPointId: string | null; method: string }>);

  await page.goto(`/kpis/${kpiId}/anomalies`);
  // Press the button and wait for the save to come back: counting before it lands proves nothing.
  const lookAndSave = async () => {
    const done = page.waitForResponse((r) => r.url().includes('/anomalies/detect') && r.request().method() === 'POST');
    await page.getByTestId('anom-detect-persist').click();
    expect((await done).ok()).toBe(true);
  };
  await page.getByTestId('anom-method').selectOption('zscore');
  await lookAndSave();
  const rows = page.locator('[data-testid^="anom-row-"]');
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const first = await saved();
  expect(first.length).toBeGreaterThan(0);

  await lookAndSave();
  expect(await saved()).toHaveLength(first.length);
  await expect(rows).toHaveCount(first.length);

  // Another method is another finding about the same value: that one is saved, once.
  await page.getByTestId('anom-method').selectOption('ensemble');
  await lookAndSave();
  await lookAndSave();
  const all = await saved();
  expect(new Set(all.map((a) => `${a.dataPointId}:${a.method}`)).size).toBe(all.length);
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

  // Flow walk (forecast): the table was headed "Date / yhat" with rows "t+1", "t+2".
  // Each row is a real period — the months after December 2025, the last one recorded (a period not yet begun takes no value, so the history is last year's).
  const table = page.getByTestId('fc-predictions');
  await expect(table.getByRole('columnheader')).toHaveText(['Period', 'Forecast', 'Likely range (80%)', 'Wider range (95%)']);
  await expect(table.getByRole('row')).toHaveCount(6);
  await expect(table.getByRole('row').nth(1)).toContainText('2026');
  await expect(table).not.toContainText('t+1');
  await expect(table).not.toContainText('yhat');
});

test('forecast page: picking ARIMA runs ARIMA (OT-005)', async ({ page }) => {
  test.skip(!ready, 'api/ML not reachable');
  test.setTimeout(60_000);
  const { kpiId } = await setup(page);

  await page.goto(`/kpis/${kpiId}/forecast`);
  await page.getByTestId('fc-model').selectOption('arima');
  await page.getByTestId('fc-horizon').fill('4');
  await page.getByTestId('fc-run').click();
  await expect(page.getByTestId('fc-metrics')).toContainText('ARIMA', { timeout: 20_000 });
});

// QA-M9: with too little history the service runs the simple trend instead of
// the chosen model. The page said so only by a small "NAIVE" in a metric card.
test('forecast page: says so when the chosen model could not run and another did', async ({ page }) => {
  test.skip(!ready, 'api/ML not reachable');
  test.setTimeout(60_000);
  const { kpiId } = await setup(page, [10, 12, 11]); // three values: not enough for Prophet

  await page.goto(`/kpis/${kpiId}/forecast`);
  await page.getByTestId('fc-model').selectOption('prophet');
  await page.getByTestId('fc-horizon').fill('3');
  await page.getByTestId('fc-run').click();
  const notice = page.getByTestId('fc-fallback');
  await expect(notice).toContainText('Prophet could not be fitted', { timeout: 20_000 });
  await expect(notice).toContainText('made with Simple trend instead');
  await expect(page.getByTestId('fc-metrics')).toContainText('Simple trend');

  // Moving the picker afterwards does not rewrite what the shown forecast was asked for.
  await page.getByTestId('fc-model').selectOption('arima');
  await expect(notice).toContainText('Prophet could not be fitted');

  // Asking for the simple trend and getting it: nothing to explain.
  await page.getByTestId('fc-model').selectOption('naive');
  await page.getByTestId('fc-run').click();
  await expect(page.getByTestId('fc-fallback')).toHaveCount(0, { timeout: 20_000 });
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

  // Flow walk (what-if): "Mechanic", "Delta %", "Aggregate lift", and two bars with nothing written on them.
  const result = page.getByTestId('wi-result');
  await expect(page.getByLabel('Change each value by')).toBeVisible();
  // The twelve values add up to 209; ten per cent more is 229.9.
  await expect(page.getByTestId('wi-totals')).toHaveText('As recorded: 209 · With the change: 229.9');
  await expect(result.getByRole('columnheader')).toHaveText(['Value', 'As recorded', 'With the change']);
  for (const jargon of ['Mechanic', 'Delta', 'Aggregate lift', 'Baseline']) {
    await expect(page.getByRole('main')).not.toContainText(jargon);
  }
});
