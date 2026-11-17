/**
 * Plan 2.10: a person's page listed their KPIs but could not give them one or
 * take one away, loaded the person by fetching the whole directory, failed as a
 * whole when any one of three requests failed, and showed a blank page for a
 * person who does not exist.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('a person can be given a per-person KPI from their page, and lose it', async ({ page }) => {
  const stamp = suffix();
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `userassign-${stamp}`,
      slug: `userassign-${stamp}`,
      adminFullName: 'Assign Admin',
      adminEmail: `admin-${stamp}@userassign.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` },
  });
  const post = async <T,>(url: string, data: unknown) => (await (await api.post(url, { data })).json()) as T;

  const invited = await post<{ user: { id: string } }>('/users', {
    email: `dana-${stamp}@userassign.test.local`,
    fullName: 'Dana Reyes',
  });
  const personId = invited.user.id;
  const kpiBody = { scope: 'PER_USER', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST', frequency: 'MONTHLY' };
  // A per-person KPI has to be created with somebody; Dana is not that somebody.
  const other = await post<{ user: { id: string } }>('/users', {
    email: `omar-${stamp}@userassign.test.local`,
    fullName: 'Omar Haddad',
  });
  const kpi = await post<{ id: string }>('/kpis', { ...kpiBody, name: `Calls Made ${stamp}`, userIds: [other.user.id] });
  // An org-wide KPI must never be offered here.
  await post('/kpis', { ...kpiBody, scope: 'ORG_WIDE', name: `Revenue ${stamp}` });
  const held = async () =>
    (await (await api.get(`/user-kpis/user/${personId}`)).json()) as Array<{ assignmentId: string; kpiId: string; targetValue: number | null }>;

  await page.goto(`/users/${personId}`);
  await expect(page.getByTestId('user-header-name')).toHaveText('Dana Reyes');
  await expect(page.getByTestId('user-kpis-empty')).toBeAttached();

  const picker = page.getByTestId('user-kpi-assign-select');
  await expect(picker.locator('option')).toHaveText([`Calls Made ${stamp}`]);
  await page.getByTestId('user-kpi-assign-target').fill('120');
  await page.getByTestId('user-kpi-assign-button').click();

  const list = page.getByTestId('user-kpis-list');
  await expect(list).toContainText(`Calls Made ${stamp}`);
  const after = await held();
  expect(after).toHaveLength(1);
  expect(after[0]!.kpiId).toBe(kpi.id);
  expect(after[0]!.targetValue).toBe(120);

  await page.getByTestId(`user-kpi-remove-${after[0]!.assignmentId}`).click();
  const dialog = page.getByTestId('user-kpi-remove-confirm');
  await expect(dialog).toContainText(`Remove Calls Made ${stamp} from Dana Reyes?`);
  await page.getByTestId('user-kpi-remove-confirm-confirm').click();
  await expect(page.getByTestId('user-kpis-empty')).toBeAttached();
  expect(await held()).toHaveLength(0);
});

test('a person who does not exist gets a "not found" page, not a blank one', async ({ page }) => {
  const stamp = suffix();
  try {
    await registerOrgViaApi(page, {
      orgName: `usermissing-${stamp}`,
      slug: `usermissing-${stamp}`,
      adminFullName: 'Missing Admin',
      adminEmail: `admin-${stamp}@usermissing.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/users/does-not-exist');
  const notFound = page.getByTestId('user-not-found');
  await expect(notFound).toBeVisible();
  await expect(notFound.getByRole('link', { name: 'Back to people' })).toHaveAttribute('href', '/users');
  await expect(page.getByTestId('user-kpis-empty')).toHaveCount(0);
});
