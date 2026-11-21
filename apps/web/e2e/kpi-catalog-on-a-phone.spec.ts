/**
 * Manual QA (2026-11-20, F-060): on a phone the KPI catalog showed only Name and Scope; Status, Target and
 * the Record value / Edit actions were off-screen, and swiping sideways scrolled the page, so a value could
 * not be recorded from the catalog. Filter boxes had their chevron detached at the far right. On a phone the
 * actions now sit under the name, the less-needed columns step aside, and a chevron stays in its box.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('on a phone the KPI catalog offers Record value and the status without sideways scrolling', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `ph-${stamp}`,
      slug: `ph-${stamp}`,
      adminFullName: 'Pam Admin',
      adminEmail: `admin-${stamp}@ph.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const name = `MRR ${stamp}`;
  expect((await api.post('/kpis', { data: { name, scope: 'ORG_WIDE', type: 'CURRENCY', targetValue: 250_000 } })).status()).toBe(201);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/kpis');
  const row = page.getByTestId(`kpi-row-${name}`);
  await expect(row).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

  // Record value and Edit are on screen, under the name; the status too.
  const record = page.getByTestId(`expand-kpi-phone-${name}`);
  await record.scrollIntoViewIfNeeded();
  await expect(record).toBeInViewport({ ratio: 1 });
  await expect(row.getByTestId(`kpi-status-badge-${name}`)).toBeInViewport({ ratio: 1 });
  await record.click();
  await expect(page.getByTestId(`kpi-data-panel-${name}`)).toBeVisible();

  // A filter's chevron sits in its box, not at the far edge of the page.
  const select = page.getByTestId('kpi-filter-category');
  const selectBox = await select.boundingBox();
  const chevron = await select.locator('xpath=..').locator('svg').boundingBox();
  expect(chevron!.x + chevron!.width).toBeLessThanOrEqual(selectBox!.x + selectBox!.width + 1);
  expect(chevron!.x).toBeGreaterThan(selectBox!.x);
});
