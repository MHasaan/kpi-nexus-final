/**
 * Settings → API keys + Webhooks e2e.
 *  - Mint an API key via the UI → plaintext shown once → revoke.
 *  - Create a webhook via the UI → signing secret shown once → test → delete.
 *
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
  if (!apiAvailable) console.warn(`[skip] api not reachable at ${API_URL} — settings-keys-webhooks skipped`);
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Reg { accessToken: string; refreshToken: string }

async function registerOrg(stamp: string): Promise<Reg> {
  const apiCtx = await request.newContext({ baseURL: API_URL });
  const res = await apiCtx.post('/auth/register', {
    data: {
      orgName: `Settings E2E ${stamp}`,
      slug: `settings-${stamp}`,
      adminEmail: `admin-${stamp}@settings.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Settings Admin',
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

test.describe('Settings — API keys + Webhooks', () => {
  test('mint an API key (plaintext shown once) then revoke', { tag: ['@settings'] }, async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');
    test.setTimeout(60_000);

    const reg = await registerOrg(suffix());
    await injectTokens(page, reg);

    await page.goto('/settings/api-keys');
    await expect(page.getByTestId('apikeys-heading')).toBeVisible();
    await expect(page.getByTestId('apikeys-empty')).toBeVisible();

    await page.getByTestId('apikey-name-input').fill('CI key');
    await page.getByTestId('apikey-scope-KPI_VIEW').check();
    await page.getByTestId('apikey-create-submit').click();

    // One-time plaintext banner appears with a kpinx_ key.
    const plaintext = page.getByTestId('apikey-plaintext');
    await expect(plaintext).toBeVisible({ timeout: 10_000 });
    await expect(plaintext).toContainText('kpinx_');

    // Row appears; revoke it.
    const row = page.locator('[data-testid^="apikey-row-"]').first();
    await expect(row).toBeVisible();
    await row.locator('[data-testid^="apikey-revoke-"]').click();
    await expect(row).toContainText('Revoked', { timeout: 10_000 });
  });

  test('create a webhook (secret shown once), test, then delete', { tag: ['@settings'] }, async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');
    test.setTimeout(60_000);

    const reg = await registerOrg(suffix());
    await injectTokens(page, reg);

    await page.goto('/settings/webhooks');
    await expect(page.getByTestId('webhooks-heading')).toBeVisible();

    await page.getByTestId('webhook-name-input').fill('Ops hook');
    await page.getByTestId('webhook-url-input').fill('https://example.com/hook');
    await page.getByTestId('webhook-event-alert_triggered').check();
    await page.getByTestId('webhook-create-submit').click();

    // Secret banner (whsec_) shown once.
    const secret = page.getByTestId('webhook-secret');
    await expect(secret).toBeVisible({ timeout: 10_000 });
    await expect(secret).toContainText('whsec_');

    const row = page.locator('[data-testid^="webhook-row-"]').first();
    await expect(row).toBeVisible();

    // Test enqueues a delivery.
    await row.locator('[data-testid^="webhook-test-"]').click();
    await expect(page.getByTestId('webhook-status-msg')).toBeVisible({ timeout: 10_000 });

    // Delete it → table empties.
    await row.locator('[data-testid^="webhook-delete-"]').click();
    await expect(page.getByTestId('webhooks-empty')).toBeVisible({ timeout: 10_000 });
  });
});
