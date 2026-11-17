/**
 * Plan 3.5 (UI-005): the setup wizard was one page — a name field, five
 * numbers and a finish form. It becomes steps: a rail that says where you are
 * and what each step holds, the step in the address (so Back, reload and a
 * shared link all work), and a review that says what is still wrong and where.
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

async function enter(page: Page, stamp: string, entry: 'entry-quick' | 'entry-full' = 'entry-full'): Promise<void> {
  await page.goto('/signup');
  await page.getByTestId('signup-email').fill(`admin-${stamp}@steps.test.local`);
  await page.getByTestId('signup-org').fill(`Steps ${stamp}`);
  await page.getByTestId(entry).click();
  await expect(page).toHaveURL(/\/signup\/wizard/);
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Steps ${stamp}`, { timeout: 15_000 });
}

test('wizard: six steps, the current one in the address; Back, Continue, reload and a direct link all agree', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  await enter(page, suffix());

  const rail = page.getByTestId('wizard-steps');
  await expect(rail.getByRole('button')).toHaveText([/Organization/, /Structure/, /Roles & positions/, /KPIs/, /Team/, /Review & finish/]);
  await expect(page.getByTestId('wizard-step-organization')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('wizard-back')).toBeDisabled();

  await page.getByTestId('wizard-continue').click();
  await expect(page).toHaveURL(/step=structure/);
  await expect(page.getByTestId('wizard-step-structure')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Structure');

  await page.reload();
  await expect(page.getByTestId('wizard-step-structure')).toHaveAttribute('aria-current', 'step');

  await page.getByTestId('wizard-back').click();
  await expect(page).toHaveURL(/step=organization/);
  await expect(page.getByTestId('wizard-org-name')).toBeVisible();

  // The browser's own Back button moves between steps too.
  await page.getByTestId('wizard-step-kpis').click();
  await expect(page).toHaveURL(/step=kpis/);
  await page.goBack();
  await expect(page).toHaveURL(/step=organization/);

  // A link straight to a step works; nonsense falls back to the first.
  await page.goto('/signup/wizard?step=review');
  await expect(page.getByTestId('wizard-complete')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('wizard-continue')).toHaveCount(0);
  await page.goto('/signup/wizard?step=not-a-step');
  await expect(page.getByTestId('wizard-org-name')).toBeVisible({ timeout: 15_000 });
});

test('wizard: review says what is still wrong and takes you to the step that fixes it', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  await enter(page, suffix());

  // A fresh draft has a name but nobody who could administer it.
  await expect(page.getByTestId('wizard-step-problems-roles')).toHaveText('1');
  await page.getByTestId('wizard-step-review').click();
  const problems = page.getByTestId('wizard-problems');
  await expect(problems).toContainText('administrator role');
  await problems.getByRole('button', { name: /Roles & positions/ }).click();
  await expect(page).toHaveURL(/step=roles/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Roles & positions');
});

test('wizard: each step shows what the draft already holds', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  const api = await request.newContext({ baseURL: API_URL });
  const tpl = (await (await api.get('/org-templates/saas-startup-rich')).json()) as {
    payload: { roles: Array<{ name: string }>; orgUnits: Array<{ name: string }>; kpis: Array<{ name: string }> };
  };

  await page.goto('/signup');
  await page.getByTestId('signup-email').fill(`admin-${stamp}@steps.test.local`);
  await page.getByTestId('signup-org').fill(`Steps ${stamp}`);
  await page.getByTestId('entry-template').click();
  await page.getByTestId('use-template-saas-startup-rich').click();
  await expect(page).toHaveURL(/\/signup\/wizard/);

  // The rail carries the numbers, on every step.
  await expect(page.getByTestId('count-roles')).toHaveText('10', { timeout: 15_000 });
  await expect(page.getByTestId('count-orgUnits')).toHaveText('11');
  await expect(page.getByTestId('count-kpis')).toHaveText('20');
  await expect(page.getByTestId('wizard-step-problems-roles')).toHaveCount(0);

  // Steps that have an editor show the draft in its fields; the rest list it.
  await page.getByTestId('wizard-step-structure').click();
  await expect(page.getByTestId('unit-name-0')).toHaveValue(tpl.payload.orgUnits[0]!.name);
  await page.getByTestId('wizard-step-roles').click();
  await expect(page.getByTestId('role-name-1')).toHaveValue(tpl.payload.roles[1]!.name);
  await page.getByTestId('wizard-step-kpis').click();
  await expect(page.getByTestId('wizard-step-content')).toContainText(tpl.payload.kpis[0]!.name);

  // Nothing is wrong with a template: review says so.
  await page.getByTestId('wizard-step-review').click();
  await expect(page.getByTestId('wizard-ready')).toBeVisible();
});
