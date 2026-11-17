/**
 * Plan 3.6 step 6 (UI-005): the last step showed counts and an unlabelled
 * form that only spoke after the server refused it. It now lists what will be
 * created, checks the administrator's account field by field (with a second
 * password field), and says how setup went.
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

/** Enter the wizard through the rich template and go straight to review. */
async function enterReview(page: Page, stamp: string): Promise<void> {
  await page.goto('/signup');
  await page.getByTestId('signup-email').fill(`admin-${stamp}@review.test.local`);
  await page.getByTestId('signup-org').fill(`Review ${stamp}`);
  await page.getByTestId('entry-template').click();
  await page.getByTestId('use-template-saas-startup-rich').click();
  await expect(page).toHaveURL(/\/signup\/wizard/);
  await expect(page.getByTestId('count-roles')).toHaveText('10', { timeout: 15_000 });
  await page.getByTestId('wizard-step-review').click();
  await expect(page.getByTestId('wizard-ready')).toBeVisible();
}

test('wizard review step: lists what will be created; the account is checked on its fields; setup says how it went', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(90_000);
  const stamp = suffix();
  const api = await request.newContext({ baseURL: API_URL });
  const tpl = (await (await api.get('/org-templates/saas-startup-rich')).json()) as {
    payload: { roles: Array<{ name: string }>; orgUnits: Array<{ name: string }>; kpis: Array<{ name: string }> };
  };
  await enterReview(page, stamp);

  // The full lists are there to open, not just the numbers.
  await page.getByTestId('review-list-roles').click();
  await expect(page.getByTestId('review-list-roles-items')).toContainText(tpl.payload.roles[3]!.name);
  await page.getByTestId('review-list-kpis').click();
  await expect(page.getByTestId('review-list-kpis-items')).toContainText(tpl.payload.kpis[5]!.name);
  await page.getByTestId('review-list-orgUnits').click();
  await expect(page.getByTestId('review-list-orgUnits-items')).toContainText(tpl.payload.orgUnits[2]!.name);

  // Finish on an empty form: each field says what it needs and nothing is sent.
  let completes = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/complete')) completes += 1;
  });
  await page.getByTestId('admin-email').fill('');
  await page.getByTestId('wizard-complete').click();
  await expect(page.getByTestId('admin-name-error')).toHaveText('Enter your full name.');
  await expect(page.getByTestId('admin-email-error')).toHaveText('Enter your email.');
  await expect(page.getByTestId('admin-password-error')).toHaveText('Choose a password.');
  await expect(page.getByTestId('admin-name')).toBeFocused();
  expect(completes).toBe(0);

  await page.getByTestId('admin-name').fill('Review Admin');
  await page.getByTestId('admin-email').fill(`admin-${stamp}@review.test.local`);
  await page.getByTestId('admin-password').fill('short');
  await page.getByTestId('wizard-complete').click();
  await expect(page.getByTestId('admin-password-error')).toHaveText('Use at least 8 characters.');

  await page.getByTestId('admin-password').fill('correct-horse-battery-staple');
  await page.getByTestId('admin-password-confirm').fill('correct-horse-battery-stapel');
  await page.getByTestId('wizard-complete').click();
  await expect(page.getByTestId('admin-password-confirm-error')).toHaveText('The two passwords are not the same.');
  await page.getByTestId('admin-password-confirm').fill('correct-horse-battery-staple');

  await page.getByTestId('org-slug').fill('Has Spaces');
  await page.getByTestId('wizard-complete').click();
  await expect(page.getByTestId('org-slug-error')).toContainText('lowercase letters');
  expect(completes).toBe(0);

  // An address someone already has is refused by the server, and said on the field.
  const taken = `taken-${stamp}`;
  expect((await api.post('/auth/register', {
    data: { orgName: `Taken ${stamp}`, slug: taken, adminEmail: `other-${stamp}@review.test.local`, adminPassword: 'correct-horse-battery-staple', adminFullName: 'Other Admin' },
  })).status()).toBe(201);
  await page.getByTestId('org-slug').fill(taken);
  await page.getByTestId('wizard-complete').click();
  await expect(page.getByTestId('org-slug-error')).toContainText('already in use');
  await expect(page).toHaveURL(/\/signup\/wizard/);

  await page.getByTestId('org-slug').fill(`review-${stamp}`);
  await page.getByTestId('wizard-complete').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await expect(page.getByTestId('toast').filter({ hasText: 'is ready' })).toBeVisible();
});

test('wizard review step: with something still wrong, Finish says so instead of sending', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  await page.goto('/signup');
  await page.getByTestId('signup-email').fill(`admin-${stamp}@review.test.local`);
  await page.getByTestId('signup-org').fill(`Review ${stamp}`);
  await page.getByTestId('entry-full').click();
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Review ${stamp}`, { timeout: 15_000 });
  await page.getByTestId('wizard-step-review').click();

  await page.getByTestId('admin-name').fill('Review Admin');
  await page.getByTestId('admin-password').fill('correct-horse-battery-staple');
  await page.getByTestId('admin-password-confirm').fill('correct-horse-battery-staple');
  let completes = 0;
  page.on('request', (r) => {
    if (r.url().endsWith('/complete')) completes += 1;
  });
  await page.getByTestId('wizard-complete').click();
  await expect(page.getByTestId('wizard-error')).toContainText('Fix what is listed above');
  await expect(page.getByTestId('wizard-problems')).toBeVisible();
  expect(completes).toBe(0);
});
