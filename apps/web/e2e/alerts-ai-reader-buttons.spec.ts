/**
 * UI-013 (plan 5.2, Alerts / AI): the new-rule page opened for anyone who
 * could read alerts and then refused its own Save (the API asks for KPI_EDIT);
 * a recommendation's "Actioned" and "Dismiss" were offered to every reader and
 * refused for the same reason.
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

test('a reader of alerts and recommendations is offered nothing the API would refuse', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `aar-${stamp}`,
      slug: `aar-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@aar.test.local`,
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
  const generated = await admin.post('/recommendations/generate', { data: { kpiId: kpi.id } });
  test.skip(generated.status() !== 201, 'AI provider not available');
  const rec = (await generated.json()) as { id: string };

  // Someone who may act on a recommendation and write rules sees the buttons and the form.
  await page.goto('/recommendations');
  await expect(page.getByTestId(`rec-action-${rec.id}`)).toBeVisible();
  await expect(page.getByTestId(`rec-dismiss-${rec.id}`)).toBeVisible();
  await page.goto('/alerts/new');
  await expect(page.getByTestId('new-rule-form')).toBeVisible();

  // A reader: alerts and insights, no KPI_EDIT.
  const role = await admin.post('/roles', { data: { name: `Reader ${stamp}`, permissions: ['KPI_VIEW', 'ALERTS_VIEW', 'INSIGHTS_VIEW'] } });
  expect(role.status()).toBe(201);
  const invited = (await (await admin.post('/users', {
    data: { email: `rea-${stamp}@aar.test.local`, fullName: 'Rea Reader', roleId: ((await role.json()) as { id: string }).id },
  })).json()) as { inviteToken: string };
  const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
    accessToken: string;
    refreshToken: string;
  };
  const reader = await signInAs(browser, tokens);
  const refused: string[] = [];
  reader.on('response', (r) => {
    if (r.url().startsWith(API_URL) && r.status() === 403) refused.push(`${r.request().method()} ${new URL(r.url()).pathname}`);
  });

  await reader.goto('/recommendations');
  await expect(reader.getByTestId(`rec-row-${rec.id}`)).toBeVisible();
  await expect(reader.getByTestId(`rec-action-${rec.id}`)).toHaveCount(0);
  await expect(reader.getByTestId(`rec-dismiss-${rec.id}`)).toHaveCount(0);

  // The rule form is not theirs to open: turned away before anything is asked of the API.
  await reader.goto('/alerts/new');
  await expect(reader).toHaveURL(/\/unauthorized$/);
  // They can still read the rules and the alerts.
  await reader.goto('/alerts/rules');
  await expect(reader.getByTestId('alert-rules-heading')).toBeVisible();

  expect(refused).toEqual([]);
  await reader.context().close();
});
