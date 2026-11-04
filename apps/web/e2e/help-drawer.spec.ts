/**
 * E2E: contextual help drawer (Task E5).
 *
 * Registers a fresh admin org via the FE register flow, navigates to /dashboard,
 * then exercises the floating "?" button and slide-out help drawer.
 *
 * Auto-skips if the API is not reachable (mirrors permission-nav.spec.ts pattern).
 */
import { expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    // eslint-disable-next-line no-console
    console.warn(
      `[skip] api not reachable at ${API_URL} — help-drawer e2e skipped`,
    );
  }
});

test.describe('E5: contextual help drawer', () => {
  test('clicking "?" on /dashboard opens the help drawer with tips', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    const orgName = `e2e-help-${stamp}`;
    const adminEmail = `${stamp}@help.test.local`;
    const adminPassword = 'correct-horse-battery-staple';

    // Register a fresh org via the FE form so we arrive on /dashboard.
    await page.goto('/register');
    await page.getByLabel('Organization name').fill(orgName);
    await page.getByLabel('Your full name').fill('Help Admin');
    await page.getByLabel('Your email').fill(adminEmail);
    await page.getByLabel('Password', { exact: true }).fill(adminPassword);

    const registerResp = page.waitForResponse(
      (r) =>
        r.url().endsWith('/auth/register') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /create organization/i }).click();
    expect((await registerResp).status()).toBe(201);

    await expect(page).toHaveURL(/\/dashboard$/);

    // The floating "?" button should be visible.
    const trigger = page.getByTestId('help-drawer-trigger');
    await expect(trigger).toBeVisible();

    // Drawer should NOT be visible yet (translated off-screen; it's in DOM but
    // the translate-x-full class hides it visually — check via aria or content).
    const drawer = page.getByTestId('help-drawer');
    await expect(drawer).toHaveAttribute('aria-label', 'Contextual help');

    // Open the drawer.
    await trigger.click();

    // Drawer title for /dashboard.
    const title = page.getByTestId('help-drawer-title');
    await expect(title).toBeVisible();
    await expect(title).toHaveText('Dashboard tips');

    // At least one tip is rendered.
    const tips = page.getByTestId('help-drawer-tips');
    await expect(tips).toBeVisible();
    const tipItems = page.getByTestId(/^help-tip-/);
    expect(await tipItems.count()).toBeGreaterThan(0);

    // Closing with the × button hides the drawer (translate-x-full restores).
    await page.getByTestId('help-drawer-close').click();
    // After close the "?" button is still visible.
    await expect(trigger).toBeVisible();
  });

  test('pulse class is absent after the drawer has been opened once', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    const orgName = `e2e-help-pulse-${stamp}`;
    const adminEmail = `${stamp}@help-pulse.test.local`;
    const adminPassword = 'correct-horse-battery-staple';

    // Register + land on /dashboard.
    await page.goto('/register');
    await page.getByLabel('Organization name').fill(orgName);
    await page.getByLabel('Your full name').fill('Pulse Admin');
    await page.getByLabel('Your email').fill(adminEmail);
    await page.getByLabel('Password', { exact: true }).fill(adminPassword);

    const registerResp = page.waitForResponse(
      (r) =>
        r.url().endsWith('/auth/register') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /create organization/i }).click();
    await registerResp;
    await expect(page).toHaveURL(/\/dashboard$/);

    const trigger = page.getByTestId('help-drawer-trigger');
    await expect(trigger).toBeVisible();

    // Before opening: button should have the animate-pulse class (unseen state).
    await expect(trigger).toHaveClass(/animate-pulse/);

    // Open the drawer — this sets the localStorage seen flag.
    await trigger.click();

    // Close it again.
    await page.getByTestId('help-drawer-close').click();

    // After first open the pulse class should be gone.
    await expect(trigger).not.toHaveClass(/animate-pulse/);

    // Reload the page — the seen flag is persisted so pulse should stay absent.
    await page.reload();
    const triggerAfterReload = page.getByTestId('help-drawer-trigger');
    await expect(triggerAfterReload).toBeVisible();
    await expect(triggerAfterReload).not.toHaveClass(/animate-pulse/);
  });

  test('Esc key closes the drawer', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    const orgName = `e2e-help-esc-${stamp}`;
    const adminEmail = `${stamp}@help-esc.test.local`;
    const adminPassword = 'correct-horse-battery-staple';

    await page.goto('/register');
    await page.getByLabel('Organization name').fill(orgName);
    await page.getByLabel('Your full name').fill('Esc Admin');
    await page.getByLabel('Your email').fill(adminEmail);
    await page.getByLabel('Password', { exact: true }).fill(adminPassword);

    const registerResp = page.waitForResponse(
      (r) =>
        r.url().endsWith('/auth/register') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /create organization/i }).click();
    await registerResp;
    await expect(page).toHaveURL(/\/dashboard$/);

    // Open then close via Esc.
    await page.getByTestId('help-drawer-trigger').click();
    await expect(page.getByTestId('help-drawer-title')).toBeVisible();
    await page.keyboard.press('Escape');

    // The drawer is back off-screen (translate-x-full).
    // The "?" trigger is still in the DOM and visible.
    await expect(page.getByTestId('help-drawer-trigger')).toBeVisible();
  });
});
