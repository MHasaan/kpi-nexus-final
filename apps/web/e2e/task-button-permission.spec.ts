/**
 * QA-M2: creating a task needs KPI_VIEW on the API, but the page hid "New
 * task" from anyone without KPI_CREATE — so a contributor could move and edit
 * cards and use the quick-add, and had no button for the full form.
 */
import { expect, request, test, type Browser } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

async function signInAs(browser: Browser, tokens: { accessToken: string; refreshToken: string }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
      window.localStorage.setItem('kpi-nexus.tour-completed', '1');
    },
    [tokens.accessToken, tokens.refreshToken] as const,
  );
  return { context, page };
}

test('tasks: someone who may create a task through the API has the New task button', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `tsk-${stamp}`,
      slug: `tsk-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@tsk.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  // KPI_VIEW and nothing else: what the API asks for to create a task.
  const role = (await (await api.post('/roles', { data: { name: `Viewer ${stamp}`, permissions: ['KPI_VIEW'] } })).json()) as { id: string };
  const invited = (await (await api.post('/users', { data: { email: `viewer-${stamp}@tsk.test.local`, fullName: 'Vic Viewer', roleId: role.id } })).json()) as { inviteToken: string };
  const anon = await request.newContext({ baseURL: API_URL });
  const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as { accessToken: string; refreshToken: string };

  const viewer = await signInAs(browser, tokens);
  await viewer.page.goto('/tasks');
  await viewer.page.getByTestId('task-new').click();
  await viewer.page.getByTestId('task-create-title').fill(`From the form ${stamp}`);
  await viewer.page.getByTestId('task-create-submit').click();
  await expect(viewer.page.getByText(`From the form ${stamp}`)).toBeVisible();
  await viewer.context.close();
});
