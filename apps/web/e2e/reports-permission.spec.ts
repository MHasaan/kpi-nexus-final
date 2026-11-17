/**
 * UI-013 (plan 5.2, scheduled reports; signed off 2026-11-17): creating,
 * pausing and deleting a scheduled report needed ORG_SETTINGS — the
 * administrator's key — while the page offered New to everyone who could read
 * reports, and Pause and Delete to all of them too. The key made for this,
 * REPORTS_MANAGE, gated nothing.
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

test('scheduled reports: managing them follows REPORTS_MANAGE on the page and the API', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `rpp-${stamp}`,
      slug: `rpp-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@rpp.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const body = (name: string) => ({ name: `${name} ${stamp}`, cron: '0 9 * * 1', format: 'CSV', recipients: [`r-${stamp}@example.com`] });
  const existing = (await (await admin.post('/scheduled-reports', { data: body('Weekly') })).json()) as { id: string };

  const join = async (label: string, permissions: string[]) => {
    const role = await admin.post('/roles', { data: { name: `${label} ${stamp}`, permissions } });
    expect(role.status(), `${label} role`).toBe(201);
    const invited = (await (await admin.post('/users', {
      data: { email: `${label.toLowerCase()}-${stamp}@rpp.test.local`, fullName: `${label} Person`, roleId: ((await role.json()) as { id: string }).id },
    })).json()) as { inviteToken: string };
    const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
      accessToken: string;
      refreshToken: string;
    };
    return {
      page: await signInAs(browser, tokens),
      api: await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${tokens.accessToken}` } }),
    };
  };

  // A reader: sees the report and may run it, is offered nothing that changes it, and the API agrees.
  const reader = await join('Reader', ['KPI_VIEW', 'REPORTS_VIEW']);
  await reader.page.goto('/reports');
  await expect(reader.page.getByTestId(`report-row-${existing.id}`)).toBeVisible();
  await expect(reader.page.getByTestId(`report-trigger-${existing.id}`)).toBeVisible();
  await expect(reader.page.getByTestId('reports-new-link')).toHaveCount(0);
  await expect(reader.page.getByTestId(`report-toggle-${existing.id}`)).toHaveCount(0);
  await expect(reader.page.getByTestId(`report-delete-${existing.id}`)).toHaveCount(0);
  await reader.page.goto('/reports/new');
  await expect(reader.page).toHaveURL(/\/unauthorized$/);
  expect((await reader.api.post('/scheduled-reports', { data: body('Mine') })).status()).toBe(403);
  expect((await reader.api.patch(`/scheduled-reports/${existing.id}`, { data: { isActive: false } })).status()).toBe(403);
  expect((await reader.api.delete(`/scheduled-reports/${existing.id}`)).status()).toBe(403);
  await reader.page.context().close();

  // A report manager who is no administrator: New opens, Pause works, the API lets them create.
  const manager = await join('Manager', ['KPI_VIEW', 'REPORTS_VIEW', 'REPORTS_MANAGE']);
  await manager.page.goto('/reports');
  await manager.page.getByTestId('reports-new-link').click();
  await expect(manager.page.getByTestId('report-name-input')).toBeVisible();
  expect((await manager.api.post('/scheduled-reports', { data: body('Monthly') })).status()).toBe(201);
  await manager.page.goto('/reports');
  const toggle = manager.page.getByTestId(`report-toggle-${existing.id}`);
  await expect(toggle).toHaveText(/Pause/);
  await toggle.click();
  await expect(toggle).toHaveText(/Resume/);
  await expect(manager.page.getByTestId(`report-delete-${existing.id}`)).toBeVisible();
  await manager.page.context().close();

  // The administrator's settings key alone no longer manages reports.
  const settings = await join('Settings', ['KPI_VIEW', 'REPORTS_VIEW', 'ORG_SETTINGS']);
  expect((await settings.api.post('/scheduled-reports', { data: body('Theirs') })).status()).toBe(403);
  await settings.page.goto('/reports');
  await expect(settings.page.getByTestId(`report-row-${existing.id}`)).toBeVisible();
  await expect(settings.page.getByTestId('reports-new-link')).toHaveCount(0);
  await settings.page.context().close();
});
