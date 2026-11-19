/**
 * Flow walk (the invited person): the page that accepts an invitation read
 * "Invitation expires 2026-11-26 08:53" — the time in UTC, without saying so,
 * to someone five hours ahead of it. Nobody is signed in on that page, so no
 * organisation's settings apply: it now uses the reader's own clock and names it.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test.use({ timezoneId: 'Asia/Karachi', locale: 'en-US' });

test("an invitation's expiry is written on the reader's own clock, and says which", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `iec-${stamp}`,
      slug: `iec-${stamp}`,
      adminFullName: 'Iman Admin',
      adminEmail: `admin-${stamp}@iec.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const invited = (await (await api.post('/users', { data: { email: `bilal-${stamp}@iec.test.local`, fullName: 'Bilal Invited' } })).json()) as { inviteToken: string };
  const anon = await request.newContext({ baseURL: API_URL });
  const preview = (await (await anon.post('/auth/invitation-preview', { data: { token: invited.inviteToken } })).json()) as { expiresAt: string };

  // The invited person is not signed in.
  const fresh = await page.context().browser()!.newContext({ timezoneId: 'Asia/Karachi', locale: 'en-US' });
  const visitor = await fresh.newPage();
  await visitor.goto(`/accept-invitation?token=${encodeURIComponent(invited.inviteToken)}`);
  const expiry = visitor.getByTestId('invite-preview-expires');
  const expected = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Karachi', timeZoneName: 'short',
  }).format(new Date(preview.expiresAt));
  await expect(expiry).toHaveText(expected);
  await expect(expiry).toContainText('GMT+5');
  await fresh.close();
});
