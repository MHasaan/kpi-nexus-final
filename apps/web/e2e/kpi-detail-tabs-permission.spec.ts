/**
 * UI-013 (plan 5.2, KPI detail tabs): the Targets, Thresholds, Benchmarks,
 * Formula and Cascade tabs showed their add forms and delete buttons to every
 * reader. The API asks for KPI_EDIT for each, so a reader's every attempt
 * ended in a 403.
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

const FORMS = [
  ['targets', 'target-add'],
  ['thresholds', 'band-add'],
  ['benchmarks', 'benchmark-add'],
  ['benchmarks', 'benchmark-compute'],
  ['formula', 'formula-save'],
  ['cascade', 'cascade-add'],
] as const;

test('KPI detail tabs: a reader reads, an editor edits', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `kdt-${stamp}`,
      slug: `kdt-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@kdt.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const kpi = (await (await admin.post('/kpis', { data: { name: `Margin ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  expect((await admin.post(`/kpis/${kpi.id}/targets`, { data: { type: 'STATIC', value: 42 } })).status()).toBe(201);

  const join = async (label: string, permissions: string[]) => {
    const role = await admin.post('/roles', { data: { name: `${label} ${stamp}`, permissions } });
    expect(role.status(), `${label} role`).toBe(201);
    const invited = (await (await admin.post('/users', {
      data: { email: `${label.toLowerCase()}-${stamp}@kdt.test.local`, fullName: `${label} Person`, roleId: ((await role.json()) as { id: string }).id },
    })).json()) as { inviteToken: string };
    const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
      accessToken: string;
      refreshToken: string;
    };
    return signInAs(browser, tokens);
  };

  // An editor: every form is there.
  const editor = await join('Editor', ['KPI_VIEW', 'KPI_EDIT']);
  for (const [tab, testId] of FORMS) {
    await editor.goto(`/kpis/${kpi.id}?tab=${tab}`);
    await expect(editor.getByTestId(testId), `editor: ${testId}`).toBeVisible();
  }
  await editor.goto(`/kpis/${kpi.id}?tab=targets`);
  await expect(editor.getByRole('button', { name: 'Delete' })).toBeVisible();
  await editor.context().close();

  // A reader: sees what is there — the target — and no form or delete anywhere.
  const reader = await join('Reader', ['KPI_VIEW']);
  const refused: string[] = [];
  reader.on('response', (r) => {
    if (r.url().startsWith(API_URL) && r.status() === 403) refused.push(`${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  await reader.goto(`/kpis/${kpi.id}?tab=targets`);
  await expect(reader.getByText('STATIC 42')).toBeVisible();
  await expect(reader.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  for (const [tab, testId] of FORMS) {
    await reader.goto(`/kpis/${kpi.id}?tab=${tab}`);
    await expect(reader.getByTestId(`tab-${tab}`).getByRole('tab')).toHaveAttribute('aria-selected', 'true');
    await expect(reader.getByTestId(testId), `reader: ${testId}`).toHaveCount(0);
  }
  await reader.goto(`/kpis/${kpi.id}?tab=formula`);
  await expect(reader.getByTestId('formula-none')).toBeVisible();
  expect(refused.filter((call) => call.includes(`/kpis/${kpi.id}`))).toEqual([]);
  await reader.context().close();
});
