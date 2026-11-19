/**
 * Flow walk (phone): on a 375-pixel screen the home page's time-range switch
 * was squeezed beside "New KPI" until each option broke onto three lines —
 * "Last / 7 / days".
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('on a phone the home page’s range switch keeps each option on one line', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `hrp-${stamp}`,
      slug: `hrp-${stamp}`,
      adminFullName: 'Hana Admin',
      adminEmail: `admin-${stamp}@hrp.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  expect((await api.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE' } })).status()).toBe(201);

  await page.goto('/dashboard');
  const range = page.getByTestId('dashboard-range');
  await expect(range).toBeVisible({ timeout: 15_000 });
  const option = range.getByRole('radio', { name: 'Last 30 days' }).or(range.getByRole('button', { name: 'Last 30 days' })).or(range.getByText('Last 30 days'));
  const box = (await option.first().boundingBox())!;
  // One line of text: well under the three lines (about 70 pixels) it used to take.
  expect(box.height).toBeLessThan(44);
  // Nothing runs off the side for it.
  const overflow = await page.locator('main#main-content').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(range).toBeInViewport({ ratio: 1 });
});
