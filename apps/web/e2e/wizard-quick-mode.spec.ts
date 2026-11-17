/**
 * Plan 3.7 (UI-005): "Quick start" and "Full setup" led to the same wizard, and
 * a quick-start draft could not be finished at all — it had no administrator
 * role. Quick start is now two steps, with the rest there but optional.
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
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function enter(page: Page, stamp: string, entry: 'entry-quick' | 'entry-full'): Promise<void> {
  await page.goto('/signup');
  await page.getByTestId('signup-email').fill(`admin-${stamp}@quick.test.local`);
  await page.getByTestId('signup-org').fill(`Quick ${stamp}`);
  await page.getByTestId(entry).click();
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Quick ${stamp}`, { timeout: 15_000 });
}

test('quick start: name the organisation, create the account, done — with the standard roles in place', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(60_000);
  const stamp = suffix();
  await enter(page, stamp, 'entry-quick');

  // The four steps in between are there, and marked as optional.
  for (const step of ['structure', 'roles', 'kpis', 'team']) {
    await expect(page.getByTestId(`wizard-step-${step}`)).toContainText('Optional');
  }
  await expect(page.getByTestId('wizard-step-organization')).not.toContainText('Optional');
  await expect(page.getByTestId('wizard-step-review')).not.toContainText('Optional');
  await expect(page.getByTestId('wizard-quick-note')).toBeVisible();

  // It can be finished as it stands: the standard roles are already there.
  await expect(page.getByTestId('count-roles')).toHaveText('4');
  await expect(page.getByTestId('wizard-step-problems-roles')).toHaveCount(0);

  // Continue goes straight to the last step; Back comes straight back.
  await page.getByTestId('wizard-continue').click();
  await expect(page).toHaveURL(/step=review/);
  await expect(page.getByTestId('wizard-ready')).toBeVisible();
  await page.getByTestId('wizard-back').click();
  await expect(page).toHaveURL(/step=organization/);

  // An optional step is still one click away, and leads on in order.
  await page.getByTestId('wizard-step-structure').click();
  await page.getByTestId('wizard-continue').click();
  await expect(page).toHaveURL(/step=roles/);

  await page.getByTestId('wizard-step-review').click();
  await page.getByTestId('admin-name').fill('Quick Admin');
  await page.getByTestId('admin-password').fill('correct-horse-battery-staple');
  await page.getByTestId('admin-password-confirm').fill('correct-horse-battery-staple');
  await page.getByTestId('org-slug').fill(`quick-${stamp}`);
  await page.getByTestId('wizard-complete').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  const token = await page.evaluate(() => window.localStorage.getItem('kpi-nexus.access-token'));
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${token}` } });
  const roles = (await (await api.get('/roles')).json()) as Array<{ name: string; isAdmin: boolean }>;
  expect(roles.map((r) => r.name).sort()).toEqual(['Admin', 'Employee', 'Manager', 'Viewer']);
  expect(roles.filter((r) => r.isAdmin).map((r) => r.name)).toEqual(['Admin']);
});

test('full setup: every step in order, none marked optional, nothing added for you', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  await enter(page, suffix(), 'entry-full');
  for (const step of ['structure', 'roles', 'kpis', 'team']) {
    await expect(page.getByTestId(`wizard-step-${step}`)).not.toContainText('Optional');
  }
  await expect(page.getByTestId('wizard-quick-note')).toHaveCount(0);
  await expect(page.getByTestId('count-roles')).toHaveText('0');
  await page.getByTestId('wizard-continue').click();
  await expect(page).toHaveURL(/step=structure/);

  // The choice survives a reload.
  await page.reload();
  await expect(page.getByTestId('wizard-step-structure')).not.toContainText('Optional');
});
