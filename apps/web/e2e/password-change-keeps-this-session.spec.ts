/**
 * Manual QA (2026-11-20, F-061): changing your password, or turning two-step sign-in off, revoked every
 * session including the one the change was made from, so the page half-worked until the access token ran
 * out and then dumped the person at sign-in. The session the change is made from stays; the others go.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('changing the password keeps the session it was made from and signs the others out', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `admin-${stamp}@keep.test.local`;
  const password = 'correct-horse-battery-staple';
  try {
    await registerOrgViaApi(page, { orgName: `keep-${stamp}`, slug: `keep-${stamp}`, adminFullName: 'Kay Admin', adminEmail: email, adminPassword: password });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL });
  const login = async () => (await (await api.post('/auth/login', { data: { email, password } })).json()) as { accessToken: string; refreshToken: string };
  const here = await login(); // this device
  const elsewhere = await login(); // another device

  const changed = await api.post('/auth/me/change-password', {
    headers: { authorization: `Bearer ${here.accessToken}` },
    data: { currentPassword: password, newPassword: 'Another-horse-battery-staple-2' },
  });
  expect(changed.status(), await changed.text()).toBeLessThan(300);

  // This device carries on: its refresh token still works. The other device is signed out.
  expect((await api.post('/auth/refresh', { data: { refreshToken: here.refreshToken } })).status()).toBe(200);
  expect((await api.post('/auth/refresh', { data: { refreshToken: elsewhere.refreshToken } })).status()).toBe(401);
});
