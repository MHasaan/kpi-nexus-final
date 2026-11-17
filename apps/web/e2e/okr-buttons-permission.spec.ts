/**
 * UI-013 (plan 5.2, OKRs): on the objectives list, Edit was shown to whoever
 * could CREATE — but saving an edit needs KPI_EDIT, so a creator's edit was
 * refused and an editor had no button. "Sync from linked KPIs" was shown to
 * everyone and refused for anyone without KPI_EDIT.
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

test('OKR buttons follow the permission each action needs', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `okb-${stamp}`,
      slug: `okb-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@okb.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const me = (await (await admin.get('/auth/me')).json()) as { user: { id: string } };
  const objective = (await (await admin.post('/objectives', {
    data: { name: `Grow ${stamp}`, ownerUserId: me.user.id, periodStart: '2026-01-01', periodEnd: '2026-12-31', status: 'ACTIVE' },
  })).json()) as { id: string };

  const join = async (label: string, permissions: string[]) => {
    const role = await admin.post('/roles', { data: { name: `${label} ${stamp}`, permissions } });
    expect(role.status(), `${label} role`).toBe(201);
    const invited = (await (await admin.post('/users', {
      data: { email: `${label.toLowerCase()}-${stamp}@okb.test.local`, fullName: `${label} Person`, roleId: ((await role.json()) as { id: string }).id },
    })).json()) as { inviteToken: string };
    const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
      accessToken: string;
      refreshToken: string;
    };
    const p = await signInAs(browser, tokens);
    const refused: string[] = [];
    p.on('response', (r) => {
      if (r.url().startsWith(API_URL) && r.status() === 403 && new URL(r.url()).pathname.startsWith('/objectives')) {
        refused.push(`${r.request().method()} ${new URL(r.url()).pathname}`);
      }
    });
    return { page: p, refused };
  };

  // May edit, may not create: Edit and Sync are there (Edit used to be hidden from them).
  const editor = await join('Editor', ['KPI_VIEW', 'KPI_EDIT']);
  await editor.page.goto('/okrs');
  await expect(editor.page.getByTestId(`okr-edit-trigger-${objective.id}`)).toBeVisible();
  await editor.page.goto(`/okrs/${objective.id}`);
  await expect(editor.page.getByTestId('okr-sync')).toBeVisible();
  await editor.page.getByTestId('okr-sync').click();
  await expect(editor.page.getByTestId('okr-sync')).toBeEnabled();
  expect(editor.refused).toEqual([]);
  await editor.page.context().close();

  // May create, may not edit: no Edit and no Sync (both used to be shown, and refused).
  const creator = await join('Creator', ['KPI_VIEW', 'KPI_CREATE']);
  await creator.page.goto('/okrs');
  await expect(creator.page.getByTestId(`objective-${objective.id}`)).toBeVisible();
  await expect(creator.page.getByTestId(`okr-edit-trigger-${objective.id}`)).toHaveCount(0);
  await creator.page.goto(`/okrs/${objective.id}`);
  await expect(creator.page.getByTestId('kr-list')).toBeVisible();
  await expect(creator.page.getByTestId('okr-sync')).toHaveCount(0);
  expect(creator.refused).toEqual([]);
  await creator.page.context().close();
});
