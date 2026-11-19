/**
 * Flow walk (KPI form): someone who may create KPIs but not view units (GROUPS_VIEW) drew a refused
 * request for the unit list on every visit to the form, and choosing "Per unit" told them "No org units
 * yet. Create one first" — with a link to a page they cannot open — though the organisation had units.
 * The form now asks for units only from someone who may see them, and tells everyone else why they
 * cannot choose any.
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

test('the KPI form asks for units only from someone who may see them, and says why the others cannot choose any', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `kfu-${stamp}`,
      slug: `kfu-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@kfu.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  // The organisation has a unit.
  expect((await admin.post('/org-units', { data: { name: `Sales ${stamp}` } })).status()).toBe(201);
  // Someone who may create KPIs, and may not view units.
  const role = (await (await admin.post('/roles', { data: { name: `Maker ${stamp}`, permissions: ['KPI_VIEW', 'KPI_CREATE'] } })).json()) as { id: string };
  const invited = (await (await admin.post('/users', { data: { email: `mo-${stamp}@kfu.test.local`, fullName: 'Mo Maker', roleId: role.id } })).json()) as { inviteToken: string };
  const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as { accessToken: string; refreshToken: string };
  const maker = await signInAs(browser, tokens);
  const refused: string[] = [];
  maker.on('response', (r) => {
    if (r.status() === 403) refused.push(`${r.request().method()} ${new URL(r.url()).pathname}`);
  });

  await maker.goto('/kpis/new');
  await expect(maker.getByTestId('kpi-name')).toBeVisible();
  await maker.getByTestId('kpi-scope').selectOption('PER_UNIT');
  const picker = maker.getByTestId('kpi-orgunit-picker');
  await expect(picker.getByTestId('kpi-orgunit-hidden')).toContainText('needs permission to see your organisation’s units');
  await expect(picker).not.toContainText('No org units yet');
  await expect(picker.getByRole('link', { name: 'Create one' })).toHaveCount(0);
  expect(refused, 'requests the API refused').toEqual([]);
  await maker.context().close();

  // Someone who may see units still gets them to choose from.
  await page.goto('/kpis/new');
  await page.getByTestId('kpi-scope').selectOption('PER_UNIT');
  await expect(page.getByTestId('kpi-orgunit-picker')).toContainText(`Sales ${stamp}`);
  await expect(page.getByTestId('kpi-orgunit-hidden')).toHaveCount(0);
});
