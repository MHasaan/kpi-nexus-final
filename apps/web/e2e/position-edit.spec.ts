/**
 * Plan 7.7 (positions): a position could be created and deleted but not
 * changed — a wrong level or pay grade meant deleting it, which also takes the
 * position away from everyone who holds it.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('position: edit its name, track, level and pay grade in place; a clash is said on the form', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `pse-${stamp}`,
      slug: `pse-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@pse.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const made = (await (await api.post('/positions', { data: { name: `Engineer ${stamp}`, level: 2, track: 'IC', payGrade: 'E2' } })).json()) as { id: string };
  expect((await api.post('/positions', { data: { name: `Lead ${stamp}`, level: 5, track: 'MANAGEMENT' } })).status()).toBe(201);
  const read = async () => ((await (await api.get('/positions')).json()) as Array<{ id: string; name: string; level: number; track: string | null; payGrade: string | null }>).find((p) => p.id === made.id)!;

  await page.goto('/positions');
  await page.getByTestId(`edit-position-Engineer ${stamp}`).click();
  const form = page.getByTestId('position-edit-form');
  await expect(form.getByLabel('Name')).toHaveValue(`Engineer ${stamp}`);
  await expect(form.getByLabel('Level')).toHaveValue('2');

  // A name another position has: said on the form, nothing changed.
  await form.getByLabel('Name').fill(`Lead ${stamp}`);
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('position-edit-error')).toContainText('already exists');
  expect((await read()).name).toBe(`Engineer ${stamp}`);

  // A real change: new name, a higher level, no track, no pay grade.
  await form.getByLabel('Name').fill(`Senior Engineer ${stamp}`);
  await form.getByLabel('Level').fill('3');
  await form.getByLabel('Track').selectOption('');
  await form.getByLabel('Pay grade').fill('');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toHaveCount(0);
  expect(await read()).toMatchObject({ name: `Senior Engineer ${stamp}`, level: 3, track: null, payGrade: null });
  await expect(page.getByTestId(`position-level-Senior Engineer ${stamp}`)).toHaveText('L3');
});
