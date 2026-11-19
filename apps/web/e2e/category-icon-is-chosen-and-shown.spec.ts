/**
 * Flow walk (KPI pages): a category's icon was a free-text box asking for a
 * "lucide icon name", and whatever was typed was shown nowhere. It is now
 * chosen from a short list, drawn in the category list, and drawn — in the
 * category's colour — beside each of its KPIs in the KPI list.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('a category’s icon is chosen from a list and drawn beside its KPIs', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `cic-${stamp}`,
      slug: `cic-${stamp}`,
      adminFullName: 'Celia Admin',
      adminEmail: `admin-${stamp}@cic.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });

  await page.goto('/kpis/categories');
  await page.getByTestId('category-name-input').fill(`Logistics ${stamp}`);
  const choice = page.getByTestId('category-icon-input');
  // A list of icons in words, not a box for a library's names.
  await expect(choice.locator('option').first()).toHaveText('No icon');
  await choice.selectOption('Truck');
  await expect(page.getByTestId('category-icon-preview')).toHaveAttribute('data-icon', 'Truck');
  await page.getByTestId('category-create-submit').click();

  // Read it back once the save has landed: asking at once could find no category yet.
  const saved = async () =>
    ((await (await api.get('/kpi-categories')).json()) as Array<{ id: string; name: string; icon: string | null }>).find((c) => c.name === `Logistics ${stamp}`);
  await expect.poll(async () => (await saved())?.icon).toBe('Truck');
  const made = (await saved())!;
  await expect(page.getByTestId(`category-icon-${made.id}`)).toHaveAttribute('data-icon', 'Truck');

  const name = `Deliveries ${stamp}`;
  expect((await api.post('/kpis', { data: { name, scope: 'ORG_WIDE', categoryId: made.id } })).status()).toBe(201);
  await page.goto('/kpis');
  const chip = page.getByTestId(`kpi-row-${name}`).getByTestId('kpi-category');
  await expect(chip).toContainText(`Logistics ${stamp}`);
  await expect(chip.getByTestId('kpi-category-icon')).toHaveAttribute('data-icon', 'Truck');
});
