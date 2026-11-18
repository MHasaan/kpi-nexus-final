/**
 * Plan 6.4 (board pack): the board pack's period read as two raw timestamps
 * ("2026-10-19T09:00:00.000Z – …") and did not say which fiscal period it is
 * in. It now reads as dates written the organisation's way, with the fiscal
 * year and quarter of its last day in the organisation's own calendar.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/**
 * The label for today in a fiscal year that starts in July, worked out here by hand
 * (the contracts package is ESM-only and cannot be imported by a Playwright spec).
 */
function julyYearLabel(now: Date): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const start = m >= 7 ? y : y - 1;
  const quarter = Math.floor(((m - 7 + 12) % 12) / 3) + 1;
  return `FY ${start}/${String((start + 1) % 100).padStart(2, '0')}, Q${quarter}`;
}

test('board pack: the period reads as dates, and names the fiscal year and quarter', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `bpp-${stamp}`,
      slug: `bpp-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@bpp.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  // A fiscal year that starts in July.
  expect((await api.patch('/organizations/me', { data: { fiscalCalendar: { startMonth: 7 } } })).ok()).toBe(true);

  await page.goto('/reports/board-pack');
  const period = page.getByTestId('board-pack-period');
  await expect(period).toContainText('30 days');
  // No raw timestamp.
  await expect(period).not.toContainText(/\d{2}T\d{2}:\d{2}/);
  await expect(period).toContainText(julyYearLabel(new Date()));
});
