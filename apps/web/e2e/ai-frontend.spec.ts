/**
 * P5 AI frontend pages (browser e2e): /recommendations, /insights, /ask,
 * /settings/ai. Seeds data via the API, then drives the rendered UI. Requires
 * the api at $API_URL; the web app is auto-started by the Playwright webServer.
 */
import { expect, request, test, type Page } from '@playwright/test';

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
  if (!apiAvailable) console.warn('[skip] api not reachable — ai-frontend skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Reg { accessToken: string; refreshToken: string }

async function register(stamp: string): Promise<Reg> {
  const ctx = await request.newContext({ baseURL: API_URL });
  const res = await ctx.post('/auth/register', {
    data: {
      orgName: `AIFE ${stamp}`,
      slug: `aife-${stamp}`,
      adminEmail: `admin-${stamp}@aife.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'AIFE Admin',
    },
  });
  expect(res.status()).toBe(201);
  return res.json() as Promise<Reg>;
}

async function authedCtx(token: string) {
  return request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${token}` } });
}

async function injectTokens(page: Page, reg: Reg): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ([at, rt]) => {
      window.localStorage.setItem('kpi-nexus.access-token', at);
      window.localStorage.setItem('kpi-nexus.refresh-token', rt);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );
}

test('recommendations page lists a seeded recommendation and flips its status', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(60_000);
  const stamp = suffix();
  const reg = await register(stamp);
  const api = await authedCtx(reg.accessToken);

  const kpi = (await (await api.post('/kpis', {
    data: { name: `Rev ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };
  const rec = (await (await api.post('/recommendations/generate', { data: { kpiId: kpi.id } })).json()) as { id: string };

  await injectTokens(page, reg);
  await page.goto('/recommendations');
  const row = page.getByTestId(`rec-row-${rec.id}`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(`rec-status-${rec.id}`)).toHaveText('PENDING');

  await page.getByTestId(`rec-action-${rec.id}`).click();
  await expect(page.getByTestId(`rec-status-${rec.id}`)).toHaveText('ACTIONED', { timeout: 10_000 });
});

test('insights page lists a seeded insight', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(60_000);
  const stamp = suffix();
  const reg = await register(stamp);
  const api = await authedCtx(reg.accessToken);

  const kpi = (await (await api.post('/kpis', {
    data: { name: `Growth ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };
  for (const [m, v] of [['01', 100], ['02', 130], ['03', 175]] as const) {
    await api.post(`/kpis/${kpi.id}/data`, { data: { value: v, periodStart: `2026-${m}-01`, periodEnd: `2026-${m}-28` } });
  }
  const insight = (await (await api.post('/insights/generate', { data: { kpiId: kpi.id } })).json()) as { insight: { id: string } | null };
  expect(insight.insight).not.toBeNull();

  await injectTokens(page, reg);
  await page.goto('/insights');
  await expect(page.getByTestId(`insight-row-${insight.insight!.id}`)).toBeVisible({ timeout: 15_000 });
});

test('ask page returns an answer from a question', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(90_000);
  const stamp = suffix();
  const reg = await register(stamp);
  const api = await authedCtx(reg.accessToken);
  await api.post('/kpis', {
    data: { name: `MRR ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
  });

  await injectTokens(page, reg);
  await page.goto('/ask');
  await expect(page.getByTestId('ask-empty')).toBeVisible();
  await page.getByTestId('ask-input').fill('What KPIs do we track?');
  await page.getByTestId('ask-submit').click();
  // Live model — allow generous time for the answer bubble to render.
  await expect(page.getByTestId('ask-answer')).toBeVisible({ timeout: 60_000 });
});

test('ai settings page loads budget, configs, and BYO providers; cap is editable', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(60_000);
  const stamp = suffix();
  const reg = await register(stamp);

  await injectTokens(page, reg);
  await page.goto('/settings/ai');

  await expect(page.getByTestId('ai-budget-section')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('ai-config-NLQ_PRIMARY')).toBeVisible();
  await expect(page.getByTestId('ai-byo-GEMINI')).toBeVisible();

  // Edit the daily cap and save.
  const capResp = page.waitForResponse((r) => r.url().includes('/ai/budget') && r.request().method() === 'PATCH');
  await page.getByTestId('ai-daily-cap-input').fill('5');
  await page.getByTestId('ai-save-cap').click();
  expect((await capResp).status()).toBe(200);
});
