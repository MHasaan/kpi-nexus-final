/**
 * Plan 3.6 step 1 (UI-005): the wizard asked for the organisation's name and
 * nothing else about it, so every organisation started as UTC / USD / en-US
 * with a January fiscal year and no size.
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

async function enter(page: Page, stamp: string): Promise<void> {
  await page.goto('/signup');
  await page.getByTestId('signup-email').fill(`admin-${stamp}@orgstep.test.local`);
  await page.getByTestId('signup-org').fill(`OrgStep ${stamp}`);
  await page.getByTestId('entry-quick').click();
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`OrgStep ${stamp}`, { timeout: 15_000 });
}

test('wizard organization step: its settings are chosen, saved, survive a reload, and become the organisation', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(60_000);
  const stamp = suffix();
  await enter(page, stamp);

  await page.getByTestId('wizard-org-industry').fill('Logistics');
  await page.getByTestId('wizard-org-size').selectOption('MEDIUM');
  await page.getByTestId('wizard-org-timezone').selectOption('Asia/Karachi');
  await page.getByTestId('wizard-org-currency').selectOption('PKR');
  await page.getByTestId('wizard-org-locale').selectOption('en-GB');
  await page.getByTestId('wizard-org-fiscal-month').selectOption('7');
  await page.getByTestId('wizard-org-week-start').selectOption('1');
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'saved');

  await page.reload();
  await expect(page.getByTestId('wizard-org-industry')).toHaveValue('Logistics', { timeout: 15_000 });
  await expect(page.getByTestId('wizard-org-size')).toHaveValue('MEDIUM');
  await expect(page.getByTestId('wizard-org-timezone')).toHaveValue('Asia/Karachi');
  await expect(page.getByTestId('wizard-org-currency')).toHaveValue('PKR');
  await expect(page.getByTestId('wizard-org-locale')).toHaveValue('en-GB');
  await expect(page.getByTestId('wizard-org-fiscal-month')).toHaveValue('7');
  await expect(page.getByTestId('wizard-org-week-start')).toHaveValue('1');

  // Finish with the smallest valid organisation: one administrator role, added through the API.
  const handle = await page.evaluate(() => JSON.parse(window.localStorage.getItem('kpi-nexus.onboarding-draft')!) as { sessionId: string; draftToken: string });
  const anon = await request.newContext({ baseURL: API_URL });
  expect((await anon.put(`/onboarding/${handle.sessionId}`, {
    headers: { 'x-draft-token': handle.draftToken },
    data: { patch: { roles: [{ name: 'Admin', isAdmin: true }] } },
  })).status()).toBe(200);
  await page.goto('/signup/wizard?step=review');
  await expect(page.getByTestId('wizard-ready')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('admin-name').fill('Org Admin');
  await page.getByTestId('admin-password').fill('correct-horse-battery-staple');
  await page.getByTestId('admin-password-confirm').fill('correct-horse-battery-staple');
  await page.getByTestId('org-slug').fill(`orgstep-${stamp}`);
  await page.getByTestId('wizard-complete').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  const tokens = await page.evaluate(() => window.localStorage.getItem('kpi-nexus.access-token'));
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${tokens}` } });
  const org = (await (await api.get('/organizations/me')).json()) as Record<string, unknown>;
  expect(org).toMatchObject({ industry: 'Logistics', sizeTier: 'MEDIUM', timezone: 'Asia/Karachi', currency: 'PKR', locale: 'en-GB', weekStartsOn: 1 });
  expect((org.fiscalCalendar as { startMonth?: number } | null)?.startMonth).toBe(7);
});

test('wizard organization step: an empty name is called out on the field, and the time zone can be taken from the browser', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  await enter(page, suffix());

  await page.getByTestId('wizard-org-name').fill('');
  await expect(page.getByTestId('wizard-org-name-error')).toHaveText('Give your organization a name.');
  await expect(page.getByTestId('wizard-step-problems-organization')).toBeVisible();
  await page.getByTestId('wizard-org-name').fill('Named Again');
  await expect(page.getByTestId('wizard-org-name-error')).toHaveCount(0);

  const zone = await page.evaluate(() => new Intl.DateTimeFormat().resolvedOptions().timeZone);
  await page.getByTestId('wizard-org-use-my-timezone').click();
  await expect(page.getByTestId('wizard-org-timezone')).toHaveValue(zone);
});
