/**
 * Plan 7.7 (role hierarchy): a role can inherit permissions from another (the
 * demo data has such roles), and the roles page said nothing about it — the
 * matrix showed only the role's own ticks, so a role could do more than the
 * page showed.
 *
 * The API has no route to make such a link, so the hierarchy answer is stubbed
 * here; the rule that reads it is unit-tested in role-inheritance.spec.ts.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('roles: a role that inherits from another says so, and names what it gets', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `rin-${stamp}`,
      slug: `rin-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@rin.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const base = (await (await api.post('/roles', { data: { name: `Base ${stamp}`, permissions: ['KPI_VIEW', 'REPORTS_VIEW'] } })).json()) as { id: string };
  const child = (await (await api.post('/roles', { data: { name: `Child ${stamp}`, permissions: ['KPI_VIEW'] } })).json()) as { id: string };

  await page.route('**/roles/hierarchy', async (route) => {
    const real = await route.fetch();
    const body = (await real.json()) as { roles: unknown[]; edges: unknown[] };
    body.edges = [{ parentRoleId: base.id, childRoleId: child.id }];
    await route.fulfill({ response: real, json: body });
  });

  await page.goto('/roles');
  await page.getByTestId(`role-row-Child ${stamp}`).getByRole('button').click();
  const note = page.getByTestId('role-inherits');
  await expect(note).toContainText(`Base ${stamp}`);
  // REPORTS_VIEW comes from Base; KPI_VIEW is Child's own and is not listed as inherited.
  await expect(note).toContainText('REPORTS_VIEW');
  await expect(note).not.toContainText('KPI_VIEW');

  // A role with nothing above it says nothing.
  await page.getByTestId(`role-row-Base ${stamp}`).getByRole('button').click();
  await expect(page.getByTestId('role-inherits')).toHaveCount(0);
});
