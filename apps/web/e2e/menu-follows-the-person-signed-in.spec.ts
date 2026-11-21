/**
 * Manual QA (2026-11-19, F-011 and F-050): accepting an invitation in a browser where another person had been
 * signed in showed that person's menu, because the browser kept the old session's permissions and page-access
 * rules and drew them first. And a page an administrator hid for a role stayed in the menu, where every click
 * ended at "You don't have access". The menu now belongs to the person signed in, and a hidden page leaves
 * the menu with the next page they open.
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('the menu belongs to the person who just signed in, and loses a page once it is hidden', async ({ page }) => {
  test.setTimeout(90_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const api = await request.newContext({ baseURL: API_URL });
  const reg = await api.post('/auth/register', {
    data: { orgName: `menu-${stamp}`, slug: `menu-${stamp}`, adminEmail: `admin-${stamp}@menu.test.local`, adminPassword: 'correct-horse-battery-staple', adminFullName: 'Mia Admin' },
  });
  if (reg.status() !== 201) {
    test.skip(true, 'api not reachable');
    return;
  }
  const { accessToken } = (await reg.json()) as { accessToken: string };
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${accessToken}` } });
  const auditor = (await (await admin.post('/roles', { data: { name: `Auditor ${stamp}`, permissions: ['KPI_VIEW', 'DASHBOARD_VIEW', 'USERS_VIEW', 'AUDIT_VIEW'] } })).json()) as { id: string };
  // An Employee who may also use the AI pages: Ask is in his menu, People and Audit are not.
  const analyst = (await (await admin.post('/roles', { data: { name: `Analyst ${stamp}`, permissions: ['KPI_VIEW', 'KPI_DATA_ENTRY', 'DASHBOARD_VIEW', 'ALERTS_VIEW', 'INSIGHTS_VIEW'] } })).json()) as { id: string };
  const invite = async (fullName: string, roleId: string) => {
    const res = await admin.post('/users', { data: { email: `${fullName.toLowerCase().replace(/\s+/g, '.')}-${stamp}@menu.test.local`, fullName, roleId } });
    expect(res.status(), await res.text()).toBe(201);
    const { inviteToken } = (await res.json()) as { inviteToken?: string };
    expect(inviteToken, 'the API hands the invite link back outside production').toBeTruthy();
    return inviteToken!;
  };
  const accept = async (token: string) => {
    await page.goto(`/accept-invitation?token=${token}`);
    await page.getByTestId('invite-password').fill('correct-horse-battery-staple');
    await page.getByTestId('invite-confirm-password').fill('correct-horse-battery-staple');
    await page.getByTestId('invite-submit').click();
    await expect(page).toHaveURL(/\/dashboard/);
  };

  const nav = page.getByRole('navigation', { name: 'Primary' });
  // "Ask" by its test id: a name match would also take "Tasks".
  const ask = page.getByTestId('nav-ask');
  // Jack, an Analyst: Ask, but no People and no Audit.
  await accept(await invite('Jack Turner', analyst.id));
  await expect(ask).toBeVisible();
  await expect(page.getByTestId('nav-audit')).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'People', exact: true })).toHaveCount(0);

  // Victor, an Auditor, in the same browser: his menu, not Jack's.
  await accept(await invite('Victor Hale', auditor.id));
  await expect(page.getByTestId('nav-audit')).toBeVisible();
  await expect(nav.getByRole('link', { name: 'People', exact: true })).toBeVisible();
  await expect(ask).toHaveCount(0);

  // Back to an Analyst. The administrator hides Ask for analysts while Jack is signed in; the next page he opens
  // no longer offers it.
  await accept(await invite('Jack Second', analyst.id));
  await expect(ask).toBeVisible();
  expect((await admin.patch(`/roles/${analyst.id}`, { data: { pageAccess: { allow: null, deny: ['/ask'] } } })).status()).toBeLessThan(300);
  await page.goto('/kpis');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(ask).toHaveCount(0);
});
