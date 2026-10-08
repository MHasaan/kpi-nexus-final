/**
 * P6 first-login product tour (browser e2e). On first dashboard visit a 5-slide
 * tour appears; completing it persists a flag so it never reappears. Requires
 * the api at $API_URL; the web app is auto-started by Playwright.
 */
import { type Page, expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

// playwright.config pre-completes the tour for every other spec; start clean here.
test.use({ storageState: { cookies: [], origins: [] } });

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
  if (!apiAvailable) console.warn('[skip] api not reachable — onboarding-tour skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function loginToDashboard(page: Page, stamp: string): Promise<void> {
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Tour ${stamp}`,
      slug: `tour-${stamp}`,
      adminEmail: `admin-${stamp}@tour.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Tour Admin',
    },
  })).json()) as { accessToken: string; refreshToken: string };
  await page.goto('/');
  await page.evaluate(
    ([at, rt]) => {
      window.localStorage.setItem('kpi-nexus.access-token', at);
      window.localStorage.setItem('kpi-nexus.refresh-token', rt);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );
}

test('tour: appears on first dashboard visit, completes through 5 slides, never returns', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(45_000);
  await loginToDashboard(page, suffix());

  await page.goto('/dashboard');
  await expect(page.getByTestId('onboarding-tour')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('tour-title')).toHaveText('Welcome to KPI Nexus');

  // Click through the 4 "Next" slides then "Get started".
  for (let i = 0; i < 4; i += 1) {
    await page.getByTestId('tour-next').click();
  }
  await page.getByTestId('tour-done').click();
  await expect(page.getByTestId('onboarding-tour')).toHaveCount(0);

  // Reload → tour does not reappear (flag persisted).
  await page.reload();
  await expect(page.getByTestId('dashboard-heading')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('onboarding-tour')).toHaveCount(0);
});

test('tour: Skip dismisses it immediately', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(45_000);
  await loginToDashboard(page, suffix());

  await page.goto('/dashboard');
  await expect(page.getByTestId('onboarding-tour')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('tour-skip').click();
  await expect(page.getByTestId('onboarding-tour')).toHaveCount(0);
});
