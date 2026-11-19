/**
 * Flow walk (settings): on AI settings the choice for a reached cap reads "Stop
 * AI until it resets" or "Use each feature's fallback model", and the note
 * under the bars explained two other things: "Fail closed" and "Fallback". The
 * note now uses the words of the choices it explains.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('AI settings explain a reached cap in the words of the choice itself', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `abh-${stamp}`,
      slug: `abh-${stamp}`,
      adminFullName: 'Abid Admin',
      adminEmail: `admin-${stamp}@abh.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/settings/ai');
  const note = page.getByTestId('ai-circuit-breaker-legend');
  await expect(note).toContainText('“Stop AI until it resets” refuses further AI calls');
  await expect(note).toContainText('“Use each feature’s fallback model” keeps AI working');
  await expect(note).not.toContainText('Fail closed');
});
