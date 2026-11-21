/**
 * Manual QA (2026-11-19, F-051): a read-only person could make, rotate and revoke public embed links for a KPI,
 * publishing its figures outside the app. Embed links now take REPORTS_MANAGE: the Embed tab, the page and
 * the API refuse everyone else.
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

test('embed links: a reader gets no Embed tab, page or token; someone who manages reports gets all three', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `embed-${stamp}`,
      slug: `embed-${stamp}`,
      adminFullName: 'Ember Admin',
      adminEmail: `admin-${stamp}@embed.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const kpi = (await (await admin.post('/kpis', { data: { name: `MRR ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY' } })).json()) as { id: string };

  const join = async (label: string, permissions: string[]) => {
    const role = (await (await admin.post('/roles', { data: { name: `${label} ${stamp}`, permissions } })).json()) as { id: string };
    const invited = (await (await admin.post('/users', {
      data: { email: `${label.toLowerCase()}-${stamp}@embed.test.local`, fullName: `${label} Person`, roleId: role.id },
    })).json()) as { inviteToken: string };
    const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
      accessToken: string;
      refreshToken: string;
    };
    const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${tokens.accessToken}` } });
    return { page: await signInAs(browser, tokens), api };
  };

  // A reader: may look at the KPI and its analytics, and read reports, but not publish anything.
  const reader = await join('Reader', ['KPI_VIEW', 'ANALYTICS_VIEW', 'ANALYTICS_FORECAST', 'REPORTS_VIEW']);
  await reader.page.goto(`/kpis/${kpi.id}/forecast`);
  const readerNav = reader.page.getByTestId('analytics-nav');
  await expect(readerNav.getByRole('link', { name: 'Forecast', exact: true })).toBeVisible();
  await expect(readerNav.getByRole('link', { name: 'Embed', exact: true })).toHaveCount(0);
  await reader.page.goto(`/kpis/${kpi.id}/embed`);
  await expect(reader.page).toHaveURL(/\/unauthorized/);
  expect((await reader.api.post(`/reports/kpis/${kpi.id}/embed-token`, { data: {} })).status()).toBe(403);
  expect((await reader.api.post(`/reports/kpis/${kpi.id}/embed-token/revoke`, { data: {} })).status()).toBe(403);

  // Someone who manages reports: the tab, the page and a token.
  const publisher = await join('Publisher', ['KPI_VIEW', 'ANALYTICS_FORECAST', 'REPORTS_MANAGE']);
  await publisher.page.goto(`/kpis/${kpi.id}/forecast`);
  await expect(publisher.page.getByTestId('analytics-nav').getByRole('link', { name: 'Embed', exact: true })).toBeVisible();
  await publisher.page.goto(`/kpis/${kpi.id}/embed`);
  await expect(publisher.page.getByTestId('embed-generate-btn')).toBeVisible();
  await publisher.page.getByTestId('embed-generate-btn').click();
  await expect(publisher.page.getByTestId('embed-token-output')).toBeVisible();
  expect((await publisher.api.post(`/reports/kpis/${kpi.id}/embed-token`, { data: {} })).status()).toBe(201);
});
