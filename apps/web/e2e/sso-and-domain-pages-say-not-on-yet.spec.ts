/**
 * Flow walk (settings): the Single sign-on page said "Users authenticate at
 * your IdP", with an "Active" tick box; the Custom domain page said "Serve KPI
 * Nexus from your own domain". Neither is switched on in this version (UI-014,
 * waiting for ADR-002 and ADR-003): the settings are kept and nothing acts on
 * them. An administrator could tick "Active" and believe SSO was on. Each page
 * now says so.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('the SSO and custom-domain pages say they are not switched on yet', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `sdn-${stamp}`,
      slug: `sdn-${stamp}`,
      adminFullName: 'Sadia Admin',
      adminEmail: `admin-${stamp}@sdn.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/settings/sso');
  await expect(page.getByTestId('sso-not-on-yet')).toContainText('Not switched on yet');
  await expect(page.getByTestId('sso-not-on-yet')).toContainText('email and password');

  await page.goto('/settings/custom-domain');
  await expect(page.getByTestId('custom-domain-not-on-yet')).toContainText('Not switched on yet');
});
