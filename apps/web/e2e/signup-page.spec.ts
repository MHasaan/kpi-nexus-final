/**
 * Plan 3.9 (UI-005): the first page of sign-up took any text as an email, had
 * no way back to sign-in, showed "No templates available" when the gallery
 * failed to load, gave no look inside a template before committing to it, and
 * forgot the email — the wizard asked for it again.
 */
import { expect, request, test } from '@playwright/test';

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

test('signup: a bad email or a missing name is refused on the field, before anything starts', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  await page.goto('/signup');

  await page.getByTestId('entry-quick').click();
  await expect(page.getByTestId('signup-email-error')).toHaveText(/enter your email/i);
  await expect(page.getByTestId('signup-org-error')).toHaveText(/organi[sz]ation/i);

  await page.getByTestId('signup-email').fill('not-an-email');
  await page.getByTestId('signup-org').fill(`Field Check ${suffix()}`);
  await page.getByTestId('entry-quick').click();
  await expect(page.getByTestId('signup-email-error')).toHaveText(/valid email/i);
  await expect(page.getByTestId('signup-org-error')).toHaveCount(0);
  await expect(page).toHaveURL(/\/signup$/);

  // Someone who already has an account can get back to sign-in.
  await expect(page.getByTestId('signup-signin-link')).toHaveAttribute('href', '/login');
});

test('signup: the email typed here is the administrator email in the wizard', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const email = `admin-${stamp}@signup.test.local`;
  await page.goto('/signup');
  await page.getByTestId('signup-email').fill(`  ${email}  `);
  await page.getByTestId('signup-org').fill(`Signup ${stamp}`);
  await page.getByTestId('entry-quick').click();
  await expect(page).toHaveURL(/\/signup\/wizard/);
  // The administrator's account is the wizard's last step.
  await page.getByTestId('wizard-step-review').click();
  await expect(page.getByTestId('admin-email')).toHaveValue(email);
});

test('signup: a template can be looked into before it is used', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  const api = await request.newContext({ baseURL: API_URL });
  const tpl = (await (await api.get('/org-templates/saas-startup-rich')).json()) as {
    payload: { roles: Array<{ name: string }>; orgUnits: Array<{ name: string }>; kpis: Array<{ name: string }> };
  };

  await page.goto('/signup');
  await page.getByTestId('entry-template').click();
  await page.getByTestId('preview-template-saas-startup-rich').click();
  const preview = page.getByTestId('template-preview-saas-startup-rich');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText(tpl.payload.roles[0]!.name);
  await expect(preview).toContainText(tpl.payload.orgUnits[0]!.name);
  await expect(preview).toContainText(tpl.payload.kpis[0]!.name);
  // Looking is not choosing: no session was started, we are still on /signup.
  await expect(page).toHaveURL(/\/signup$/);
  await page.getByTestId('preview-template-saas-startup-rich').click();
  await expect(preview).toBeHidden();
});

test('signup: a gallery that fails to load says so and can be retried', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  let fail = true;
  await page.route('**/org-templates', (route) => (fail ? route.abort() : route.continue()));

  await page.goto('/signup');
  await page.getByTestId('entry-template').click();
  const problem = page.getByTestId('template-gallery-error');
  await expect(problem).toBeVisible();
  await expect(page.getByText('No templates available')).toHaveCount(0);

  fail = false;
  await problem.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('use-template-saas-startup-rich')).toBeVisible();
  await expect(problem).toBeHidden();
});
