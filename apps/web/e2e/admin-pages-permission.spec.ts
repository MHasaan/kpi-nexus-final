/**
 * UI-013 (plan 5.2, admin pages): the sidebar offered Integrations to anyone
 * with INTEGRATIONS_MANAGE and Audit to anyone with AUDIT_VIEW — and the API
 * accepts those keys — but both pages asked for ORG_SETTINGS, so the link led
 * to "no access". On Connectors the same people saw a list they could not add
 * to. Positions had no gate of its own.
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

test('admin pages open for the keys their sidebar link and their API accept', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `adm-${stamp}`,
      slug: `adm-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@adm.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const join = async (label: string, permissions: string[]) => {
    const role = await admin.post('/roles', { data: { name: `${label} ${stamp}`, permissions } });
    expect(role.status(), `${label} role`).toBe(201);
    const invited = (await (await admin.post('/users', {
      data: { email: `${label.toLowerCase()}-${stamp}@adm.test.local`, fullName: `${label} Person`, roleId: ((await role.json()) as { id: string }).id },
    })).json()) as { inviteToken: string };
    const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
      accessToken: string;
      refreshToken: string;
    };
    const p = await signInAs(browser, tokens);
    const refused: string[] = [];
    p.on('response', (r) => {
      const path = new URL(r.url()).pathname;
      if (r.url().startsWith(API_URL) && r.status() === 403 && /^\/(integrations|connectors|audit|positions)/.test(path)) refused.push(`${r.request().method()} ${path}`);
    });
    return { page: p, refused };
  };

  // Integrations key, no settings key: the link leads to a page that works, and connectors can be added.
  const integrator = await join('Integrator', ['KPI_VIEW', 'INTEGRATIONS_MANAGE']);
  await integrator.page.goto('/dashboard');
  await integrator.page.getByTestId('nav-integrations').click();
  await expect(integrator.page).toHaveURL(/\/integrations$/);
  await expect(integrator.page.locator('[data-testid^="connect-"]').first()).toBeVisible();
  await integrator.page.getByTestId('nav-connectors').click();
  await expect(integrator.page.getByTestId('connector-name')).toBeVisible();
  expect(integrator.refused).toEqual([]);
  await integrator.page.context().close();

  // Audit key, no settings key: the link leads to the log.
  const auditor = await join('Auditor', ['KPI_VIEW', 'AUDIT_VIEW']);
  await auditor.page.goto('/dashboard');
  await auditor.page.getByTestId('nav-audit').click();
  await expect(auditor.page).toHaveURL(/\/settings\/audit$/);
  await expect(auditor.page.getByTestId('audit-list')).toBeVisible();
  expect(auditor.refused).toEqual([]);
  await auditor.page.context().close();

  // Neither: turned away from each without asking the API anything it refuses. Positions too.
  const reader = await join('Reader', ['KPI_VIEW']);
  for (const path of ['/integrations', '/connectors', '/settings/audit', '/positions']) {
    await reader.page.goto(path);
    await expect(reader.page, `${path} turns a reader away`).toHaveURL(/\/unauthorized$/);
  }
  expect(reader.refused).toEqual([]);
  await reader.page.context().close();

  // The position manager's page still opens for them.
  const positions = await join('Positions', ['KPI_VIEW', 'POSITIONS_MANAGE']);
  await positions.page.goto('/positions');
  await expect(positions.page.getByTestId('positions-list-section')).toBeVisible();
  await positions.page.context().close();
});
