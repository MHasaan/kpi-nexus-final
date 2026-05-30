/**
 * P6 onboarding wizard (browser e2e). Drives the public /signup → wizard flow:
 * template gallery → apply rich template → wizard shows seed.ts depth → complete
 * → dashboard with the setup checklist; plus draft resume and live AI generate.
 * Requires the api at $API_URL; the web app is auto-started by Playwright.
 */
import { type Page, expect, test } from '@playwright/test';

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
  if (!apiAvailable) console.warn('[skip] api not reachable — onboarding-wizard skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fillEntry(page: Page, stamp: string): Promise<void> {
  await page.goto('/signup');
  await page.getByTestId('signup-email').fill(`admin-${stamp}@wiz.test.local`);
  await page.getByTestId('signup-org').fill(`Wiz ${stamp}`);
}

test('wizard: template gallery → apply rich → complete → dashboard + checklist', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(60_000);
  const stamp = suffix();
  await fillEntry(page, stamp);

  await page.getByTestId('entry-template').click();
  await expect(page.getByTestId('template-gallery')).toBeVisible();
  await page.getByTestId('use-template-saas-startup-rich').click();

  // Wizard shows the rich template's seed.ts depth.
  await expect(page).toHaveURL(/\/signup\/wizard/);
  await expect(page.getByTestId('count-roles')).toHaveText('10', { timeout: 15_000 });
  await expect(page.getByTestId('count-kpis')).toHaveText('20');

  // Finish.
  await page.getByTestId('admin-name').fill('Wiz Admin');
  await page.getByTestId('admin-email').fill(`admin-${stamp}@wiz.test.local`);
  await page.getByTestId('admin-password').fill('correct-horse-battery-staple');
  await page.getByTestId('org-slug').fill(`wiz-${stamp}`);
  await page.getByTestId('wizard-complete').click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await expect(page.getByTestId('setup-checklist-card')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('dashboard-heading')).toBeVisible();
});

test('wizard: draft survives a reload (resume banner restores the session)', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(45_000);
  const stamp = suffix();
  await fillEntry(page, stamp);

  await page.getByTestId('entry-quick').click();
  await expect(page).toHaveURL(/\/signup\/wizard/);
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Wiz ${stamp}`, { timeout: 15_000 });

  // Reopen /signup (simulating a reload/crash) → resume banner from localStorage.
  await page.goto('/signup');
  await expect(page.getByTestId('resume-banner')).toBeVisible();
  await page.getByTestId('resume-button').click();
  await expect(page).toHaveURL(/\/signup\/wizard/);
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Wiz ${stamp}`, { timeout: 15_000 });
});

test('wizard: AI co-pilot generate populates a draft (live)', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(90_000);
  const stamp = suffix();
  await fillEntry(page, stamp);

  await page.getByTestId('entry-full').click();
  await expect(page).toHaveURL(/\/signup\/wizard/);
  await page.getByTestId('ai-prompt').fill('B2B SaaS startup, 50 employees');
  await page.getByTestId('ai-generate').click();
  await expect(page.getByTestId('ai-diff')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('ai-apply').click();
  // After apply, the review counts reflect the generated org.
  await expect(page.getByTestId('count-roles')).not.toHaveText('0', { timeout: 15_000 });
});
