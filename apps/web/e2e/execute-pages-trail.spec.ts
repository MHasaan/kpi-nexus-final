/**
 * Flow walk: the five pages under "Execute" in the menu each named their place
 * differently in the top bar — "Automation / Workflows / Automations",
 * "OKRs / Objectives", "Execute / Reports", and Tasks and Approvals with no
 * group at all. Each now reads "Execute / <page>", as the menu groups them.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('the top bar of every Execute page says Execute, then the page', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `ept-${stamp}`,
      slug: `ept-${stamp}`,
      adminFullName: 'Eve Admin',
      adminEmail: `admin-${stamp}@ept.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }

  const pages: Array<[string, string]> = [
    ['/okrs', 'Objectives'],
    ['/tasks', 'Tasks'],
    ['/approvals', 'Approvals'],
    ['/workflows', 'Automations'],
    ['/reports', 'Reports'],
  ];
  for (const [path, title] of pages) {
    await page.goto(path);
    const trail = page.getByRole('banner').getByTestId('top-bar-trail');
    await expect(trail, path).toHaveText(new RegExp(`^Execute\\s*/\\s*${title}$`));
  }
});
