/**
 * UI-013 (plan 5.2, KPI pages): the import page opened for anyone who could
 * read KPIs and then refused the upload (KPI_CREATE); adding a category asked
 * for KPI_EDIT though the API asks for KPI_CREATE, and deleting one for
 * KPI_EDIT though the API asks for KPI_DELETE; Restore, Purge and "Use
 * template" were offered to every reader.
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

test('KPI side pages offer each action only to those the API allows it', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `kpp-${stamp}`,
      slug: `kpp-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@kpp.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const category = (await (await admin.post('/kpi-categories', { data: { name: `Finance ${stamp}` } })).json()) as { id: string };
  const gone = (await (await admin.post('/kpis', { data: { name: `Retired ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  expect((await admin.delete(`/kpis/${gone.id}`)).status()).toBe(204);

  // Whether this installation has templates to use at all.
  await page.goto('/kpis/templates');
  await expect(page.getByTestId('tmpl-grid').or(page.getByText('No templates match'))).toBeVisible(); // loaded
  const hasTemplates = (await page.getByTestId('tmpl-grid').count()) > 0;

  const as = async (label: string, extra: string[]) => {
    const role = await admin.post('/roles', { data: { name: `${label} ${stamp}`, permissions: ['KPI_VIEW', ...extra] } });
    expect(role.status(), `${label} role`).toBe(201);
    const invited = (await (await admin.post('/users', {
      data: { email: `${label.toLowerCase()}-${stamp}@kpp.test.local`, fullName: `${label} Person`, roleId: ((await role.json()) as { id: string }).id },
    })).json()) as { inviteToken: string };
    const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
      accessToken: string;
      refreshToken: string;
    };
    return signInAs(browser, tokens);
  };
  interface Offer {
    importTab: number;
    create: number;
    edit: number;
    remove: number;
    restore: number;
    purge: number;
    useTemplate: boolean;
    importOpens: boolean;
  }
  /**
   * Check what one person is offered across the four pages. Each check retries:
   * a guarded button appears a moment after the content it sits in.
   */
  const expectOffered = async (p: Page, who: string, offer: Offer) => {
    // Let the first page fetch and cache this person's permissions.
    await p.goto('/kpis');
    await expect.poll(() => p.evaluate(() => window.localStorage.getItem('kpi-nexus.permissions'))).not.toBeNull();

    await p.goto('/kpis/categories');
    await expect(p.getByTestId(`category-row-${category.id}`)).toBeVisible();
    await expect(p.getByTestId('kpi-subnav-import'), `${who}: import tab`).toHaveCount(offer.importTab);
    await expect(p.getByTestId('category-create-form'), `${who}: add a category`).toHaveCount(offer.create);
    await expect(p.getByTestId(`category-edit-${category.id}`), `${who}: edit a category`).toHaveCount(offer.edit);
    await expect(p.getByTestId(`category-delete-${category.id}`), `${who}: delete a category`).toHaveCount(offer.remove);

    await p.goto('/kpis/archive');
    await expect(p.getByTestId('archive-list')).toContainText(`Retired ${stamp}`);
    await expect(p.getByTestId(`restore-${gone.id}`), `${who}: restore`).toHaveCount(offer.restore);
    await expect(p.getByTestId(`purge-${gone.id}`), `${who}: purge`).toHaveCount(offer.purge);

    await p.goto('/kpis/templates');
    await expect(p.getByTestId('tmpl-grid').or(p.getByText('No templates match'))).toBeVisible(); // loaded
    if (offer.useTemplate) await expect(p.locator('[data-testid^="tmpl-use-"]').first(), `${who}: use template`).toBeVisible();
    else await expect(p.locator('[data-testid^="tmpl-use-"]'), `${who}: use template`).toHaveCount(0);

    await p.goto('/kpis/import');
    if (offer.importOpens) await expect(p.getByTestId('kpi-import-heading'), `${who}: import page`).toBeVisible();
    else await expect(p, `${who}: import page`).toHaveURL(/\/unauthorized$/);
  };

  const reader = await as('Reader', []);
  await expectOffered(reader, 'reader', { importTab: 0, create: 0, edit: 0, remove: 0, restore: 0, purge: 0, useTemplate: false, importOpens: false });
  await reader.context().close();

  const creator = await as('Creator', ['KPI_CREATE']);
  await expectOffered(creator, 'creator', { importTab: 1, create: 1, edit: 0, remove: 0, restore: 0, purge: 0, useTemplate: hasTemplates, importOpens: true });
  await creator.context().close();

  const editor = await as('Editor', ['KPI_EDIT']);
  await expectOffered(editor, 'editor', { importTab: 0, create: 0, edit: 1, remove: 0, restore: 1, purge: 0, useTemplate: false, importOpens: false });
  await editor.context().close();

  const deleter = await as('Deleter', ['KPI_DELETE']);
  await expectOffered(deleter, 'deleter', { importTab: 0, create: 0, edit: 0, remove: 1, restore: 0, purge: 1, useTemplate: false, importOpens: false });
  await deleter.context().close();
});
