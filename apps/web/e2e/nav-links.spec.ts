/**
 * UI-012 (plan 5.1): My KPIs, My team, Automations, Connectors, Plugins and
 * Billing existed and nothing led to them; the mentions bell never said there
 * was anything to read.
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

test('navigation: every page has a link, for those who may open it; the mentions bell counts', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `nav-${stamp}`,
      slug: `nav-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@nav.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });

  // The administrator: each link is there and opens its page, not /unauthorized.
  await page.goto('/dashboard');
  for (const [testId, path] of [
    ['nav-my-kpis', '/my-kpis'],
    ['nav-team', '/team'],
    ['nav-workflows', '/workflows'],
    ['nav-connectors', '/connectors'],
    ['nav-plugins', '/plugins'],
    ['nav-billing', '/billing'],
  ] as const) {
    await page.getByTestId(testId).click();
    await expect(page, `${testId} opens ${path}`).toHaveURL(new RegExp(`${path}$`));
    // The link is marked as the current page — except on Plugins, which does
    // not draw the sidebar yet (plan 5.5).
    if (path !== '/plugins') await expect(page.getByTestId(testId)).toHaveAttribute('aria-current', 'page');
    await page.goto('/dashboard');
  }
  await expect(page.getByTestId('mentions-badge')).toHaveCount(0); // nothing to read yet

  // An employee: their own pages, none of the administrator's.
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const invited = (await (await admin.post('/users', {
    data: { email: `emp-${stamp}@nav.test.local`, fullName: 'Eli Employee', roleId: roles.find((r) => r.name === 'Employee')!.id },
  })).json()) as { inviteToken: string; user: { id: string } };
  const employee = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
    accessToken: string;
    refreshToken: string;
  };
  const employeePage = await signInAs(browser, employee);
  await employeePage.goto('/dashboard');
  await expect(employeePage.getByTestId('nav-my-kpis')).toBeVisible();
  await expect(employeePage.getByTestId('nav-team')).toBeVisible();
  for (const hidden of ['nav-workflows', 'nav-connectors', 'nav-plugins', 'nav-billing']) {
    await expect(employeePage.getByTestId(hidden)).toHaveCount(0);
  }

  // The administrator mentions the employee: the employee's bell shows one.
  const kpi = (await (await admin.post('/kpis', { data: { name: `Nav ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  const comment = await admin.post('/comments', { data: { entityType: 'kpi', entityId: kpi.id, body: 'please look @Eli', mentionedUserIds: [invited.user.id] } });
  expect(comment.status(), 'comment with a mention').toBe(201);
  await employeePage.reload();
  await expect(employeePage.getByTestId('mentions-badge')).toHaveText('1');
  await expect(employeePage.getByTestId('mentions-bell')).toHaveAttribute('aria-label', 'Mentions, 1 unread');
  await employeePage.context().close();
});
