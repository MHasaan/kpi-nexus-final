/**
 * X-05 (plan 5.3): Tasks, OKRs and comments asked for the whole people list to
 * show a name. Someone without the people-list permission was refused it (a
 * 403 on every visit) and saw "—" or "Unknown user" where a colleague's name
 * should be.
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

test('someone who may not list people still sees their colleagues by name, and is refused nothing', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `ppl-${stamp}`,
      slug: `ppl-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@ppl.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const me = (await (await admin.get('/auth/me')).json()) as { user: { id: string } };
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string; permissions: string[] }>;
  const employeeRole = roles.find((r) => r.name === 'Employee')!;
  expect(employeeRole.permissions).not.toContain('USERS_VIEW');

  const invited = (await (await admin.post('/users', { data: { email: `eli-${stamp}@ppl.test.local`, fullName: 'Eli Employee', roleId: employeeRole.id } })).json()) as {
    inviteToken: string;
    user: { id: string };
  };
  const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
    accessToken: string;
    refreshToken: string;
  };

  const task = await admin.post('/tasks', { data: { title: `Chase invoices ${stamp}`, priority: 'HIGH', assigneeUserId: invited.user.id } }); // set by Ada, for Eli
  expect(task.status()).toBe(201);
  const objective = (await (await admin.post('/objectives', {
    data: { name: `Grow revenue ${stamp}`, ownerUserId: me.user.id, periodStart: '2026-01-01', periodEnd: '2026-12-31', status: 'ACTIVE' },
  })).json()) as { id: string };

  // The names endpoint itself: a name for an id, nothing more; not a list.
  const eli = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${tokens.accessToken}` } });
  expect((await eli.get('/users')).status()).toBe(403);
  const named = await eli.post('/users/names', { data: { ids: [me.user.id, 'no-such-id'] } });
  expect(named.status()).toBe(200);
  expect(await named.json()).toEqual([{ id: me.user.id, fullName: 'Ada Admin' }]);
  expect((await eli.post('/users/names', { data: {} })).status()).toBe(400);

  const eliPage = await signInAs(browser, tokens);
  const refused: string[] = [];
  eliPage.on('response', (r) => {
    if (r.url().startsWith(API_URL) && r.status() === 403) refused.push(`${r.request().method()} ${new URL(r.url()).pathname}`);
  });

  // Tasks: everyone on the board is named — the colleague who set the task too — and can be filtered by.
  await eliPage.goto('/tasks');
  await expect(eliPage.getByTestId('task-title').filter({ hasText: `Chase invoices ${stamp}` })).toBeVisible();
  await expect(eliPage.getByTestId('filter-assignee').locator('option')).toHaveText(['All assignees', 'Ada Admin', 'Eli Employee']);

  // OKRs: the owner is named on the list and on the objective.
  await eliPage.goto('/okrs');
  await expect(eliPage.getByTestId(`objective-${objective.id}`)).toBeVisible();
  await expect(eliPage.getByTestId('objective-grid')).toContainText('Ada Admin');
  await eliPage.goto(`/okrs/${objective.id}`);
  await expect(eliPage.getByText('Owner:')).toContainText('Ada Admin');

  expect(refused, 'nothing these pages ask for is refused').toEqual([]);
  await eliPage.context().close();
});
