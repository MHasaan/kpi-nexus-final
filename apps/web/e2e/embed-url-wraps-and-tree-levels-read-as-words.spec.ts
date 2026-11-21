/**
 * Manual QA (2026-11-19, F-027): on the Embed page the long public address did not wrap, so the whole page got
 * a horizontal scrollbar; and the KPI tree labelled its levels "L0", "L1". The address wraps, and the levels
 * read as words.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('the embed page does not scroll sideways, and the tree says "Top level" and "Level 2"', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `tree-${stamp}`,
      slug: `tree-${stamp}`,
      adminFullName: 'Tia Admin',
      adminEmail: `admin-${stamp}@tree.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const make = async (name: string) => ((await (await api.post('/kpis', { data: { name: `${name} ${stamp}`, scope: 'ORG_WIDE', aggregationMethod: 'SUM' } })).json()) as { id: string }).id;
  const total = await make('Total');
  const region = await make('Region');
  const team = await make('Team');
  expect((await api.post('/kpi-cascades', { data: { parentKpiId: total, childKpiId: region, method: 'SUM' } })).status()).toBe(201);
  expect((await api.post('/kpi-cascades', { data: { parentKpiId: region, childKpiId: team, method: 'SUM' } })).status()).toBe(201);

  await page.goto('/kpis/tree');
  const roots = page.getByTestId('tree-roots');
  await expect(roots.getByText(`Total ${stamp}`)).toBeVisible();
  await expect(roots.getByText('Top level', { exact: true })).toHaveCount(1);
  await expect(roots.getByText('Level 2', { exact: true })).toHaveCount(1);
  await expect(roots.getByText(/^L\d$/)).toHaveCount(0);

  // The embed page: a token and its long address, and no sideways scroll.
  await page.setViewportSize({ width: 1140, height: 800 });
  await page.goto(`/kpis/${total}/embed`);
  await page.getByTestId('embed-generate-btn').click();
  await expect(page.getByTestId('embed-token-output')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});
