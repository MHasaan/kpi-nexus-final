/**
 * Plan 3.6 step 5 (UI-005): setup could not invite anyone. The Team step lists
 * the people to invite — typed one at a time or pasted as a list — each with a
 * role, position, unit and manager, and they are invited when setup finishes.
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

/** Enter the wizard with roles, a position and a unit already in the draft. */
async function enterTeam(page: Page, stamp: string): Promise<void> {
  await page.goto('/signup');
  await page.getByTestId('signup-email').fill(`admin-${stamp}@team.test.local`);
  await page.getByTestId('signup-org').fill(`Team ${stamp}`);
  await page.getByTestId('entry-full').click();
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Team ${stamp}`, { timeout: 15_000 });
  const handle = await page.evaluate(() => JSON.parse(window.localStorage.getItem('kpi-nexus.onboarding-draft')!) as { sessionId: string; draftToken: string });
  const anon = await request.newContext({ baseURL: API_URL });
  expect((await anon.put(`/onboarding/${handle.sessionId}`, {
    headers: { 'x-draft-token': handle.draftToken },
    data: {
      patch: {
        roles: [{ name: 'Admin', isAdmin: true }, { name: 'Member', permissions: ['KPI_VIEW'] }],
        positions: [{ name: 'Engineer' }],
        orgUnitTypes: [{ name: 'Department' }],
        orgUnits: [{ name: 'Engineering', type: 'Department' }],
      },
    },
  })).status()).toBe(200);
  await page.goto('/signup/wizard?step=team');
  await expect(page.getByTestId('team-add')).toBeVisible({ timeout: 15_000 });
}

test('wizard team step: people added by hand and pasted as a list are invited with their role, unit and manager', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  test.setTimeout(90_000);
  const stamp = suffix();
  const mail = (who: string) => `${who}-${stamp}@team.test.local`;
  await enterTeam(page, stamp);

  // One by hand: reports to me, in Engineering.
  await page.getByTestId('team-add').click();
  await page.getByTestId('team-email-0').fill(mail('lena'));
  await page.getByTestId('team-name-0').fill('Lena Lead');
  await page.getByTestId('team-role-0').selectOption('Member');
  await page.getByTestId('team-position-0').selectOption('Engineer');
  await page.getByTestId('team-unit-0').selectOption('Engineering');
  await page.getByTestId('team-manager-0').selectOption({ label: `Me (admin-${stamp}@team.test.local)` });

  // Three pasted — one of them already on the list, one line with no email.
  await page.getByTestId('team-paste-toggle').click();
  await page.getByTestId('team-paste-input').fill(
    [`${mail('dev')}, Dev Person, member, , , ${mail('lena')}`, `${mail('LENA')}, Lena Again`, 'just a note', `${mail('ops')}, Ops Person`].join('\n'),
  );
  await page.getByTestId('team-paste-import').click();
  await expect(page.getByTestId('team-paste-result')).toHaveText('Added 2 people. 1 was already on the list. 1 line had no email and was skipped.');
  await expect(page.getByTestId('count-team')).toHaveText('3');
  await expect(page.getByTestId('team-role-1')).toHaveValue('Member');
  await expect(page.getByTestId('team-manager-1')).toHaveValue(mail('lena'));

  // A bad address is flagged on its row; fixing it clears the flag.
  await page.getByTestId('team-email-2').fill('not-an-email');
  await expect(page.getByTestId('team-problem-2')).toContainText('not an email address');
  await expect(page.getByTestId('wizard-step-problems-team')).toHaveText('1');
  await page.getByTestId('team-email-2').fill(mail('ops'));
  await expect(page.getByTestId('wizard-step-problems-team')).toHaveCount(0);

  // Nobody is offered themself as their manager.
  await expect(page.getByTestId('team-manager-0').locator('option', { hasText: 'Lena Lead' })).toHaveCount(0);

  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-status', 'saved');
  await page.reload();
  await expect(page.getByTestId('team-name-1')).toHaveValue('Dev Person', { timeout: 15_000 });

  // Finish. The administrator signs up with a different address than they started with:
  // the person who reports to "me" must follow it.
  await page.getByTestId('wizard-step-review').click();
  await expect(page.getByTestId('wizard-ready')).toBeVisible();
  const adminEmail = `boss-${stamp}@team.test.local`;
  await page.getByTestId('admin-name').fill('Team Admin');
  await page.getByTestId('admin-email').fill(adminEmail);
  await page.getByTestId('admin-password').fill('correct-horse-battery-staple');
  await page.getByTestId('admin-password-confirm').fill('correct-horse-battery-staple');
  await page.getByTestId('org-slug').fill(`team-${stamp}`);
  await expect(page.getByTestId('wizard-ready')).toBeVisible();
  await page.getByTestId('wizard-complete').click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  const token = await page.evaluate(() => window.localStorage.getItem('kpi-nexus.access-token'));
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${token}` } });
  type U = { id: string; email: string; status: string; managerId: string | null; roleId: string | null };
  const users = (await (await api.get('/users')).json()) as U[];
  const by = (email: string) => users.find((u) => u.email === email)!;
  expect(users).toHaveLength(4);
  expect([by(mail('lena')).status, by(mail('dev')).status, by(mail('ops')).status]).toEqual(['INVITED', 'INVITED', 'INVITED']);
  expect(by(mail('lena')).managerId).toBe(by(adminEmail).id);
  expect(by(mail('dev')).managerId).toBe(by(mail('lena')).id);
  expect(by(mail('ops')).managerId).toBeNull();
  expect(by(mail('dev')).roleId).toBeTruthy();

  // And "My team" shows the report.
  await page.goto('/team');
  await expect(page.getByTestId(`team-member-${by(mail('lena')).id}`)).toContainText('Lena Lead', { timeout: 15_000 });
});

test('wizard team step: removing someone leaves their reports without a manager, not broken', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  const stamp = suffix();
  await enterTeam(page, stamp);
  await page.getByTestId('team-paste-toggle').click();
  await page.getByTestId('team-paste-input').fill(`lena-${stamp}@team.test.local, Lena Lead\ndev-${stamp}@team.test.local, Dev Person, , , , lena-${stamp}@team.test.local`);
  await page.getByTestId('team-paste-import').click();
  await expect(page.getByTestId('team-manager-1')).toHaveValue(`lena-${stamp}@team.test.local`);

  await page.getByTestId('team-remove-0').click();
  await expect(page.getByTestId('count-team')).toHaveText('1');
  await expect(page.getByTestId('team-name-0')).toHaveValue('Dev Person');
  await expect(page.getByTestId('team-manager-0')).toHaveValue('');
  await expect(page.getByTestId('wizard-step-problems-team')).toHaveCount(0);
});
