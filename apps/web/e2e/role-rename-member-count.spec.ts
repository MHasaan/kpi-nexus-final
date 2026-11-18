/**
 * Plan 7.7 (roles): a role could not be renamed or described after it was
 * made, and nothing on the page said how many people hold it — which is what
 * decides whether it can be deleted.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('roles: each shows how many people hold it; a role can be renamed and described', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `rrm-${stamp}`,
      slug: `rrm-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@rrm.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const role = (await (await api.post('/roles', { data: { name: `Analyst ${stamp}`, permissions: ['KPI_VIEW'] } })).json()) as { id: string };
  for (const n of [1, 2]) {
    expect((await api.post('/users', { data: { email: `p${n}-${stamp}@rrm.test.local`, fullName: `Person ${n}`, roleId: role.id } })).status()).toBe(201);
  }
  expect((await api.post('/roles', { data: { name: `Empty ${stamp}`, permissions: [] } })).status()).toBe(201);

  // The API says how many people hold each role.
  const listed = (await (await api.get('/roles')).json()) as Array<{ id: string; name: string; userCount: number }>;
  expect(listed.find((r) => r.id === role.id)!.userCount).toBe(2);
  expect(listed.find((r) => r.name === `Empty ${stamp}`)!.userCount).toBe(0);

  await page.goto('/roles');
  await expect(page.getByTestId(`role-members-Analyst ${stamp}`)).toHaveText('2 people');
  await expect(page.getByTestId(`role-members-Empty ${stamp}`)).toHaveText('No one');

  // Rename it and say what it is for.
  await page.getByTestId(`role-row-Analyst ${stamp}`).getByRole('button').click();
  await page.getByTestId('role-edit-details').click();
  const form = page.getByTestId('role-details-form');
  await expect(form.getByLabel('Name')).toHaveValue(`Analyst ${stamp}`);

  // A name another role has is said on the form.
  await form.getByLabel('Name').fill(`Empty ${stamp}`);
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('role-details-error')).toContainText('already exists');

  await form.getByLabel('Name').fill(`Data analyst ${stamp}`);
  await form.getByLabel('Description').fill('Reads KPIs and reports');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId(`role-row-Data analyst ${stamp}`)).toBeVisible();
  await expect(page.getByTestId('role-description')).toHaveText('Reads KPIs and reports');
  const after = ((await (await api.get('/roles')).json()) as Array<{ id: string; name: string; description: string | null; permissions: string[] }>).find((r) => r.id === role.id)!;
  expect(after).toMatchObject({ name: `Data analyst ${stamp}`, description: 'Reads KPIs and reports', permissions: ['KPI_VIEW'] });
});
