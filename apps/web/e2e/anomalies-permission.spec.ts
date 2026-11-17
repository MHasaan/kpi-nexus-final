/**
 * UI-013 (plan 5.2, anomalies; signed off 2026-11-17): the anomalies page
 * asked for ANALYTICS_VIEW and its API for INSIGHTS_VIEW, so each key alone
 * got half of it; and Confirm was offered to readers though the API asks for
 * KPI_EDIT.
 */
import { type Browser, type Page, expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

async function signInAs(browser: Browser, tokens: { accessToken: string; refreshToken: string }): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: 'kpi-nexus.tour-completed', value: '1' }] }] },
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [tokens.accessToken, tokens.refreshToken] as const,
  );
  return page;
}

test('anomalies follow ANALYTICS_VIEW on the page and the API; Confirm needs KPI_EDIT', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `anp-${stamp}`,
      slug: `anp-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@anp.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const kpi = (await (await admin.post('/kpis', {
    data: { name: `Latency ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'LOWER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };
  const values = [10, 11, 9, 10, 12, 8, 10, 11, 9, 100, 10, 9];
  for (const [i, value] of values.entries()) {
    const m = String(i + 1).padStart(2, '0');
    await admin.post(`/kpis/${kpi.id}/data`, { data: { value, periodStart: `2026-${m}-01`, periodEnd: `2026-${m}-28` } });
  }
  // One saved anomaly, so there is something to confirm.
  const detected = await admin.post(`/kpis/${kpi.id}/anomalies/detect`, { data: { method: 'zscore', persist: true } });
  test.skip(!detected.ok(), 'ML sidecar not reachable');

  const join = async (label: string, permissions: string[]) => {
    const role = await admin.post('/roles', { data: { name: `${label} ${stamp}`, permissions } });
    expect(role.status(), `${label} role`).toBe(201);
    const invited = (await (await admin.post('/users', {
      data: { email: `${label.toLowerCase()}-${stamp}@anp.test.local`, fullName: `${label} Person`, roleId: ((await role.json()) as { id: string }).id },
    })).json()) as { inviteToken: string };
    const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
      accessToken: string;
      refreshToken: string;
    };
    const p = await signInAs(browser, tokens);
    const refused: string[] = [];
    p.on('response', (r) => {
      if (r.url().startsWith(API_URL) && r.status() === 403 && r.url().includes('/anomalies')) refused.push(`${r.request().method()} ${new URL(r.url()).pathname}`);
    });
    return { page: p, refused, api: await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${tokens.accessToken}` } }) };
  };

  // The analytics key alone: the page works end to end; saved anomalies are listed; no Confirm.
  const analyst = await join('Analyst', ['KPI_VIEW', 'ANALYTICS_VIEW']);
  await analyst.page.goto(`/kpis/${kpi.id}/anomalies`);
  await expect(analyst.page.getByTestId('anom-chart')).toBeVisible({ timeout: 15_000 });
  await expect(analyst.page.locator('[data-testid^="anom-unconfirmed-"]').first()).toBeVisible();
  await expect(analyst.page.locator('[data-testid^="anom-confirm-"]')).toHaveCount(0);
  await analyst.page.getByTestId('anom-detect').click();
  await expect(analyst.page.getByTestId('anom-detected')).toBeVisible({ timeout: 15_000 });
  expect(analyst.refused).toEqual([]);
  await analyst.page.context().close();

  // With KPI_EDIT too: Confirm is there and works.
  const editor = await join('Editor', ['KPI_VIEW', 'ANALYTICS_VIEW', 'KPI_EDIT']);
  await editor.page.goto(`/kpis/${kpi.id}/anomalies`);
  const confirm = editor.page.locator('[data-testid^="anom-confirm-"]').first();
  await confirm.click();
  await expect(editor.page.locator('[data-testid^="anom-confirmed-"]').first()).toBeVisible({ timeout: 10_000 });
  expect(editor.refused).toEqual([]);
  await editor.page.context().close();

  // The insights key alone used to reach the API; it is the analytics key now, on both sides.
  const insights = await join('Insights', ['KPI_VIEW', 'INSIGHTS_VIEW']);
  expect((await insights.api.get(`/kpis/${kpi.id}/anomalies`)).status()).toBe(403);
  expect((await insights.api.post(`/kpis/${kpi.id}/anomalies/detect`, { data: { method: 'zscore' } })).status()).toBe(403);
  await insights.page.goto(`/kpis/${kpi.id}/anomalies`);
  await expect(insights.page).toHaveURL(/\/unauthorized$/);
  expect(insights.refused, 'turned away without asking the API').toEqual([]);
  await insights.page.context().close();
});
