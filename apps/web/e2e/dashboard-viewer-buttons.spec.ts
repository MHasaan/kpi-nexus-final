/**
 * UI-013 (plan 5.2, Dashboards): everyone who could open a dashboard was shown
 * Edit, Settings, Add widget, Snapshot and Share — and for a viewer each one
 * failed with 403 when pressed, because the API reserves them for
 * DASHBOARD_MANAGE. The archive page had no gate of its own.
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

const MANAGE_BUTTONS = ['dashboard-edit-toggle', 'dashboard-settings-toggle', 'dashboard-add-widget-toggle', 'dashboard-snapshot-btn', 'dashboard-share-link'];

test('a dashboard viewer sees no button the API would refuse; a manager sees them all', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `dvb-${stamp}`,
      slug: `dvb-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@dvb.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const dashboard = (await (await admin.post('/dashboards', { data: { name: `Board ${stamp}`, isShared: true } })).json()) as { id: string };
  const snapshot = await admin.post(`/dashboards/${dashboard.id}/snapshots`, { data: { label: 'Before' } });
  expect(snapshot.status(), 'snapshot taken').toBe(201);

  // The manager (administrator): every action is there.
  await page.goto(`/dashboards/${dashboard.id}`);
  for (const id of MANAGE_BUTTONS) await expect(page.getByTestId(id), id).toBeVisible();
  await expect(page.getByTestId('dashboard-detail-empty')).toContainText('Add widget');

  // A viewer: DASHBOARD_VIEW and no DASHBOARD_MANAGE.
  const role = await admin.post('/roles', { data: { name: `Board viewer ${stamp}`, permissions: ['KPI_VIEW', 'DASHBOARD_VIEW'] } });
  expect(role.status()).toBe(201);
  const invited = (await (await admin.post('/users', {
    data: { email: `vic-${stamp}@dvb.test.local`, fullName: 'Vic Viewer', roleId: ((await role.json()) as { id: string }).id },
  })).json()) as { inviteToken: string };
  const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
    accessToken: string;
    refreshToken: string;
  };
  const viewer = await signInAs(browser, tokens);
  const refused: string[] = [];
  viewer.on('response', (r) => {
    if (r.url().startsWith(API_URL) && r.status() === 403) refused.push(`${r.request().method()} ${new URL(r.url()).pathname}`);
  });

  await viewer.goto(`/dashboards/${dashboard.id}`);
  await expect(viewer.getByTestId('dashboard-detail-heading')).toHaveText(`Board ${stamp}`);
  for (const id of MANAGE_BUTTONS) await expect(viewer.getByTestId(id), `${id} is not offered to a viewer`).toHaveCount(0);
  // What a viewer may do is still there, and the empty board does not tell them to press buttons they do not have.
  await expect(viewer.getByTestId('dashboard-snapshots-link')).toBeVisible();
  await expect(viewer.getByTestId('dashboard-print-btn')).toBeVisible();
  await expect(viewer.getByTestId('dashboard-detail-empty')).toHaveText(/This dashboard has no widgets yet\./);
  await expect(viewer.getByTestId('dashboard-detail-empty')).not.toContainText('Add widget');

  // Snapshot history: they can read it, not take or delete one.
  await viewer.getByTestId('dashboard-snapshots-link').click();
  await expect(viewer.getByText('Before')).toBeVisible();
  await expect(viewer.getByTestId('snapshot-capture-section')).toHaveCount(0);
  await expect(viewer.locator('[data-testid^="snapshot-delete-"]')).toHaveCount(0);
  await expect(viewer.locator('[data-testid^="snapshot-view-"]').first()).toBeVisible();

  // The archive opens for a viewer (it lists; restoring and purging stay with managers).
  await viewer.goto('/dashboards/archive');
  await expect(viewer).toHaveURL(/\/dashboards\/archive$/);

  // (The top bar's alerts bell is a separate matter: it asks for alerts whoever is signed in.)
  expect(refused.filter((call) => call.includes('/dashboards')), 'nothing a viewer is shown on these pages is refused').toEqual([]);
  await viewer.context().close();

  // Someone with no dashboard access at all is turned away from the archive without a refused call.
  const none = await admin.post('/roles', { data: { name: `No boards ${stamp}`, permissions: ['KPI_VIEW'] } });
  const invitedNone = (await (await admin.post('/users', {
    data: { email: `nan-${stamp}@dvb.test.local`, fullName: 'Nan Noboards', roleId: ((await none.json()) as { id: string }).id },
  })).json()) as { inviteToken: string };
  const noneTokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invitedNone.inviteToken, password: PASSWORD } })).json()) as {
    accessToken: string;
    refreshToken: string;
  };
  const outsider = await signInAs(browser, noneTokens);
  const outsiderRefused: string[] = [];
  outsider.on('response', (r) => {
    if (r.url().startsWith(API_URL) && r.status() === 403) outsiderRefused.push(new URL(r.url()).pathname);
  });
  await outsider.goto('/dashboards/archive');
  await expect(outsider).toHaveURL(/\/unauthorized$/);
  expect(outsiderRefused.filter((p) => p.includes('dashboards'))).toEqual([]);
  await outsider.context().close();
});
