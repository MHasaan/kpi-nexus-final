/**
 * AI settings listed each feature by its internal key ("NLQ_PRIMARY"). The
 * table now names it in words and says what it does.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('AI settings: each feature is named in words, with what it does', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `afn-${stamp}`,
      slug: `afn-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@afn.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/settings/ai');
  const ask = page.getByTestId('ai-config-NLQ_PRIMARY');
  await expect(ask).toBeVisible();
  await expect(ask.getByTestId('ai-config-NLQ_PRIMARY-name')).toHaveText('Ask');
  await expect(ask).toContainText('Answers questions on the Ask page');
  await expect(ask).not.toContainText('NLQ_PRIMARY');
  await expect(page.getByTestId('ai-config-ONBOARDING_ASSISTANT-name')).toHaveText('Setup wizard: assistant');
  await expect(ask.getByLabel('Provider for Ask', { exact: true })).toBeVisible();
});
