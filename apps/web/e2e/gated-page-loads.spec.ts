/**
 * FE-014 follow-up: gated pages must not load their data for users who lack
 * the permission. The page gate already redirects them to /unauthorized, but
 * the page's own loader used to fire first and get a 403 from the api.
 *
 * Provisions an Employee (no ORG_SETTINGS / INTEGRATIONS_MANAGE), visits each
 * gated page and fails on any 4xx api response.
 *
 * Auto-skips if the api isn't reachable (mirrors permission-nav.spec.ts).
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const GATED_PAGES = [
  '/alerts/channels',
  '/connectors',
  '/connectors/missing-connector',
  '/plugins',
  '/workflows',
  '/settings/notifications/dlq',
  '/settings/retention',
  '/settings/scim',
  '/settings/sso',
];

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
  if (!apiAvailable) console.warn(`[skip] api not reachable at ${API_URL} — gated-page-loads skipped`);
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('Employee: gated pages redirect without calling their api', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');

  const stamp = suffix();
  const apiCtx = await request.newContext({ baseURL: API_URL });
  const reg = await apiCtx.post('/auth/register', {
    data: {
      orgName: `gated-${stamp}`,
      slug: `gated-${stamp}`,
      adminEmail: `admin-${stamp}@gated.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Gated Admin',
    },
  });
  expect(reg.status()).toBe(201);
  const { accessToken: adminToken } = (await reg.json()) as { accessToken: string };
  const auth = { authorization: `Bearer ${adminToken}` };

  const roles = (await (await apiCtx.get('/roles', { headers: auth })).json()) as { id: string; name: string }[];
  const employeeRole = roles.find((r) => r.name === 'Employee');
  expect(employeeRole, 'Employee default role should exist').toBeTruthy();
  const invite = await apiCtx.post('/users', {
    headers: auth,
    data: { email: `emp-${stamp}@gated.test.local`, fullName: 'Gated Employee', roleId: employeeRole!.id },
  });
  expect(invite.status()).toBe(201);
  const { inviteToken } = (await invite.json()) as { inviteToken?: string };
  await apiCtx.dispose();

  await page.goto(`/accept-invitation?token=${inviteToken}`);
  await page.getByTestId('invite-password').fill('employee-pw-12345');
  await page.getByTestId('invite-confirm-password').fill('employee-pw-12345');
  await page.getByTestId('invite-submit').click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.url().startsWith(API_URL) && r.status() >= 400 && r.status() < 500) {
      failed.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
    }
  });

  for (const route of GATED_PAGES) {
    failed.length = 0;
    await page.goto(route);
    await expect(page).toHaveURL(/\/unauthorized$/);
    await page.waitForLoadState('networkidle');
    expect(failed, `${route} called the api without permission`).toEqual([]);
  }
});
