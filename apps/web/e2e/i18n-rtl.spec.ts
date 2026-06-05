/**
 * P9 i18n (browser e2e). Switching locale to ur-PK on /profile flips the
 * document to RTL and renders the translated language label. Authenticated via
 * a seeded session (API register → localStorage tokens). Requires the api at
 * $API_URL; the web app is auto-started by Playwright.
 */
import { type Page, expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    return (await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) console.warn('[skip] api not reachable — i18n-rtl skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function seedSession(page: Page): Promise<void> {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = await anon.post('/auth/register', {
    data: { orgName: `i18n ${stamp}`, slug: `i18n-${stamp}`, adminEmail: `admin-${stamp}@i18n.test.local`, adminPassword: 'correct-horse-battery-staple', adminFullName: 'i18n Admin' },
  });
  const tok = (await reg.json()) as { accessToken: string; refreshToken: string };
  await page.addInitScript(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [tok.accessToken, tok.refreshToken] as const,
  );
}

test('switch to ur-PK → document flips to RTL + translated label renders', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(45_000);
  await seedSession(page);

  await page.goto('/profile');
  // Language lives under the Preferences tab on the rebuilt Account-settings page.
  await page.getByRole('tab', { name: 'Preferences' }).click();
  await expect(page.getByTestId('locale-select')).toBeVisible({ timeout: 15_000 });

  // Default is LTR English.
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

  // Switch to Urdu (Pakistan).
  await page.getByTestId('locale-select').selectOption('ur-PK');

  // Document flips to RTL + lang updates, and the language label is translated.
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ur-PK');
  await expect(page.getByTestId('language-heading')).toHaveText('زبان');

  // Persists across reload (localStorage-backed).
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});
