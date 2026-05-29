/**
 * KPI categories CRUD e2e (P2 backlog). Create via UI → appears → delete.
 * Requires the api at $API_URL (default http://localhost:4000).
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) console.warn(`[skip] api not reachable — kpi-categories skipped`);
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Reg { accessToken: string; refreshToken: string }

async function registerOrg(stamp: string): Promise<Reg> {
  const apiCtx = await request.newContext({ baseURL: API_URL });
  const res = await apiCtx.post('/auth/register', {
    data: {
      orgName: `Cat E2E ${stamp}`,
      slug: `cat-${stamp}`,
      adminEmail: `admin-${stamp}@cat.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Cat Admin',
    },
  });
  expect(res.status()).toBe(201);
  return res.json() as Promise<Reg>;
}

async function injectTokens(page: import('@playwright/test').Page, reg: Reg): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ([at, rt]) => {
      window.localStorage.setItem('kpi-nexus.access-token', at);
      window.localStorage.setItem('kpi-nexus.refresh-token', rt);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );
}

test.describe('KPI categories', () => {
  test('create category via UI → appears → delete', { tag: ['@categories'] }, async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');
    test.setTimeout(60_000);

    const stamp = suffix();
    const reg = await registerOrg(stamp);
    await injectTokens(page, reg);

    await page.goto('/kpis/categories');
    await expect(page.getByTestId('categories-heading')).toBeVisible();
    await expect(page.getByTestId('categories-empty')).toBeVisible();

    await page.getByTestId('category-name-input').fill(`Financial ${stamp}`);
    await page.getByTestId('category-color-input').fill('#4f46e5');
    const createResp = page.waitForResponse(
      (r) => r.url().includes('/kpi-categories') && r.request().method() === 'POST',
    );
    await page.getByTestId('category-create-submit').click();
    expect((await createResp).status()).toBe(201);

    const row = page.locator('[data-testid^="category-row-"]').first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(`Financial ${stamp}`);

    await row.locator('[data-testid^="category-delete-"]').click();
    await expect(page.getByTestId('categories-empty')).toBeVisible({ timeout: 10_000 });
  });
});
