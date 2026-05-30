/**
 * P7 frontend (browser e2e). Drives the /tasks kanban and /okrs pages with a
 * real authenticated session (tokens seeded into localStorage after an API
 * register). Requires the api at $API_URL; the web app is auto-started by
 * Playwright.
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
  if (!apiAvailable) console.warn('[skip] api not reachable — tasks-okrs-ui skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function seedSession(page: Page): Promise<void> {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = await anon.post('/auth/register', {
    data: {
      orgName: `P7 UI ${stamp}`,
      slug: `p7ui-${stamp}`,
      adminEmail: `admin-${stamp}@p7ui.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'P7 UI Admin',
    },
  });
  const tok = (await reg.json()) as { accessToken: string; refreshToken: string };
  // Prime localStorage before any app code runs.
  await page.addInitScript(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [tok.accessToken, tok.refreshToken] as const,
  );
}

test('tasks kanban: quick-create a task → appears in TODO → persists on reload', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(45_000);
  await seedSession(page);

  await page.goto('/tasks');
  await expect(page.getByTestId('kanban')).toBeVisible();

  const title = `Ship P7 ${suffix()}`;
  await page.getByTestId('quick-add-TODO').fill(title);
  await page.getByTestId('quick-add-TODO').press('Enter');

  const todo = page.getByTestId('column-TODO');
  await expect(todo.getByText(title)).toBeVisible({ timeout: 10_000 });

  // Survives a reload (persisted server-side).
  await page.reload();
  await expect(page.getByTestId('column-TODO').getByText(title)).toBeVisible({ timeout: 10_000 });
});

test('okrs: create an objective → add a KR → progress meter reflects currentValue', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(45_000);
  await seedSession(page);

  await page.goto('/okrs');
  await page.getByTestId('objective-name').fill(`Grow ${suffix()}`);
  await page.getByTestId('create-objective').click();

  // Lands on the detail page.
  await expect(page).toHaveURL(/\/okrs\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByTestId('objective-progress')).toHaveText('0%');

  // Add a KR that is already 50% complete (0 → 100, current 50).
  await page.getByTestId('kr-name').fill('MRR');
  await page.getByTestId('kr-baseline').fill('0');
  await page.getByTestId('kr-target').fill('100');
  await page.getByTestId('add-kr').click();

  const krRow = page.getByTestId('kr-list');
  await expect(krRow.getByTestId('kr-progress').first()).toBeVisible({ timeout: 10_000 });

  // Set currentValue to 50 → objective progress becomes 50%.
  const currentInput = page.locator('[data-testid^="kr-current-"]').first();
  await currentInput.fill('50');
  await currentInput.blur();

  await expect(page.getByTestId('objective-progress')).toHaveText('50%', { timeout: 10_000 });
});
