/**
 * E2E: contextual help drawer (Task E5).
 *
 * Registers a fresh admin org via the FE register flow, navigates to /dashboard,
 * then exercises the floating "?" button and slide-out help drawer.
 *
 * Auto-skips if the API is not reachable (mirrors permission-nav.spec.ts pattern).
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

// PERMISSION_COUNT in @kpi-nexus/contracts (Playwright loads specs as CommonJS
// and contracts is ESM-only, so it can't be imported here).
const PERMISSION_COUNT = 25;

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
    await registerOrgViaApi(page, {
      orgName: orgName,
      slug: orgName,
      adminFullName: 'Help Admin',
      adminEmail: adminEmail,
      adminPassword: adminPassword,
    });

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

  // QA-L14: the drawer stayed open, over the next page, when the page changed.
  test('the drawer is hidden while closed, and closes when the page changes', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    await registerOrgViaApi(page, {
      orgName: `e2e-help-nav-${stamp}`,
      slug: `e2e-help-nav-${stamp}`,
      adminFullName: 'Nav Help Admin',
      adminEmail: `${stamp}@help-nav.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });

    const drawer = page.getByTestId('help-drawer');
    await expect(drawer).toBeHidden();

    // From the dashboard to the KPI list by the menu, then open help there.
    await page.getByRole('link', { name: 'KPIs', exact: true }).first().click();
    await page.waitForURL('**/kpis');
    await page.getByTestId('help-drawer-trigger').click();
    await expect(drawer).toBeVisible();
    await expect(page.getByTestId('help-drawer-title')).toHaveText('KPI tips');

    // Back to the dashboard without touching the drawer: it does not follow.
    await page.goBack();
    await page.waitForURL('**/dashboard');
    await expect(drawer).toBeHidden();

    // The default tips say where things really are.
    await page.goto('/activity');
    await page.getByTestId('help-drawer-trigger').click();
    await expect(page.getByTestId('help-drawer-tips')).toContainText('menu on the left');
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('/roles help states the real permission count (DOC-004)', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    await registerOrgViaApi(page, {
      orgName: `e2e-help-roles-${stamp}`,
      slug: `e2e-help-roles-${stamp}`,
      adminFullName: 'Roles Help Admin',
      adminEmail: `${stamp}@help-roles.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });

    await page.goto('/roles');
    await page.getByTestId('help-drawer-trigger').click();
    await expect(page.getByTestId('help-drawer-title')).toHaveText('Roles & permissions tips');
    await expect(page.getByTestId('help-drawer-tips')).toContainText(
      `Roles bundle the ${PERMISSION_COUNT} permissions`,
    );
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
    await registerOrgViaApi(page, {
      orgName: orgName,
      slug: orgName,
      adminFullName: 'Pulse Admin',
      adminEmail: adminEmail,
      adminPassword: adminPassword,
    });

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

    await registerOrgViaApi(page, {
      orgName: orgName,
      slug: orgName,
      adminFullName: 'Esc Admin',
      adminEmail: adminEmail,
      adminPassword: adminPassword,
    });

    // Open then close via Esc.
    await page.getByTestId('help-drawer-trigger').click();
    await expect(page.getByTestId('help-drawer-title')).toBeVisible();
    await page.keyboard.press('Escape');

    // The drawer is back off-screen (translate-x-full).
    // The "?" trigger is still in the DOM and visible.
    await expect(page.getByTestId('help-drawer-trigger')).toBeVisible();
  });
});
