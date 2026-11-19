/**
 * Flow walk (first use): the values table on a KPI's Data tab, and the table on
 * its Assignments tab, each had a sideways scroll bar under them at any width —
 * even when empty. The hidden "Actions" heading was taken out of the table's
 * layout and sat past its right-hand edge.
 */
import { type Page, expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** How far the table's contents run past the box they are shown in. */
async function overflow(page: Page): Promise<number> {
  const table = page.locator('main table').first();
  await expect(table).toBeVisible();
  return table.evaluate((el) => {
    const box = el.parentElement!;
    return box.scrollWidth - box.clientWidth;
  });
}

test("a KPI's Data and Assignments tables fit their box", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `kts-${stamp}`,
      slug: `kts-${stamp}`,
      adminFullName: 'Tara Admin',
      adminEmail: `admin-${stamp}@kts.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const me = ((await (await api.get('/auth/me')).json()) as { user: { id: string } }).user;
  const kpi = (await (await api.post('/kpis', { data: { name: `Calls ${stamp}`, scope: 'PER_USER', userIds: [me.id] } })).json()) as { id: string };

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/kpis/${kpi.id}?tab=data`);
  await expect(page.getByText('No data points yet.')).toBeVisible();
  expect(await overflow(page)).toBe(0);
  // The heading is still there for a screen reader.
  await expect(page.locator('main table th').last()).toHaveText('Actions');

  await page.goto(`/kpis/${kpi.id}?tab=assignments`);
  await expect(page.locator('main table').first()).toContainText('Tara Admin');
  expect(await overflow(page)).toBe(0);
});
