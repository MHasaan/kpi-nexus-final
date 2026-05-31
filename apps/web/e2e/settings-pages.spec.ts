/**
 * F2 e2e — the P1/P9 settings pages that were previously unbuilt:
 * settings index, branding, fiscal, password-policy, custom-domain, and
 * /billing. Registers a fresh admin via the FE flow, then visits each page
 * and asserts it renders its heading + backing content (no error boundary).
 *
 * Requires the web app at :3000 and the api at $API_URL (default :4000).
 * Auto-skips the whole spec if the api is unreachable. Deterministic: each
 * test provisions its own org.
 */
import { expect, test, type Page } from '@playwright/test';

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
  if (!apiAvailable) console.warn(`[skip] api not reachable at ${API_URL} — settings-pages e2e skipped`);
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function registerAndLand(page: Page): Promise<void> {
  const stamp = suffix();
  const slug = `f2-${stamp}`;
  const email = `${stamp}@f2.test.local`;
  const password = 'correct-horse-battery-staple';

  await page.goto('/register');
  await page.getByLabel('Organization name').fill(`f2-${stamp}`);
  await page.getByLabel('URL slug').fill(slug);
  await page.getByLabel('Your full name').fill('F2 Admin');
  await page.getByLabel('Your email').fill(email);
  await page.getByLabel('Password').fill(password);
  await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/auth/register') && r.request().method() === 'POST'),
    page.getByRole('button', { name: /create organization/i }).click(),
  ]);
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe('F2: settings pages render with backing content', () => {
  test('settings index lists every settings group + links to /billing', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');
    await registerAndLand(page);

    await page.goto('/settings');
    await expect(page.getByTestId('settings-index-heading')).toHaveText('Settings');
    // Grouped cards present.
    await expect(page.getByTestId('settings-group-general')).toBeVisible();
    await expect(page.getByTestId('settings-group-security')).toBeVisible();
    await expect(page.getByTestId('settings-group-integrations')).toBeVisible();
    await expect(page.getByTestId('settings-group-billing')).toBeVisible();
    // Discoverability: a link to each new page + /billing.
    await expect(page.getByTestId('settings-link-settings-branding')).toBeVisible();
    await expect(page.getByTestId('settings-link-settings-fiscal')).toBeVisible();
    await expect(page.getByTestId('settings-link-settings-password-policy')).toBeVisible();
    await expect(page.getByTestId('settings-link-settings-custom-domain')).toBeVisible();
    await expect(page.getByTestId('settings-link-billing')).toBeVisible();

    // The repointed Settings nav entry lands here.
    await expect(page.getByTestId('nav-settings')).toBeVisible();
  });

  test('branding page loads org branding fields', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');
    await registerAndLand(page);

    await page.goto('/settings/branding');
    await expect(page.getByTestId('branding-heading')).toHaveText('Branding');
    await expect(page.getByTestId('branding-form')).toBeVisible();
    await expect(page.getByTestId('branding-logo-url')).toBeVisible();
    await expect(page.getByTestId('branding-primary-color')).toBeVisible();
    await expect(page.getByTestId('branding-save')).toBeVisible();
    await expect(page.getByTestId('branding-error')).toHaveCount(0);
  });

  test('fiscal page loads fiscal-calendar fields', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');
    await registerAndLand(page);

    await page.goto('/settings/fiscal');
    await expect(page.getByTestId('fiscal-heading')).toHaveText('Fiscal calendar');
    await expect(page.getByTestId('fiscal-form')).toBeVisible();
    await expect(page.getByTestId('fiscal-start-month')).toBeVisible();
    await expect(page.getByTestId('fiscal-week-starts-on')).toBeVisible();
    await expect(page.getByTestId('fiscal-error')).toHaveCount(0);
  });

  test('password-policy page loads policy fields with defaults', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');
    await registerAndLand(page);

    await page.goto('/settings/password-policy');
    await expect(page.getByTestId('password-policy-heading')).toHaveText('Password policy');
    await expect(page.getByTestId('password-policy-form')).toBeVisible();
    // Default min length is 8.
    await expect(page.getByTestId('password-policy-min-length')).toHaveValue('8');
    await expect(page.getByTestId('password-policy-requireUppercase')).toBeVisible();
    await expect(page.getByTestId('password-policy-error')).toHaveCount(0);
  });

  test('custom-domain page renders the add form + empty state', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');
    await registerAndLand(page);

    await page.goto('/settings/custom-domain');
    await expect(page.getByTestId('custom-domain-heading')).toHaveText('Custom domain');
    await expect(page.getByTestId('custom-domain-input')).toBeVisible();
    await expect(page.getByTestId('custom-domain-add')).toBeVisible();
    // Fresh org has no domains.
    await expect(page.getByTestId('custom-domain-empty')).toBeVisible();
    await expect(page.getByTestId('custom-domain-error')).toHaveCount(0);
  });

  test('billing page shows current plan + usage', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');
    await registerAndLand(page);

    await page.goto('/billing');
    await expect(page.getByTestId('billing-heading')).toHaveText('Billing & plan');
    // Plan card with the seeded default plan name.
    await expect(page.getByTestId('billing-plan')).toBeVisible();
    await expect(page.getByTestId('billing-plan-name')).not.toBeEmpty();
    // Usage section is present (default ENTERPRISE has quotas listed).
    await expect(page.getByTestId('billing-quotas')).toBeVisible();
    // Upgrade affordance is present but disabled (payment wiring deferred).
    const upgrade = page.getByTestId('billing-upgrade');
    await expect(upgrade).toBeVisible();
    await expect(upgrade).toBeDisabled();
    await expect(page.getByTestId('billing-error')).toHaveCount(0);
  });
});
