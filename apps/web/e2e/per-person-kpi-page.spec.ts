/**
 * Flow walk, 2026-11-18 (an invited member). A per-person KPI's page told the
 * member "No target set — set one under Edit", though their own target was 40,
 * and its "Record a value" button led to the Data tab — but a person records
 * their own value under My KPIs.
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

test('per-person KPI page: the member sees their own target and is sent to My KPIs to record; an administrator is told who records', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `ppk-${stamp}`,
      slug: `ppk-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@ppk.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const employee = ((await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>).find((r) => r.name === 'Employee')!;
  const invited = (await (await admin.post('/users', { data: { email: `omar-${stamp}@ppk.test.local`, fullName: 'Omar Sheikh', roleId: employee.id } })).json()) as { user: { id: string }; inviteToken: string };
  const kpi = (await (await admin.post('/kpis', { data: { name: `Calls ${stamp}`, scope: 'PER_USER', direction: 'HIGHER_IS_BETTER', userIds: [invited.user.id] } })).json()) as { id: string };
  expect((await admin.post('/user-kpis/assign', { data: { userId: invited.user.id, kpiId: kpi.id, targetValue: 40 } })).status()).toBe(201);
  const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as { accessToken: string; refreshToken: string };

  // The member: their own target, and the way to record.
  const member = await signInAs(browser, tokens);
  await member.goto(`/kpis/${kpi.id}`);
  await expect(member.getByTestId('overview-target')).toHaveText('40');
  await expect(member.getByTestId('overview-target-whose')).toHaveText('Your target');
  const first = member.getByTestId('overview-record-first');
  await expect(first).toContainText('My KPIs');
  await first.getByRole('link', { name: 'Record under My KPIs' }).click();
  await expect(member).toHaveURL(/\/my-kpis$/);

  // They record 30: their page shows it against their target.
  await member.getByTestId(`mykpi-${kpi.id}-value`).fill('30');
  await member.getByTestId(`mykpi-${kpi.id}-record`).click();
  await expect(member.getByTestId(`mykpi-current-${kpi.id}`)).toHaveText('30');
  await member.goto(`/kpis/${kpi.id}`);
  await expect(member.getByTestId('overview-latest')).toHaveText('30');
  await expect(member.getByTestId('overview-attainment')).toHaveText('75% of target');
  await expect(member.getByTestId('overview-record-first')).toHaveCount(0);
  await member.context().close();

  // The administrator holds no assignment: the page says targets are per person, and where they are.
  await page.goto(`/kpis/${kpi.id}`);
  await expect(page.getByTestId('overview-target')).toHaveText('Set per person');
  await expect(page.getByTestId('overview-target')).not.toHaveText('No target set');
});
