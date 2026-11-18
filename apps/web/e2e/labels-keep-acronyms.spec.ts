/**
 * QA-L16: page text lowercased the organisation's labels wholesale, so "KPI"
 * read "kpi" ("pick a few kpis", "Search kpis…").
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('labels: an acronym keeps its capitals in page text', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `lbl-${stamp}`,
      slug: `lbl-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@lbl.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/dashboards/new');
  await expect(page.getByText(/pick a few KPIs to start with/)).toBeVisible();
  await expect(page.getByPlaceholder('Search KPIs…')).toBeVisible();
  await expect(page.getByText(/kpis/)).toHaveCount(0);
  // An ordinary word is still lowercased mid-sentence.
  await expect(page.getByTestId('dashboards-new-heading')).toContainText('New dashboard');
});
