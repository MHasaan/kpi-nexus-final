/**
 * UI-018 (owner's decision, 2026-11-19). In organisation-level views a
 * per-person KPI was given one value — the newest of anyone the reader may see:
 * a manager's board pack listed "Sales calls made: 22", one team member's
 * figure. It now reads as a count of the people on track.
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

test('a per-person KPI reads as a count on track for a manager, and as their own value for its holder', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `sch-${stamp}`,
      slug: `sch-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@sch.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const roleId = (name: string) => roles.find((r) => r.name === name)!.id;
  const join = async (fullName: string, role: string, managerId?: string) => {
    const invited = (await (await admin.post('/users', {
      data: { email: `${fullName.split(' ')[0]!.toLowerCase()}-${stamp}@sch.test.local`, fullName, roleId: roleId(role), managerId },
    })).json()) as { user: { id: string }; inviteToken: string };
    const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as { accessToken: string; refreshToken: string };
    return { id: invited.user.id, ...tokens, api: await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${tokens.accessToken}` } }) };
  };
  const manager = await join('Maria Lopez', 'Manager');
  const omar = await join('Omar Sheikh', 'Employee', manager.id);
  const sana = await join('Sana Iqbal', 'Employee', manager.id);
  const name = `Calls ${stamp}`;
  const kpi = (await (await admin.post('/kpis', { data: { name, scope: 'PER_USER', direction: 'HIGHER_IS_BETTER', userIds: [omar.id, sana.id] } })).json()) as { id: string };
  const today = new Date().toISOString().slice(0, 10);
  for (const [person, value] of [[omar, 44], [sana, 22]] as const) {
    expect((await admin.post('/user-kpis/assign', { data: { userId: person.id, kpiId: kpi.id, targetValue: 40 } })).status()).toBe(201);
    const mine = (await (await person.api.get('/user-kpis/my-kpis')).json()) as Array<{ assignmentId: string }>;
    expect((await person.api.post(`/user-kpis/my-kpis/${mine[0]!.assignmentId}/data`, { data: { value, periodStart: `${today.slice(0, 8)}01`, periodEnd: today } })).status()).toBe(201);
  }

  // The API: the manager's row counts her people and carries no value; the holder's row is their own.
  const rowFor = async (api: typeof manager.api) =>
    ((await (await api.get('/kpis/dashboard-summary')).json()) as Array<{ kpiId: string; latestValue: number | null; status: string; holders: unknown }>).find((r) => r.kpiId === kpi.id)!;
  expect(await rowFor(manager.api)).toMatchObject({ latestValue: null, status: 'AT_RISK', holders: { total: 2, withValue: 2, onTrack: 1 } });
  expect(await rowFor(omar.api)).toMatchObject({ latestValue: 44, holders: null });

  // The manager's home page and board pack.
  const view = await signInAs(browser, manager);
  await view.goto('/dashboard');
  await expect(view.getByTestId(`dashboard-card-holders-${name}`)).toHaveText('1 of 2 people on track');
  await view.goto('/reports/board-pack');
  const line = view.locator('li').filter({ hasText: name });
  await expect(line).toContainText('1 of 2 people on track');
  // Sana's own figure (22) is not on the line. The KPI's name is set aside first: it carries a
  // timestamp and a random tail, and either may hold "22" — which failed this check now and then.
  expect((await line.innerText()).replace(name, '')).not.toContain('22');
  await view.context().close();
});
