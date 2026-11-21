/**
 * Manual QA (2026-11-19, F-008): the People table showed Name, Manager, Status and Role only; a person's
 * position was set on invitation and then shown nowhere, so the organisation's structure could not be read
 * off the list. The table now has a Position column.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('the People table shows each person’s position', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `pos-${stamp}`,
      slug: `pos-${stamp}`,
      adminFullName: 'Olivia Grant',
      adminEmail: `admin-${stamp}@pos.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const position = (await (await api.post('/positions', { data: { name: `Chief Technology Officer ${stamp}` } })).json()) as { id: string };
  const roles = (await (await api.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const employee = roles.find((r) => r.name === 'Employee')!;
  const email = `cto-${stamp}@pos.test.local`;
  expect((await api.post('/users', { data: { email, fullName: 'Casey Tsao', roleId: employee.id, positionId: position.id } })).status()).toBe(201);

  await page.goto('/users');
  await expect(page.getByRole('columnheader', { name: 'Position' })).toBeVisible();
  const row = page.getByTestId(`user-row-${email}`);
  await expect(row.getByTestId('user-position')).toHaveText(`Chief Technology Officer ${stamp}`);
  // Someone without one says so rather than showing nothing.
  await expect(page.getByTestId(`user-row-admin-${stamp}@pos.test.local`).getByTestId('user-position')).toHaveText('—');
});
