/**
 * X-05 (remainder): someone who may not list people could pick only themselves
 * and the people a page already named — an Employee could not give a task to a
 * colleague who was on no task yet. Owner decision 2026-11-20: they may find a
 * colleague by name, names only, the way a mention already does. Each people
 * picker has a "Find a colleague by name" box under it; what it finds is a name
 * and nothing else, and picking it chooses that person.
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

/** An organisation with Farah in it, and a signed-in member of the given role who may not list people. */
async function setUp(page: Page, browser: Browser, roleFor: (admin: Awaited<ReturnType<typeof request.newContext>>, stamp: string) => Promise<string>) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const session = await registerOrgViaApi(page, {
    orgName: `fcn-${stamp}`,
    slug: `fcn-${stamp}`,
    adminFullName: 'Ada Admin',
    adminEmail: `admin-${stamp}@fcn.test.local`,
    adminPassword: PASSWORD,
  });
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const join = async (fullName: string, email: string, roleId: string) => {
    const invited = (await (await admin.post('/users', { data: { email, fullName, roleId } })).json()) as { user: { id: string }; inviteToken: string };
    const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as { accessToken: string; refreshToken: string };
    return { id: invited.user.id, tokens };
  };
  const farah = await join(`Farah Field ${stamp}`, `farah-${stamp}@fcn.test.local`, roles.find((r) => r.name === 'Employee')!.id);
  const member = await join(`Esa Member ${stamp}`, `esa-${stamp}@fcn.test.local`, await roleFor(admin, stamp));
  const view = await signInAs(browser, member.tokens);
  const refused: string[] = [];
  view.on('response', (r) => {
    if (r.status() === 403) refused.push(`${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  return { stamp, admin, farah, view, refused };
}

/** Type a name into the find box under a picker and pick the one person it finds. */
async function findAndPick(view: Page, picker: string, typed: string, fullName: string) {
  await view.getByTestId(`${picker}-find-input`).fill(typed);
  const results = view.getByTestId(`${picker}-find-results`);
  await expect(results.getByRole('button', { name: fullName })).toBeVisible();
  // Names only: no email comes back from the look-up, so none is shown.
  await expect(results).not.toContainText('@');
  await results.getByRole('button', { name: fullName }).click();
}

test('an Employee gives a task to a colleague found by name', async ({ page, browser }) => {
  test.setTimeout(90_000);
  let ctx: Awaited<ReturnType<typeof setUp>>;
  try {
    ctx = await setUp(page, browser, async (admin) => ((await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>).find((r) => r.name === 'Employee')!.id);
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const { stamp, admin, farah, view, refused } = ctx;

  await view.goto('/tasks');
  await view.getByTestId('task-new').click();
  await view.getByTestId('task-create-title').fill(`Call the bank ${stamp}`);
  // Farah is on no task yet: the list holds only the Employee themself.
  await expect(view.getByTestId('task-create-assignee').locator(`option[value="${farah.id}"]`)).toHaveCount(0);
  await findAndPick(view, 'task-create-assignee', 'Farah', `Farah Field ${stamp}`);
  await expect(view.getByTestId('task-create-assignee')).toHaveValue(farah.id);
  await view.getByTestId('task-create-submit').click();

  await expect
    .poll(async () => ((await (await admin.get('/tasks')).json()) as Array<{ title: string; assigneeUserId: string | null }>).find((t) => t.title === `Call the bank ${stamp}`)?.assigneeUserId)
    .toBe(farah.id);
  expect(refused, 'requests the API refused').toEqual([]);
  await view.context().close();
});

test('an editor who may not list people finds the owner of a KPI and of an objective by name', async ({ page, browser }) => {
  test.setTimeout(120_000);
  let ctx: Awaited<ReturnType<typeof setUp>>;
  try {
    // An editor of KPIs and viewer of units, as in people-list-only-when-allowed — with no USERS_VIEW.
    ctx = await setUp(page, browser, async (admin, stamp) =>
      ((await (await admin.post('/roles', { data: { name: `Editor ${stamp}`, permissions: ['KPI_VIEW', 'KPI_CREATE', 'KPI_EDIT', 'GROUPS_VIEW'] } })).json()) as { id: string }).id,
    );
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const { stamp, admin, farah, view, refused } = ctx;
  const kpi = (await (await admin.post('/kpis', { data: { name: `Margin ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };

  // A KPI's owner.
  await view.goto(`/kpis/${kpi.id}/edit`);
  await expect(view.getByTestId('kpi-people-note')).toContainText('find anyone else by name');
  await findAndPick(view, 'kpi-owner', 'farah', `Farah Field ${stamp}`);
  await expect(view.getByTestId('kpi-owner')).toHaveValue(farah.id);
  await view.getByTestId('kpi-submit').click();
  await expect.poll(async () => ((await (await admin.get(`/kpis/${kpi.id}`)).json()) as { ownerUserId: string | null }).ownerUserId).toBe(farah.id);

  // A new objective's owner.
  await view.goto('/okrs');
  await view.getByTestId('okr-create-name').fill(`Grow margin ${stamp}`);
  await findAndPick(view, 'okr-create-owner', 'Far', `Farah Field ${stamp}`);
  await expect(view.getByTestId('okr-create-owner')).toHaveValue(farah.id);
  await view.getByTestId('okr-create-submit').click();
  await expect
    .poll(async () => ((await (await admin.get('/objectives')).json()) as Array<{ name: string; ownerUserId: string }>).find((o) => o.name === `Grow margin ${stamp}`)?.ownerUserId)
    .toBe(farah.id);

  // A name that is no one's says so; text that is not a name is not sent at all.
  await view.goto('/okrs');
  await view.getByTestId('okr-create-owner-find-input').fill('Zzyzx');
  await expect(view.getByTestId('okr-create-owner-find-none')).toHaveText('No colleague by that name.');
  await view.getByTestId('okr-create-owner-find-input').fill('farah@');
  await expect(view.getByTestId('okr-create-owner-find-hint')).toContainText('letters');
  expect(refused, 'requests the API refused').toEqual([]);
  await view.context().close();
});
