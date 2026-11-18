/**
 * Plan 7.7 (org units): a unit's parent and description were set when it was
 * created and could not be changed afterwards from the page — only its name.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('org unit: change its parent and description, move it to the top level, clear the description', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `oue-${stamp}`,
      slug: `oue-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@oue.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const make = async (name: string, parentUnitId?: string) =>
    ((await (await api.post('/org-units', { data: { name, parentUnitId } })).json()) as { id: string }).id;
  const sales = await make(`Sales ${stamp}`);
  const ops = await make(`Ops ${stamp}`);
  const field = await make(`Field ${stamp}`, sales);
  const fieldEast = await make(`Field East ${stamp}`, field);
  const read = async () => ((await (await api.get('/org-units')).json()) as Array<{ id: string; parentUnitId: string | null; description: string | null }>).find((u) => u.id === field)!;

  await page.goto('/org-units');
  await page.getByTestId(`edit-unit-Field ${stamp}`).click();
  const form = page.getByTestId(`unit-edit-form-Field ${stamp}`);
  const parent = form.getByLabel('Parent');
  await expect(parent).toHaveValue(sales);
  // A unit cannot go under itself or under a unit below it: neither is offered.
  await expect(parent.locator(`option[value="${field}"]`)).toHaveCount(0);
  await expect(parent.locator(`option[value="${fieldEast}"]`)).toHaveCount(0);

  // Move it under Ops and describe it.
  await parent.selectOption(ops);
  await form.getByLabel('Description').fill('Sellers on the road');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toHaveCount(0);
  expect(await read()).toMatchObject({ parentUnitId: ops, description: 'Sellers on the road' });
  await expect(page.getByTestId(`unit-row-Field ${stamp}`)).toContainText(`Ops ${stamp}`);
  await expect(page.getByTestId(`unit-row-Field ${stamp}`)).toContainText('Sellers on the road');

  // To the top level, with no description.
  await page.getByTestId(`edit-unit-Field ${stamp}`).click();
  await form.getByLabel('Parent').selectOption('');
  await form.getByLabel('Description').fill('');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toHaveCount(0);
  expect(await read()).toMatchObject({ parentUnitId: null, description: null });
});
