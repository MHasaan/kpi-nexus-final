/**
 * Flow walk (integrations): at 1280 px each card squeezed its icon, its status,
 * its name and its description into one row: "Not connected" broke over two
 * lines and the description was a column a few words wide. The name and the
 * description now sit under the icon and the status, as the card was drawn.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('integration cards stack name and description under the icon at 1280 px', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.setViewportSize({ width: 1280, height: 900 });
  try {
    await registerOrgViaApi(page, {
      orgName: `icn-${stamp}`,
      slug: `icn-${stamp}`,
      adminFullName: 'Iqra Admin',
      adminEmail: `admin-${stamp}@icn.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/integrations');
  const card = page.getByTestId('integration-card-slack');
  await expect(card).toBeVisible();
  const status = (await page.getByTestId('integration-status-slack').boundingBox())!;
  const title = (await card.getByRole('heading', { name: 'Slack' }).boundingBox())!;
  const description = (await card.getByText('Use /kpi and acknowledge alerts from Slack.').boundingBox())!;
  // "Not connected" on one line.
  expect(status.height).toBeLessThan(28);
  // The name under the status row, the description under the name.
  expect(title.y).toBeGreaterThanOrEqual(status.y + status.height - 1);
  expect(description.y).toBeGreaterThanOrEqual(title.y + title.height - 1);
  // And the description has the card's width to itself, not a sliver of it.
  const box = (await card.boundingBox())!;
  expect(description.width).toBeGreaterThan(box.width * 0.6);
});
