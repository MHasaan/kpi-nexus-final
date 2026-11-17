/**
 * UI-013 (plan 5.2, Ask): the page and its sidebar link asked for
 * ANALYTICS_VIEW while the API it calls asks for INSIGHTS_VIEW. Someone with
 * only the first got a page whose every question failed; someone with only the
 * second — who may ask — had no link and was turned away.
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

test('Ask opens for those the API will answer, and only for them', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `ask-${stamp}`,
      slug: `ask-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@ask.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const join = async (roleName: string, permissions: string[]) => {
    const role = await admin.post('/roles', { data: { name: `${roleName} ${stamp}`, permissions } });
    expect(role.status(), `${roleName} role`).toBe(201);
    const invited = (await (await admin.post('/users', {
      data: { email: `${roleName.toLowerCase()}-${stamp}@ask.test.local`, fullName: `${roleName} Person`, roleId: ((await role.json()) as { id: string }).id },
    })).json()) as { inviteToken: string };
    return (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
      accessToken: string;
      refreshToken: string;
    };
  };

  // May ask (the API's key), has no analytics key: the link is there and the page opens.
  const reader = await signInAs(browser, await join('Reader', ['KPI_VIEW', 'INSIGHTS_VIEW']));
  await reader.goto('/dashboard');
  await reader.getByTestId('nav-ask').click();
  await expect(reader).toHaveURL(/\/ask$/);
  await expect(reader.getByTestId('ask-empty')).toBeVisible();
  await reader.context().close();

  // Has the analytics key but may not ask: no link, and the page turns them away without asking the API anything it will refuse.
  const analyst = await signInAs(browser, await join('Analyst', ['KPI_VIEW', 'ANALYTICS_VIEW']));
  await analyst.goto('/dashboard');
  await expect(analyst.getByTestId('nav-kpis')).toBeVisible();
  await expect(analyst.getByTestId('nav-ask')).toHaveCount(0);
  // From here on: nothing the Ask page does may be refused by the API.
  const refused: string[] = [];
  analyst.on('response', (r) => {
    if (r.url().startsWith(API_URL) && r.status() === 403) refused.push(new URL(r.url()).pathname);
  });
  await analyst.goto('/ask');
  await expect(analyst).toHaveURL(/\/unauthorized/);
  expect(refused).toEqual([]);
  await analyst.context().close();
});
