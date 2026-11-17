/**
 * QA-L15 and plan 7.7 (global search keys): the ⌘K search kept its last query
 * after closing, so typing again appended to it; and results could only be
 * opened with the mouse.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('global search: closing forgets the query; arrow keys and Enter open a result', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `gsk-${stamp}`,
      slug: `gsk-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@gsk.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const first = (await (await api.post('/kpis', { data: { name: `Zephyr One ${stamp}`, scope: 'ORG_WIDE', unit: '%' } })).json()) as { id: string };
  const second = (await (await api.post('/kpis', { data: { name: `Zephyr Two ${stamp}`, scope: 'ORG_WIDE', unit: '%' } })).json()) as { id: string };

  await page.goto('/dashboard');
  await page.getByTestId('global-search-trigger').click();
  const input = page.getByTestId('global-search-input');
  await input.fill('Zephyr');
  await expect(page.getByTestId(`search-result-${first.id}`)).toBeVisible();
  await expect(page.getByTestId(`search-result-${second.id}`)).toBeVisible();

  // Closing forgets the query.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('global-search-modal')).toHaveCount(0);
  await page.getByTestId('global-search-trigger').click();
  await expect(input).toHaveValue('');

  // Arrow keys move through the results; Enter opens the one they are on.
  await input.fill('Zephyr');
  const results = page.locator('[data-testid^="search-result-"]');
  await expect(results).toHaveCount(2);
  await expect(results.nth(0)).toHaveAttribute('data-active', 'true');
  await input.press('ArrowDown');
  await expect(results.nth(1)).toHaveAttribute('data-active', 'true');
  const target = await results.nth(1).getAttribute('href');
  await input.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${target}$`));
  await expect(page.getByTestId('global-search-modal')).toHaveCount(0);
});
