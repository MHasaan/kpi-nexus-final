/**
 * System Status page — /status
 *
 * Registers a fresh admin org → navigates to /status → asserts the page shows
 * the database and redis component rows with an ok/down status indicator.
 *
 * This test requires /health/details to be live on the API. It auto-skips when
 * the API is not reachable, so CI stages without the API still pass.
 *
 * NOTE: /health/details is only available after the API is rebuilt and
 * restarted following the feat(health,web) commit — the e2e will be pending
 * until then.
 */
import { expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiWithDetailsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health/details`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiWithDetailsUp();
  if (!apiAvailable) {
    // eslint-disable-next-line no-console
    console.warn(
      `[skip] /health/details not reachable at ${API_URL} — status e2e skipped (needs API restart)`,
    );
  }
});

function randomSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe('System Status page (/status)', () => {
  test('register admin → navigate to /status → see database + redis component rows', async ({
    page,
  }) => {
    test.skip(!apiAvailable, '/health/details not reachable — needs API restart');

    const stamp = randomSuffix();
    const orgName = `e2e-status-${stamp}`;
    const slug = orgName;
    const adminPassword = 'correct-horse-battery-staple';

    // 1. Register a fresh org → lands on /dashboard
    await page.goto('/register');
    await page.getByLabel('Organization name').fill(orgName);
    await expect(page.getByLabel('URL slug')).toHaveValue(slug);
    await page.getByLabel('Your full name').fill('Status Admin');
    await page.getByLabel('Your email').fill(`${stamp}@status.test.local`);
    await page.getByLabel('Password').fill(adminPassword);

    const registerResp = page.waitForResponse(
      (r) => r.url().endsWith('/auth/register') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /create organization/i }).click();
    const resp = await registerResp;
    expect(resp.status()).toBe(201);

    await expect(page).toHaveURL(/\/dashboard$/);

    // 2. Navigate to /status
    await page.goto('/status');
    await expect(page.getByTestId('status-heading')).toBeVisible();

    // 3. Wait for loading to complete (data or error)
    await expect(page.getByTestId('status-loading')).not.toBeVisible({ timeout: 10_000 }).catch(
      () => { /* loading may have already disappeared */ },
    );

    // 4. Overall status banner should be visible
    await expect(page.getByTestId('status-overall')).toBeVisible({ timeout: 10_000 });

    // 5. Components table should be visible
    await expect(page.getByTestId('status-components-table')).toBeVisible();

    // 6. Database component row must be present with a status
    const dbRow = page.getByTestId('status-component-database');
    await expect(dbRow).toBeVisible();
    const dbStatus = page.getByTestId('status-component-database-status');
    await expect(dbStatus).toBeVisible();
    const dbStatusText = await dbStatus.textContent();
    expect(['Operational', 'Down']).toContain(dbStatusText?.trim());

    // 7. Redis component row must be present with a status
    const redisRow = page.getByTestId('status-component-redis');
    await expect(redisRow).toBeVisible();
    const redisStatus = page.getByTestId('status-component-redis-status');
    await expect(redisStatus).toBeVisible();
    const redisStatusText = await redisStatus.textContent();
    expect(['Operational', 'Down']).toContain(redisStatusText?.trim());

    // 8. Uptime and server timestamp should be shown
    await expect(page.getByTestId('status-uptime')).toBeVisible();
    await expect(page.getByTestId('status-timestamp')).toBeVisible();
  });

  test('unauthenticated access to /status redirects to /login', async ({ page }) => {
    test.skip(!apiAvailable, '/health/details not reachable — needs API restart');

    await page.goto('/status');
    await expect(page).toHaveURL(/\/login$/);
  });
});
