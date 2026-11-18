/**
 * X-05 (remainder): the org units page and the KPI form asked the API for the
 * list of people on behalf of anyone — including someone who may not list
 * people, who drew a refusal (403) on every visit. They now ask only for what
 * the reader may have: the names of the people the page already holds.
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

test('someone who may not list people: the org units page and the KPI form ask for nothing they would be refused', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `plo-${stamp}`,
      slug: `plo-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@plo.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const me = (await (await admin.get('/auth/me')).json()) as { user: { id: string } };
  const unit = (await (await admin.post('/org-units', { data: { name: `Sales ${stamp}` } })).json()) as { id: string };
  expect((await admin.post(`/org-units/${unit.id}/members`, { data: { userId: me.user.id } })).status()).toBe(201);
  const kpi = (await (await admin.post('/kpis', { data: { name: `Margin ${stamp}`, scope: 'ORG_WIDE', ownerUserId: me.user.id } })).json()) as { id: string };

  // An editor of KPIs and viewer of units — with no USERS_VIEW.
  const role = (await (await admin.post('/roles', { data: { name: `Editor ${stamp}`, permissions: ['KPI_VIEW', 'KPI_EDIT', 'KPI_CREATE', 'GROUPS_VIEW'] } })).json()) as { id: string };
  const invited = (await (await admin.post('/users', { data: { email: `ed-${stamp}@plo.test.local`, fullName: 'Ed Editor', roleId: role.id } })).json()) as { inviteToken: string };
  const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as { accessToken: string; refreshToken: string };
  const editor = await signInAs(browser, tokens);
  const refused: string[] = [];
  editor.on('response', (r) => {
    if (r.status() === 403) refused.push(`${r.request().method()} ${new URL(r.url()).pathname}`);
  });

  // Org units: the unit's member is named, though the editor may not list people.
  await editor.goto('/org-units');
  await editor.getByTestId(`expand-unit-Sales ${stamp}`).click();
  await expect(editor.getByTestId(`unit-member-${me.user.id}`)).toContainText('Ada Admin');

  // The KPI form: the owner already on the KPI is named in the picker.
  await editor.goto(`/kpis/${kpi.id}/edit`);
  await expect(editor.getByTestId('kpi-owner')).toHaveValue(me.user.id);
  await expect(editor.getByTestId('kpi-owner').locator('option:checked')).toHaveText('Ada Admin');
  await expect(editor.getByTestId('kpi-people-note')).toContainText('people already named');

  await editor.goto('/kpis/new');
  await expect(editor.getByTestId('kpi-name')).toBeVisible();

  expect(refused, 'requests the API refused').toEqual([]);
  await editor.context().close();
});
