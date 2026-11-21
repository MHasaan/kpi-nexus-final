/**
 * Manual QA (2026-11-19, F-068): "Publish to unit" did nothing for anyone with the default scopes — the
 * dashboard reached the unit's members only when their dashboards scope was "their units". And anyone who
 * could see a dashboard and held DASHBOARD_MANAGE could rename or delete it. A dashboard published to a unit
 * now reaches its members whatever their scope, and is its owner's (or an administrator's) to change.
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

test('a dashboard published to a unit reaches its members, who may read it but not change it', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `pub-${stamp}`,
      slug: `pub-${stamp}`,
      adminFullName: 'Pia Admin',
      adminEmail: `admin-${stamp}@pub.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });

  const unit = (await (await admin.post('/org-units', { data: { name: `Sales ${stamp}` } })).json()) as { id: string };
  // A member with the default scopes, who may manage dashboards of their own.
  const role = (await (await admin.post('/roles', { data: { name: `Member ${stamp}`, permissions: ['KPI_VIEW', 'DASHBOARD_VIEW', 'DASHBOARD_MANAGE'] } })).json()) as { id: string };
  const invited = (await (await admin.post('/users', { data: { email: `sam-${stamp}@pub.test.local`, fullName: 'Sam Member', roleId: role.id } })).json()) as { user: { id: string }; inviteToken: string };
  expect((await admin.post(`/org-units/${unit.id}/members`, { data: { userId: invited.user.id, memberRole: 'MEMBER' } })).status()).toBe(201);
  const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as { accessToken: string; refreshToken: string };
  const member = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${tokens.accessToken}` } });

  // The administrator's dashboard, not shared with everyone: unseen until it is published to Sam's unit.
  const board = (await (await admin.post('/dashboards', { data: { name: `Sales board ${stamp}`, isShared: false } })).json()) as { id: string };
  expect((await member.get(`/dashboards/${board.id}`)).status()).toBe(404);
  expect((await admin.post(`/dashboards/${board.id}/unit-assignments`, { data: { orgUnitId: unit.id } })).status()).toBeLessThan(300);
  expect((await member.get(`/dashboards/${board.id}`)).status()).toBe(200);

  // Sam sees it in the list and opens it, with no buttons that would change it; the API refuses such changes.
  const sam = await signInAs(browser, tokens);
  await sam.goto('/dashboards');
  await expect(sam.getByTestId(`dashboard-card-${board.id}`)).toBeVisible();
  await expect(sam.getByTestId(`dashboard-delete-${board.id}`)).toHaveCount(0);
  await sam.goto(`/dashboards/${board.id}`);
  await expect(sam.getByTestId('dashboard-detail-heading')).toHaveText(`Sales board ${stamp}`);
  await expect(sam.getByTestId('dashboard-edit-toggle')).toHaveCount(0);
  await expect(sam.getByTestId('dashboard-share-link')).toHaveCount(0);
  const renamed = await member.patch(`/dashboards/${board.id}`, { data: { name: 'Sam owns this now' } });
  expect(renamed.status()).toBe(403);
  expect(((await renamed.json()) as { message: string }).message).toMatch(/owner or an administrator/i);
  expect((await member.delete(`/dashboards/${board.id}`)).status()).toBe(403);

  // The owner keeps every button, and may still rename it.
  await page.goto(`/dashboards/${board.id}`);
  await expect(page.getByTestId('dashboard-edit-toggle')).toBeVisible();
  expect((await admin.patch(`/dashboards/${board.id}`, { data: { name: `Sales board ${stamp} v2` } })).status()).toBe(200);
});
