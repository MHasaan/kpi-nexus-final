/**
 * Flow walk: the menu files Dashboards and Alerts under "Measure"; their top
 * bar said "Workspace / Dashboards" and "Workspace / Alerts" — the name of
 * another group in the same menu. The top bar now names the group the menu does.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('the top bar of the Dashboards and Alerts pages says Measure, as the menu does', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `mpt-${stamp}`,
      slug: `mpt-${stamp}`,
      adminFullName: 'Mona Admin',
      adminEmail: `admin-${stamp}@mpt.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const trail = page.getByRole('banner').getByTestId('top-bar-trail');
  for (const [path, expected] of [
    ['/dashboards', /^Measure\s*\/\s*Dashboards$/],
    ['/alerts', /^Measure\s*\/\s*Alerts$/],
    ['/alerts/rules', /^Measure\s*\/\s*Alerts\s*\/\s*Alert rules$/],
  ] as const) {
    await page.goto(path);
    await expect(trail, path).toHaveText(expected);
    await expect(trail, path).not.toContainText('Workspace');
  }
});
