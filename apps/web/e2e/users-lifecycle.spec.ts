/**
 * UI-010 / UI-016 / X-01: on /users an invitation could not be sent again or
 * withdrawn, an archived person could not be brought back, Archive fired on a
 * single click with no say over who takes over their KPIs and reports, and
 * suspended people were listed under "Archived" as well as "Active".
 */
import { type APIRequestContext, type Page, expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function start(page: Page, tag: string) {
  const stamp = suffix();
  const session = await registerOrgViaApi(page, {
    orgName: `${tag}-${stamp}`,
    slug: `${tag}-${stamp}`,
    adminFullName: 'Life Admin',
    adminEmail: `admin-${stamp}@${tag}.test.local`,
    adminPassword: PASSWORD,
  });
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` },
  });
  const invite = async (name: string, extra: Record<string, unknown> = {}) => {
    const email = `${name.toLowerCase().replace(/\s+/g, '.')}-${stamp}@${tag}.test.local`;
    const res = (await (await api.post('/users', { data: { email, fullName: name, ...extra } })).json()) as {
      user: { id: string };
      inviteToken: string;
    };
    return { id: res.user.id, email, inviteToken: res.inviteToken };
  };
  return { api, stamp, invite, session };
}

const statusOf = async (api: APIRequestContext, id: string) =>
  ((await (await api.get(`/users/${id}`)).json()) as { status: string }).status;

test('an invitation can be sent again, and withdrawn', async ({ page }) => {
  let ctx: Awaited<ReturnType<typeof start>>;
  try {
    ctx = await start(page, 'userslife');
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const { api, invite } = ctx;
  const pending = await invite('Pending Person');

  await page.goto('/users');
  const row = page.getByTestId(`user-row-${pending.email}`);

  await row.getByTestId(`user-resend-${pending.email}`).click();
  const sent = page.getByTestId('toast').filter({ hasText: 'Invitation sent' });
  await expect(sent).toBeVisible();
  await expect(sent).toContainText(pending.email);
  // The first link is dead now: only the resent one works.
  const anon = await request.newContext({ baseURL: API_URL });
  const stale = await anon.post('/auth/accept-invitation', { data: { token: pending.inviteToken, password: PASSWORD } });
  expect(stale.status()).toBe(401);

  await row.getByTestId(`user-cancel-invite-${pending.email}`).click();
  const dialog = page.getByTestId('user-cancel-invite-confirm');
  await expect(dialog).toContainText('Cancel the invitation for Pending Person?');
  await page.getByTestId('user-cancel-invite-confirm-confirm').click();
  await expect(row).toBeHidden();
  expect(await statusOf(api, pending.id)).toBe('PURGED');
  // A withdrawn invitation leaves no "Former User" ghost in either list.
  await page.getByRole('radio', { name: 'Archived' }).click();
  await expect(page.getByText('Former User')).toHaveCount(0);
});

test('archiving asks who takes over, and an archived person can be restored', async ({ page }) => {
  let ctx: Awaited<ReturnType<typeof start>>;
  try {
    ctx = await start(page, 'usersarch');
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const { api, invite, stamp } = ctx;
  const anon = await request.newContext({ baseURL: API_URL });
  const accept = async (token: string) =>
    expect((await anon.post('/auth/accept-invitation', { data: { token, password: PASSWORD } })).status()).toBe(200);

  const leaver = await invite('Lee Leaver');
  await accept(leaver.inviteToken);
  const heir = await invite('Hana Heir');
  await accept(heir.inviteToken);
  const report = await invite('Rae Report', { managerId: leaver.id });
  const kpi = (await (await api.post('/kpis', {
    data: {
      name: `Owned KPI ${stamp}`,
      scope: 'ORG_WIDE',
      type: 'NUMBER',
      direction: 'HIGHER_IS_BETTER',
      aggregationMethod: 'LAST',
      ownerUserId: leaver.id,
    },
  })).json()) as { id: string };

  await page.goto('/users');
  const row = page.getByTestId(`user-row-${leaver.email}`);
  await row.getByTestId(`user-archive-${leaver.email}`).click();

  // Nothing happens until the dialog is confirmed.
  const dialog = page.getByTestId('user-archive-confirm');
  await expect(dialog).toContainText('Archive Lee Leaver?');
  expect(await statusOf(api, leaver.id)).toBe('ACTIVE');
  // The person leaving is not offered as their own successor.
  await expect(dialog.getByTestId('archive-transfer-kpis').locator('option', { hasText: 'Lee Leaver' })).toHaveCount(0);
  await dialog.getByTestId('archive-transfer-kpis').selectOption({ label: 'Hana Heir' });
  await dialog.getByTestId('archive-reassign-reports').selectOption({ label: 'Hana Heir' });
  await page.getByTestId('user-archive-confirm-confirm').click();

  await expect(row).toBeHidden();
  expect(await statusOf(api, leaver.id)).toBe('ARCHIVED');
  expect(((await (await api.get(`/kpis/${kpi.id}`)).json()) as { ownerUserId: string | null }).ownerUserId).toBe(heir.id);
  expect(((await (await api.get(`/users/${report.id}`)).json()) as { managerId: string | null }).managerId).toBe(heir.id);

  // Bring them back from the Archived list.
  await page.getByRole('radio', { name: 'Archived' }).click();
  await expect(row).toBeVisible();
  await row.getByTestId(`user-restore-${leaver.email}`).click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Lee Leaver was restored' })).toBeVisible();
  await expect(row).toBeHidden();
  await page.getByRole('radio', { name: 'Active' }).click();
  await expect(row.getByTestId('user-status-badge')).toHaveText(/active/i);
  expect(await statusOf(api, leaver.id)).toBe('ACTIVE');
});

test('a suspended person is listed under Active only', async ({ page }) => {
  let ctx: Awaited<ReturnType<typeof start>>;
  try {
    ctx = await start(page, 'userssusp');
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const { api, invite } = ctx;
  const paused = await invite('Paula Paused');
  expect((await api.post(`/users/${paused.id}/suspend`)).status()).toBe(200);

  await page.goto('/users');
  const row = page.getByTestId(`user-row-${paused.email}`);
  await expect(row.getByTestId('user-status-badge')).toHaveText(/suspended/i);
  await page.getByRole('radio', { name: 'Archived' }).click();
  await expect(row).toBeHidden();
});
