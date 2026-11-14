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

test('wizard: co-pilot rail — assistant, suggest and explain modes write to the draft', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(60_000);
  // The three AI modes are stubbed (CI's AI mock returns one canned object for
  // every call); the draft writes go to the real API.
  let assistantCalls = 0;
  await page.route('**/onboarding/ai/assistant', async (route) => {
    assistantCalls += 1;
    if (assistantCalls > 1) {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'RATE_LIMITED', message: 'Too many assistant requests; try again later', details: { retryAfter: 3600 } }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        interactionId: 'stub-1',
        mode: 'assistant',
        patch: [
          { op: 'add', path: '/roles/-', value: { name: 'Head of Design', permissions: ['KPI_VIEW'], isAdmin: false, level: 2 } },
          { op: 'replace', path: '/organization/name', value: 'Should stay rejected' },
        ],
      }),
    });
  });
  await page.route('**/onboarding/ai/suggest', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ interactionId: 'stub-2', mode: 'suggest', suggestions: ['Growth', 'Customer'] }) }),
  );
  await page.route('**/onboarding/ai/explain', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ interactionId: 'stub-3', mode: 'explain', explanation: 'Roles bundle permissions.' }) }),
  );

  const stamp = suffix();
  await fillEntry(page, stamp);
  await page.getByTestId('entry-quick').click();
  await expect(page).toHaveURL(/\/signup\/wizard/);
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Wiz ${stamp}`, { timeout: 15_000 });
  await expect(page.getByTestId('copilot-rail')).toBeVisible();

  // Assistant: accept roles, reject the organization change.
  await page.getByTestId('copilot-tab-assistant').click();
  await page.getByTestId('ai-prompt').fill('Add a Head of Design role');
  await page.getByTestId('ai-send').click();
  await expect(page.getByTestId('ai-patch-preview')).toContainText('+1 added');
  await page.getByTestId('ai-patch-section-organization').uncheck();
  await page.getByTestId('ai-patch-apply').click();
  await expect(page.getByTestId('count-roles')).toHaveText('1', { timeout: 15_000 });
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Wiz ${stamp}`);

  // A second assistant call hits the (stubbed) limit: the wait is shown.
  await page.getByTestId('ai-prompt').fill('Add another');
  await page.getByTestId('ai-send').click();
  await expect(page.getByTestId('copilot-error')).toContainText('try again in about 60 min');

  // Suggest: a KPI category chip adds the category.
  await page.getByTestId('copilot-tab-suggest').click();
  await page.getByTestId('ai-suggest-field').selectOption('kpiCategories');
  await page.getByTestId('ai-send').click();
  await page.getByTestId('ai-suggestion-chip').filter({ hasText: 'Growth' }).click();
  await expect(page.getByTestId('count-kpiCategories')).toHaveText('1', { timeout: 15_000 });

  // Explain.
  await page.getByTestId('copilot-tab-explain').click();
  await page.getByTestId('ai-explain-field').selectOption('roles');
  await page.getByTestId('ai-send').click();
  await expect(page.getByTestId('ai-explanation')).toHaveText('Roles bundle permissions.');

  // Esc closes the rail; the header button reopens it.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('copilot-rail')).toBeHidden();
  await page.getByTestId('copilot-toggle').click();
  await expect(page.getByTestId('copilot-rail')).toBeVisible();
});

test('wizard: a failed save is kept, blocks Finish, and is saved by Retry', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(60_000);
  const stamp = suffix();
  await fillEntry(page, stamp);
  await page.getByTestId('entry-quick').click();
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Wiz ${stamp}`, { timeout: 15_000 });

  // Draft saves (PUT /onboarding/:id) fail.
  const failPuts = (route: import('@playwright/test').Route) =>
    route.request().method() === 'PUT' ? route.abort('failed') : route.fallback();
  await page.route('**/onboarding/*', failPuts);
  await page.getByTestId('wizard-org-name').fill(`Renamed ${stamp}`);
  await expect(page.getByTestId('offline-banner')).toContainText('could not be saved');
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'offline');

  // Finish refuses to complete with an unsaved edit.
  await page.getByTestId('admin-name').fill('Wiz Admin');
  await page.getByTestId('admin-email').fill(`admin-${stamp}@wiz.test.local`);
  await page.getByTestId('admin-password').fill('correct-horse-battery-staple');
  await page.getByTestId('wizard-complete').click();
  await expect(page.getByTestId('wizard-error')).toContainText('not saved yet');
  await expect(page).toHaveURL(/\/signup\/wizard/);

  // Saves work again: Retry sends the kept edit.
  await page.unroute('**/onboarding/*', failPuts);
  await page.getByTestId('offline-retry').click();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'saved');
  await expect(page.getByTestId('offline-banner')).toBeHidden();
  await page.reload();
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Renamed ${stamp}`, { timeout: 15_000 });
});

test('wizard: going offline shows the banner; reconnecting saves the edit', async ({ page, context }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(60_000);
  const stamp = suffix();
  await fillEntry(page, stamp);
  await page.getByTestId('entry-quick').click();
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Wiz ${stamp}`, { timeout: 15_000 });

  await context.setOffline(true);
  await expect(page.getByTestId('offline-banner')).toContainText('You are offline');
  await page.getByTestId('wizard-org-name').fill(`Offline ${stamp}`);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'offline');

  await context.setOffline(false);
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'saved', { timeout: 15_000 });
  await expect(page.getByTestId('offline-banner')).toBeHidden();
  await page.reload();
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Offline ${stamp}`, { timeout: 15_000 });
});

test('signup: "Start over" on the resume banner forgets the cached draft', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  await fillEntry(page, stamp);
  await page.getByTestId('entry-quick').click();
  await expect(page).toHaveURL(/\/signup\/wizard/);

  await page.goto('/signup');
  await expect(page.getByTestId('resume-banner')).toBeVisible();
  await page.getByTestId('resume-discard').click();
  await expect(page.getByTestId('resume-banner')).toBeHidden();
  await page.reload();
  await expect(page.getByTestId('signup-email')).toBeVisible();
  await expect(page.getByTestId('resume-banner')).toBeHidden();
});
