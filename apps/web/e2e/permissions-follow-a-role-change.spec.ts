/**
 * Flow walk: what a person may do was read once and kept in the browser, and
 * never checked again. When an administrator changed their role, their menu
 * and buttons stayed as they were until they signed out and in.
 *
 * The kept copy is now checked against the server when a page loads. (When
 * this test was written the API took the role from the session token, renewed
 * every 15 minutes, so it renews the token below; since the role is read from
 * the database on every request, the renewal is no longer what makes it pass.
 * `role-change-takes-effect-at-once.spec.ts` covers the API without one.)
 */
import { type Browser, type Page, expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

async function signInAs(browser: Browser, tokens: { accessToken: string; refreshToken: string }): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
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

test('a changed role shows in the menu once the session is renewed, without signing out', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `pfr-${stamp}`,
      slug: `pfr-${stamp}`,
      adminFullName: 'Parveen Admin',
      adminEmail: `admin-${stamp}@pfr.test.local`,
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
  const invited = (await (await admin.post('/users', {
    data: { email: `eli-${stamp}@pfr.test.local`, fullName: 'Eli Employee', roleId: roleId('Employee') },
  })).json()) as { user: { id: string }; inviteToken: string };
  const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as { accessToken: string; refreshToken: string };

  // As an Employee: no Roles page in the menu. Their permissions are now kept in the browser.
  const view = await signInAs(browser, tokens);
  await view.goto('/dashboard');
  const nav = view.getByRole('navigation', { name: 'Primary' });
  await expect(nav.locator('a[href="/dashboard"]')).toBeVisible();
  await expect(nav.locator('a[href="/roles"]')).toHaveCount(0);
  await expect.poll(() => view.evaluate(() => window.localStorage.getItem('kpi-nexus.permissions'))).not.toBeNull();

  // An administrator makes them an administrator.
  expect((await admin.patch(`/users/${invited.user.id}`, { data: { roleId: roleId('Admin') } })).ok()).toBe(true);

  // Their session token is renewed, as the app does by itself every 15 minutes. From then on the API
  // knows the new role; the copy kept in the browser is still the old one.
  const renewed = (await (await anon.post('/auth/refresh', { data: { refreshToken: tokens.refreshToken } })).json()) as { accessToken: string; refreshToken: string };
  await view.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [renewed.accessToken, renewed.refreshToken] as const,
  );

  // They open another page, as anyone would: the menu now shows what they may do.
  await view.goto('/tasks');
  await expect(nav.locator('a[href="/roles"]')).toBeVisible({ timeout: 15_000 });
  await view.context().close();
});
