/**
 * Flow walk (Ask): an answer holding one long unbroken run — a web address, an
 * identifier, a line of data — widened its bubble past the page, and the whole
 * Ask page scrolled sideways. The answer now wraps inside its bubble.
 *
 * The answer is stubbed: this checks the page, not what a model says.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('ask: an answer with a long unbroken run stays on the page', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `aas-${stamp}`,
      slug: `aas-${stamp}`,
      adminFullName: 'Asma Admin',
      adminEmail: `admin-${stamp}@aas.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const long = `https://example.test/reports/${'quarterly-revenue-by-region-'.repeat(12)}2026`;
  await page.route('**/nlq/ask', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ answer: `Revenue is up. See ${long} for the breakdown.`, sources: [], costUsd: 0, toolCalls: [] }),
    }),
  );

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/ask');
  await page.getByTestId('ask-input').fill('How is revenue doing?');
  await page.getByTestId('ask-send').click();
  const answer = page.getByTestId('ask-answer');
  await expect(answer).toContainText('Revenue is up.');

  // Nothing runs off the side: not the page, not the column the conversation is in.
  const overflow = await page.getByRole('main').evaluate((main) => main.scrollWidth - main.clientWidth);
  expect(overflow).toBe(0);
  const box = (await answer.boundingBox())!;
  const column = (await page.getByTestId('ask-messages').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(column.x + column.width + 1);
});
