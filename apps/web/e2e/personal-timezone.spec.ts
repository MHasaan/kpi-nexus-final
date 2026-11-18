/**
 * Plan 6.2: times are shown in the organisation's timezone. A person in
 * another timezone can choose their own, saved on their account.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** "2026-11-18 09:30" read as UTC, moved by `hours`, written the same way. */
function shift(stamp: string, hours: number): string {
  const moved = new Date(new Date(`${stamp.replace(' ', 'T')}:00.000Z`).getTime() + hours * 3_600_000);
  return `${moved.toISOString().slice(0, 10)} ${moved.toISOString().slice(11, 16)}`;
}

test('timezone: a person can see times in their own timezone, and go back to the organisation\'s', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `ptz-${stamp}`,
      slug: `ptz-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@ptz.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  await api.post('/kpis', { data: { name: `Audited ${stamp}`, scope: 'ORG_WIDE', unit: '%' } });
  const timezone = async () => ((await (await api.get('/auth/me')).json()) as { user: { timezone?: string | null } }).user.timezone ?? null;

  const firstTime = () => page.getByTestId('audit-list').getByText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/).first();
  await page.goto('/settings/audit');
  const inUtc = await firstTime().innerText();

  // Karachi is five hours ahead of UTC all year.
  await page.goto('/profile');
  await page.getByRole('tab', { name: 'Preferences' }).click();
  await page.getByTestId('timezone-select').selectOption('Asia/Karachi');
  await expect.poll(timezone).toBe('Asia/Karachi');

  await page.goto('/settings/audit');
  await expect(firstTime()).toHaveText(shift(inUtc, 5));

  // Back to the organisation's.
  await page.goto('/profile');
  await page.getByRole('tab', { name: 'Preferences' }).click();
  await page.getByTestId('timezone-select').selectOption('');
  await expect.poll(timezone).toBeNull();
  await page.goto('/settings/audit');
  await expect(firstTime()).toHaveText(inUtc);

  // A timezone that does not exist is refused.
  expect((await api.patch('/auth/me', { data: { timezone: 'Mars/Olympus' } })).status()).toBe(400);
});
