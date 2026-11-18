/**
 * Flow walk, 2026-11-19 (a manager). A per-person KPI's page showed a manager
 * "Latest value 22" — the figure of whichever team member recorded last, as if
 * it were the KPI's — and a trend line joining two different people's values.
 * Someone who sees several people's values now gets each person's figure.
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

test('per-person KPI page, seen by a manager: each person\'s value, target and attainment — not one person\'s as the KPI\'s', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `kbh-${stamp}`,
      slug: `kbh-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@kbh.test.local`,
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
      data: { email: `${fullName.split(' ')[0]!.toLowerCase()}-${stamp}@kbh.test.local`, fullName, roleId: roleId(role), managerId },
    })).json()) as { user: { id: string }; inviteToken: string };
    const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as { accessToken: string; refreshToken: string };
    return { id: invited.user.id, ...tokens };
  };
  const manager = await join('Maria Lopez', 'Manager');
  const omar = await join('Omar Sheikh', 'Employee', manager.id);
  const sana = await join('Sana Iqbal', 'Employee', manager.id);
  const kpi = (await (await admin.post('/kpis', { data: { name: `Calls ${stamp}`, scope: 'PER_USER', direction: 'HIGHER_IS_BETTER', userIds: [omar.id, sana.id] } })).json()) as { id: string };
  for (const [person, value] of [[omar, 44], [sana, 22]] as const) {
    expect((await admin.post('/user-kpis/assign', { data: { userId: person.id, kpiId: kpi.id, targetValue: 40 } })).status()).toBe(201);
    const own = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${person.accessToken}` } });
    const mine = (await (await own.get('/user-kpis/my-kpis')).json()) as Array<{ assignmentId: string }>;
    expect((await own.post(`/user-kpis/my-kpis/${mine[0]!.assignmentId}/data`, { data: { value, periodStart: '2026-11-01', periodEnd: '2026-11-30' } })).status()).toBe(201);
  }

  const view = await signInAs(browser, manager);
  await view.goto(`/kpis/${kpi.id}`);
  // No single "latest value", and no line drawn through different people's values.
  await expect(view.getByTestId('overview-latest')).toHaveText('Per person');
  await expect(view.getByTestId('overview-trend-caption')).toHaveCount(0);
  // Each person on their own line.
  const omarRow = view.getByTestId('holder-row-Omar Sheikh');
  await expect(omarRow).toContainText('44');
  await expect(omarRow).toContainText('40');
  await expect(omarRow).toContainText('110%');
  const sanaRow = view.getByTestId('holder-row-Sana Iqbal');
  await expect(sanaRow).toContainText('22');
  await expect(sanaRow).toContainText('55%');
  // The health card counts them instead of grading one.
  await expect(view.getByTestId('overview-health')).toContainText('2 people');
  await view.context().close();
});
