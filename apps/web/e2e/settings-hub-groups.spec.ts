/**
 * Flow walk (settings): the Settings page filed Notifications, AI, Data
 * retention and Custom domain under "Integrations", among Slack and webhooks.
 * Each is now under the heading a person would look for it under.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('the Settings page files each setting under a heading that fits it', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `shg-${stamp}`,
      slug: `shg-${stamp}`,
      adminFullName: 'Sana Admin',
      adminEmail: `admin-${stamp}@shg.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/settings');
  const group = (name: string) => page.getByTestId(`settings-group-${name}`);

  // Integrations holds what connects KPI Nexus to other systems, and nothing else.
  await expect(group('integrations').getByRole('link')).toHaveText([
    /^Connected apps/, /^Data connectors/, /^Alert channels/, /^Automations/, /^Plugins/, /^API keys/, /^Webhooks/,
  ]);
  await expect(group('general').getByTestId('settings-link-settings-notifications')).toBeVisible();
  await expect(group('general').getByTestId('settings-link-settings-custom-domain')).toBeVisible();
  await expect(group('security').getByTestId('settings-link-settings-retention')).toBeVisible();
  await expect(group('ai').getByTestId('settings-link-settings-ai')).toBeVisible();
});
