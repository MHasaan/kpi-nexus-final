/**
 * Flow walk (approvals): each "Who can approve" list is named for a screen
 * reader, and the name was lower-cased whole — "Who can approve kpi changes",
 * read out as a word. It keeps "KPI" as it is written.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('the approvals page names each list of approvers as it is written', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `agn-${stamp}`,
      slug: `agn-${stamp}`,
      adminFullName: 'Agha Admin',
      adminEmail: `admin-${stamp}@agn.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/approvals');
  await expect(page.getByRole('group', { name: 'Who can approve KPI changes', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Who can approve KPI targets', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Who can approve role permissions', exact: true })).toBeVisible();
});
