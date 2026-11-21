/**
 * Manual QA (2026-11-19, F-055): any employee with KPI_DATA_ENTRY could write values on every organisation-wide
 * KPI (ARR, MRR, churn…). An organisation-wide value is now the KPI's owner's or an administrator's to record:
 * the API refuses everyone else, and the Data tab tells them so instead of offering the form.
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

test('an organisation-wide value is recorded by the KPI’s owner or an administrator, not by every employee', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `own-${stamp}`,
      slug: `own-${stamp}`,
      adminFullName: 'Ola Admin',
      adminEmail: `admin-${stamp}@own.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const employee = roles.find((r) => r.name === 'Employee')!;
  const join = async (name: string) => {
    const invited = (await (await admin.post('/users', { data: { email: `${name.toLowerCase()}-${stamp}@own.test.local`, fullName: `${name} Person`, roleId: employee.id } })).json()) as { user: { id: string }; inviteToken: string };
    const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as { accessToken: string; refreshToken: string };
    return { id: invited.user.id, tokens, api: await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${tokens.accessToken}` } }) };
  };
  const olivia = await join('Olivia');
  const jack = await join('Jack');
  const kpi = (await (await admin.post('/kpis', { data: { name: `MRR ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY', ownerUserId: olivia.id } })).json()) as { id: string };
  const value = { value: 236_500, periodStart: '2026-11-01', periodEnd: '2026-11-30' };

  // Jack, an employee who may record values, is not this KPI's owner.
  const refused = await jack.api.post(`/kpis/${kpi.id}/data`, { data: value });
  expect(refused.status()).toBe(403);
  expect(((await refused.json()) as { message: string }).message).toMatch(/owner or an administrator/i);
  const jackPage = await signInAs(browser, jack.tokens);
  await jackPage.goto(`/kpis/${kpi.id}?tab=data`);
  await expect(jackPage.getByTestId('data-owner-only')).toContainText(/owner or an administrator/i);
  await expect(jackPage.getByTestId('data-value')).toHaveCount(0);

  // Olivia, the owner, records it from the form; the administrator may too.
  const oliviaPage = await signInAs(browser, olivia.tokens);
  await oliviaPage.goto(`/kpis/${kpi.id}?tab=data`);
  await expect(oliviaPage.getByTestId('data-owner-only')).toHaveCount(0);
  await expect(oliviaPage.getByTestId('data-value')).toBeVisible();
  expect((await olivia.api.post(`/kpis/${kpi.id}/data`, { data: value })).status()).toBe(201);
  expect((await admin.post(`/kpis/${kpi.id}/data`, { data: { ...value, periodStart: '2026-10-01', periodEnd: '2026-10-31' } })).status()).toBe(201);
});
