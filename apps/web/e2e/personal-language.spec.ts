/**
 * Plan 6.2: a person's language was kept only in the browser it was chosen
 * in. It is saved on their account now, so it follows them to another device.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('language: chosen once, it is saved on the account and applied in a fresh browser', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string; refreshToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `lng-${stamp}`,
      slug: `lng-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@lng.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const language = async () => ((await (await api.get('/auth/me')).json()) as { user: { language?: string | null } }).user.language ?? null;
  expect(await language()).toBeNull();

  await page.goto('/profile');
  await page.getByRole('tab', { name: 'Preferences' }).click();
  // Only languages with translations are offered (F-065): Spanish and French are not in the list.
  const offered = await page.getByTestId('locale-select').locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  expect(offered).toContain('en-US');
  expect(offered).not.toContain('fr');
  expect(offered).not.toContain('es');
  await page.getByTestId('locale-select').selectOption('ur-PK');
  await expect.poll(language).toBe('ur-PK');

  // Another device: nothing stored in the browser but the session.
  const other = await browser.newContext();
  const fresh = await other.newPage();
  await fresh.goto('/login');
  await fresh.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
      window.localStorage.setItem('kpi-nexus.tour-completed', '1');
    },
    [session.accessToken, session.refreshToken] as const,
  );
  await fresh.goto('/dashboard');
  await expect(fresh.locator('html')).toHaveAttribute('lang', 'ur-PK');
  await other.close();

  // A language the app does not have is refused.
  expect((await api.patch('/auth/me', { data: { language: 'tlh' } })).status()).toBe(400);
});
