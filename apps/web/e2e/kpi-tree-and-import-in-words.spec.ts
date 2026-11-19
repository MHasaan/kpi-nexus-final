/**
 * Flow walk (KPI pages): the Tree page described itself "by BFS level", and the
 * Import page said it creates "ORG_WIDE" KPIs. Both now say it in words.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('the KPI Tree and Import pages describe themselves in words', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `kti-${stamp}`,
      slug: `kti-${stamp}`,
      adminFullName: 'Kira Admin',
      adminEmail: `admin-${stamp}@kti.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }

  await page.goto('/kpis/tree');
  const tree = page.getByTestId('kpi-tree-intro');
  await expect(tree).toContainText('the KPIs that feed them');
  await expect(tree).not.toContainText('BFS');

  await page.goto('/kpis/import');
  const intro = page.getByTestId('kpi-import-intro');
  await expect(intro).toContainText('organisation-wide');
  await expect(intro).not.toContainText('ORG_WIDE');
});
