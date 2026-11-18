/**
 * X-07 (remainder): the failed-deliveries page showed the newest 100 and gave
 * no way to see older ones, nor any sign that there were more. It now offers
 * "Show older", up to the 500 the API gives at once, and says when that is reached.
 *
 * The list is stubbed (a hundred real failed deliveries cannot be made in a test);
 * what is checked is what the page asks for and shows.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const delivery = (n: number) => ({
  id: `del_${String(n).padStart(4, '0')}`,
  organizationId: 'org',
  alertId: `alert_${n}`,
  channelId: null,
  targetUserId: null,
  status: 'FAILED',
  attempts: 3,
  error: 'SMTP refused',
  sentAt: null,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 600 - n)).toISOString(),
});

test('failed deliveries: older ones can be shown, and the page says when it has reached the most it can show', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `dso-${stamp}`,
      slug: `dso-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@dso.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }

  let total = 320;
  const asked: number[] = [];
  await page.route('**/notification-deliveries?**', async (route) => {
    const limit = Number(new URL(route.request().url()).searchParams.get('limit') ?? '100');
    asked.push(limit);
    const rows = Array.from({ length: Math.min(limit, total, 500) }, (_, i) => delivery(i));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  });

  await page.goto('/settings/notifications/dlq');
  const rows = page.locator('[data-testid^="dlq-row-"]');
  await expect(rows).toHaveCount(100);
  await expect(page.getByTestId('dlq-count')).toContainText('the newest 100');

  await page.getByTestId('dlq-show-older').click();
  await expect(rows).toHaveCount(300);
  await page.getByTestId('dlq-show-older').click();
  await expect(rows).toHaveCount(320);
  // Everything is on the page: nothing older to offer.
  await expect(page.getByTestId('dlq-show-older')).toHaveCount(0);
  await expect(page.getByTestId('dlq-count')).toContainText('320 failed deliveries');
  expect(asked).toEqual([100, 300, 500]);

  // More than can be shown at once: the page says so instead of looking complete.
  total = 900;
  await page.getByTestId('dlq-refresh').click();
  await expect(rows).toHaveCount(500);
  await expect(page.getByTestId('dlq-count')).toContainText('the newest 500');
  await expect(page.getByTestId('dlq-count')).toContainText('There may be older ones');
  await expect(page.getByTestId('dlq-show-older')).toHaveCount(0);
});
