/**
 * Plan 7.7 (share-link expiry): a link past its expiry was still listed as
 * "active" with a Copy button, the expiry showed a day but not the time that
 * was chosen, and an expiry already in the past was accepted.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('share links: an expired link is shown as expired; a past expiry is refused', async ({ page }) => {
  test.setTimeout(60_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `sle-${stamp}`,
      slug: `sle-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@sle.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const dashboard = (await (await api.post('/dashboards', { data: { name: `Board ${stamp}` } })).json()) as { id: string };

  // The API refuses an expiry that has already passed.
  const past = await api.post(`/dashboards/${dashboard.id}/share`, { data: { expiresAt: new Date(Date.now() - 60_000).toISOString() } });
  expect(past.status()).toBe(400);

  // One link that lasts, one that runs out in a few seconds.
  expect((await api.post(`/dashboards/${dashboard.id}/share`, { data: {} })).status()).toBe(201);
  const short = (await (await api.post(`/dashboards/${dashboard.id}/share`, {
    data: { expiresAt: new Date(Date.now() + 4_000).toISOString() },
  })).json()) as { id: string; token: string };
  await page.waitForTimeout(5_000);

  await page.goto(`/dashboards/${dashboard.id}/share`);
  await expect(page.getByTestId('share-link-row')).toHaveCount(1);
  const expired = page.getByTestId(`share-link-expired-${short.id}`);
  await expect(expired).toContainText('expired');
  // No Copy on a link that opens nothing; it can still be removed.
  await expect(expired.getByRole('button', { name: 'Copy' })).toHaveCount(0);
  await expect(expired.getByRole('button', { name: 'Remove' })).toBeVisible();
  // And it really is dead.
  expect((await (await request.newContext({ baseURL: API_URL })).get(`/public/dashboards/${short.token}`)).status()).toBeGreaterThanOrEqual(400);

  // The form refuses a time already past, before asking the API.
  await page.getByTestId('share-expiry').fill('2020-01-01T10:00');
  await page.getByTestId('share-create-submit').click();
  await expect(page.getByTestId('share-create-error')).toContainText('in the future');
  await expect(page.getByTestId('share-link-row')).toHaveCount(1);
});
