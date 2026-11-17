/**
 * UI-013 (plan 5.2, forecast / what-if; signed off 2026-11-17): the pages
 * asked for ANALYTICS_VIEW and the API for INSIGHTS_VIEW, while a key made for
 * exactly this — ANALYTICS_FORECAST — gated nothing. Both sides now use it.
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

test('forecast and what-if follow ANALYTICS_FORECAST on the page, the link and the API', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `fcp-${stamp}`,
      slug: `fcp-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@fcp.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const kpi = (await (await admin.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };

  const join = async (label: string, permissions: string[]) => {
    const role = await admin.post('/roles', { data: { name: `${label} ${stamp}`, permissions } });
    expect(role.status(), `${label} role`).toBe(201);
    const invited = (await (await admin.post('/users', {
      data: { email: `${label.toLowerCase()}-${stamp}@fcp.test.local`, fullName: `${label} Person`, roleId: ((await role.json()) as { id: string }).id },
    })).json()) as { inviteToken: string };
    const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
      accessToken: string;
      refreshToken: string;
    };
    return {
      page: await signInAs(browser, tokens),
      api: await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${tokens.accessToken}` } }),
    };
  };

  // Holds the forecast key and nothing else analytic: both links, both pages, and the API lets them in.
  const forecaster = await join('Forecaster', ['KPI_VIEW', 'ANALYTICS_FORECAST']);
  await forecaster.page.goto(`/kpis/${kpi.id}`);
  await expect(forecaster.page.getByTestId('kpi-analytics-forecast')).toBeVisible();
  await expect(forecaster.page.getByTestId('kpi-analytics-whatif')).toBeVisible();
  await expect(forecaster.page.getByTestId('kpi-analytics-anomalies')).toHaveCount(0);
  await forecaster.page.getByTestId('kpi-analytics-forecast').click();
  await expect(forecaster.page.getByTestId('fc-run')).toBeVisible();
  await forecaster.page.goto(`/kpis/${kpi.id}/whatif`);
  await expect(forecaster.page).toHaveURL(/\/whatif$/);
  // Past the permission gate: no values yet, so "not enough data" — not "forbidden".
  expect((await forecaster.api.post(`/kpis/${kpi.id}/forecasts`, { data: { horizon: 3 } })).status()).not.toBe(403);
  expect((await forecaster.api.get(`/kpis/${kpi.id}/forecasts`)).status()).toBe(200);
  await forecaster.page.context().close();

  // Holds the two keys that used to be enough, without the forecast key: no links, no pages, 403 from the API.
  const analyst = await join('Analyst', ['KPI_VIEW', 'ANALYTICS_VIEW', 'INSIGHTS_VIEW']);
  await analyst.page.goto(`/kpis/${kpi.id}`);
  await expect(analyst.page.getByTestId('kpi-analytics-anomalies')).toBeVisible();
  await expect(analyst.page.getByTestId('kpi-analytics-forecast')).toHaveCount(0);
  await expect(analyst.page.getByTestId('kpi-analytics-whatif')).toHaveCount(0);
  for (const sub of ['forecast', 'whatif']) {
    await analyst.page.goto(`/kpis/${kpi.id}/${sub}`);
    await expect(analyst.page, `${sub} turns them away`).toHaveURL(/\/unauthorized$/);
  }
  expect((await analyst.api.post(`/kpis/${kpi.id}/forecasts`, { data: { horizon: 3 } })).status()).toBe(403);
  expect((await analyst.api.get(`/kpis/${kpi.id}/forecasts`)).status()).toBe(403);
  expect((await analyst.api.post(`/kpis/${kpi.id}/whatif`, { data: { scenarios: [{ name: 'x', adjustmentPct: 10 }] } })).status()).toBe(403);
  await analyst.page.context().close();
});
