/**
 * Plan 6.6: the notification preferences form offered channels a personal
 * mute never applied to, could not clear its hours once set, and showed the
 * organisation's delivery log link to everyone.
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

test('notification preferences: hours are set, checked and cleared; only email is offered; the delivery log link is for managers', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `ntf-${stamp}`,
      slug: `ntf-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@ntf.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const saved = async () => ((await (await api.get('/auth/me')).json()) as { user: { notificationSettings: Record<string, unknown> | null } }).user.notificationSettings ?? {};

  await page.goto('/settings/notifications');
  // Shared channels are not a personal choice.
  await expect(page.getByTestId('mute-kind-EMAIL')).toBeVisible();
  await expect(page.getByTestId('mute-kind-SLACK')).toHaveCount(0);
  await expect(page.getByTestId('notif-delivery-log')).toBeVisible();

  // Half a window is refused.
  await page.getByTestId('mute-start').fill('22:00');
  await page.getByTestId('notif-settings-save').click();
  await expect(page.getByTestId('notif-settings-error')).toContainText('Set both a start and an end');

  await page.getByTestId('mute-end').fill('07:00');
  await page.getByTestId('mute-kind-EMAIL').check();
  await page.getByTestId('notif-settings-save').click();
  await expect(page.getByTestId('notif-settings-saved')).toBeVisible();
  expect(await saved()).toMatchObject({ muteStart: '22:00', muteEnd: '07:00', mutedChannelKinds: ['EMAIL'] });

  // Cleared again.
  await page.reload();
  await expect(page.getByTestId('mute-start')).toHaveValue('22:00');
  await page.getByTestId('mute-clear').click();
  await page.getByTestId('notif-settings-save').click();
  await expect(page.getByTestId('notif-settings-saved')).toBeVisible();
  const after = await saved();
  expect(after.muteStart).toBeUndefined();
  expect(after.muteEnd).toBeUndefined();

  // Someone who does not manage the organisation's settings has no link to its delivery log.
  const role = (await (await api.post('/roles', { data: { name: `Viewer ${stamp}`, permissions: ['KPI_VIEW'] } })).json()) as { id: string };
  const invited = (await (await api.post('/users', { data: { email: `viewer-${stamp}@ntf.test.local`, fullName: 'Vic Viewer', roleId: role.id } })).json()) as { inviteToken: string };
  const anon = await request.newContext({ baseURL: API_URL });
  const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as { accessToken: string; refreshToken: string };
  const viewer = await signInAs(browser, tokens);
  await viewer.page.goto('/settings/notifications');
  await expect(viewer.page.getByTestId('mute-kind-EMAIL')).toBeVisible();
  await expect(viewer.page.getByTestId('notif-delivery-log')).toHaveCount(0);
  await viewer.context.close();
});
