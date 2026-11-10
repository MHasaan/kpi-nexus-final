/**
 * A4 e2e — AppShell permission-filtered nav + route guards.
 *
 * Part 1 (admin): register a fresh admin org via the FE register flow, land on
 * /dashboard, and assert the AppShell nav shows the admin-only entries
 * (Roles + Settings).
 *
 * Part 2 (low-privilege Employee): provision an Employee-role user via the API
 * invitation flow (mirrors invitation-flow.spec.ts), accept the invite in the
 * browser to sign in, then assert the gated nav entries (Roles, Members, Teams,
 * Settings) are ABSENT and that visiting /roles redirects to /unauthorized.
 *
 * Auto-skips the whole spec if the api isn't reachable (mirrors auth-flow).
 */
import { expect, request, test } from '@playwright/test';

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

/**
 * The AppShell nav + route guards are driven entirely by `user.permissions`
 * from GET /auth/me. If the running api build predates that field (A1), the
 * permission cache is always empty and the filtering can't be exercised
 * end-to-end. Probe once so we can skip with a precise reason instead of a
 * confusing failure; the filtering logic itself is covered by the unit test in
 * src/components/app-shell.spec.tsx.
 */
async function meReturnsPermissions(): Promise<boolean> {
  try {
    const stamp = suffix();
    const reg = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orgName: `nav-probe-${stamp}`,
        slug: `nav-probe-${stamp}`,
        adminEmail: `${stamp}@nav-probe.test.local`,
        adminPassword: 'correct-horse-battery-staple',
        adminFullName: 'Nav Probe',
      }),
    });
    if (!reg.ok) return false;
    const { accessToken } = (await reg.json()) as { accessToken: string };
    const me = await fetch(`${API_URL}/auth/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!me.ok) return false;
    const body = (await me.json()) as { user?: { permissions?: unknown } };
    return Array.isArray(body.user?.permissions) && body.user!.permissions!.length > 0;
  } catch {
    return false;
  }
}

let apiAvailable = false;
let permsAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    // eslint-disable-next-line no-console
    console.warn(`[skip] api not reachable at ${API_URL} — permission-nav e2e skipped`);
    return;
  }
  permsAvailable = await meReturnsPermissions();
  if (!permsAvailable) {
    // eslint-disable-next-line no-console
    console.warn(
      `[skip] GET /auth/me does not return user.permissions (api build predates A1) — ` +
        `permission-nav e2e skipped; nav filtering is covered by app-shell.spec.tsx`,
    );
  }
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface RolesResult {
  id: string;
  name: string;
}
interface InviteResult {
  inviteToken?: string;
}

test.describe('A4: AppShell permission-filtered nav + route guards', () => {
  test('admin org → nav shows Roles + Settings (admin holds all permissions)', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');
    test.skip(!permsAvailable, '/auth/me lacks permissions (api predates A1)');

    const stamp = suffix();
    const orgName = `e2e-nav-admin-${stamp}`;
    const adminEmail = `${stamp}@nav-admin.test.local`;
    const adminPassword = 'correct-horse-battery-staple';

    // Register via the FE form so we exercise the real login → cache path.
    await page.goto('/register');
    await page.getByLabel('Organization name').fill(orgName);
    await expect(page.getByLabel('URL slug')).toHaveValue(orgName);
    await page.getByLabel('Your full name').fill('Nav Admin');
    await page.getByLabel('Your email').fill(adminEmail);
    await page.getByLabel('Password', { exact: true }).fill(adminPassword);

    const registerResp = page.waitForResponse(
      (r) => r.url().endsWith('/auth/register') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /create organization/i }).click();
    expect((await registerResp).status()).toBe(201);

    await expect(page).toHaveURL(/\/dashboard$/);

    // AppShell nav: admin sees every entry, including the gated admin-only ones.
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(
      nav.getByRole('link', { name: 'Dashboard', exact: true }),
    ).toBeVisible();
    await expect(nav.getByRole('link', { name: 'KPIs' })).toBeVisible();
    // Admin-only entries present:
    await expect(nav.getByRole('link', { name: 'Roles' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'People' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Org units' })).toBeVisible();
    // Profile moved from the sidebar into the account menu (shell redesign).
    await page.getByTestId('appshell-user-menu').click();
    await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
  });

  test('Employee user → gated nav entries hidden + /roles redirects to /unauthorized', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');
    test.skip(!permsAvailable, '/auth/me lacks permissions (api predates A1)');

    const stamp = suffix();
    const slug = `nav-emp-${stamp}`;
    const adminEmail = `admin-${stamp}@nav-emp.test.local`;
    const inviteeEmail = `emp-${stamp}@nav-emp.test.local`;
    const adminPassword = 'correct-horse-battery-staple';
    const inviteePassword = 'employee-pw-12345';

    // 1. Provision: admin registers + invites an Employee via the API.
    const apiCtx = await request.newContext({ baseURL: API_URL });
    const reg = await apiCtx.post('/auth/register', {
      data: {
        orgName: `nav-emp-${stamp}`,
        slug,
        adminEmail,
        adminPassword,
        adminFullName: 'Nav Emp Admin',
      },
    });
    expect(reg.status()).toBe(201);
    const { accessToken: adminToken } = (await reg.json()) as {
      accessToken: string;
    };

    const roles = (await (
      await apiCtx.get('/roles', {
        headers: { authorization: `Bearer ${adminToken}` },
      })
    ).json()) as RolesResult[];
    const employeeRole = roles.find((r) => r.name === 'Employee');
    expect(employeeRole, 'Employee default role should exist').toBeTruthy();

    const inviteResp = await apiCtx.post('/users', {
      headers: { authorization: `Bearer ${adminToken}` },
      data: {
        email: inviteeEmail,
        fullName: 'Nav Employee',
        roleId: employeeRole!.id,
      },
    });
    expect(inviteResp.status()).toBe(201);
    const { inviteToken } = (await inviteResp.json()) as InviteResult;
    expect(inviteToken).toBeTruthy();
    await apiCtx.dispose();

    // 2. Accept the invite in the browser → signs in as the Employee.
    await page.goto(`/accept-invitation?token=${inviteToken}`);
    await page.getByTestId('invite-password').fill(inviteePassword);
    await page.getByTestId('invite-confirm-password').fill(inviteePassword);
    const acceptResp = page.waitForResponse(
      (r) =>
        r.url().endsWith('/accept-invitation') && r.request().method() === 'POST',
    );
    await page.getByTestId('invite-submit').click();
    expect((await acceptResp).status()).toBe(200);
    await expect(page).toHaveURL(/\/dashboard$/);

    // 3. AppShell nav: the no-permission + held entries are visible …
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(
      nav.getByRole('link', { name: 'Dashboard', exact: true }),
    ).toBeVisible();
    await expect(nav.getByRole('link', { name: 'KPIs' })).toBeVisible(); // KPI_VIEW
    await expect(nav.getByRole('link', { name: 'Alerts' })).toBeVisible(); // ALERTS_VIEW

    // … but the entries the Employee lacks must be hidden.
    await expect(nav.getByRole('link', { name: 'Roles' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'People' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Org units' })).toHaveCount(0);
    // Profile is in the account menu for everyone.
    await page.getByTestId('appshell-user-menu').click();
    await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
    await page.keyboard.press('Escape');

    // 4. Route guard: visiting /roles directly redirects to /unauthorized.
    await page.goto('/roles');
    await expect(page).toHaveURL(/\/unauthorized$/);
    await expect(
      page.getByRole('heading', { name: /don.?t have access/i }),
    ).toBeVisible();

    // 5. Settings is likewise guarded.
    await page.goto('/settings/organization');
    await expect(page).toHaveURL(/\/unauthorized$/);

    for (const route of ['/reports', '/reports/board-pack', '/reports/missing-report', '/org-units']) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/unauthorized$/);
    }
  });

  // -----------------------------------------------------------------------
  // A5: action-button PermissionGuard
  //   Employee holds: KPI_VIEW, KPI_DATA_ENTRY, DASHBOARD_VIEW, ALERTS_VIEW
  //   Employee lacks: KPI_CREATE, KPI_DELETE, DASHBOARD_MANAGE, USERS_MANAGE,
  //                   GROUPS_MANAGE, ROLES_MANAGE, ORG_SETTINGS, KPI_EDIT
  // -----------------------------------------------------------------------
  test('A5 Employee: "New KPI" create button hidden; Admin: visible', async ({
    browser,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');
    test.skip(!permsAvailable, '/auth/me lacks permissions (api predates A1)');

    const stamp = suffix();
    const slug = `a5-${stamp}`;
    const adminEmail = `admin-a5-${stamp}@test.local`;
    const empEmail = `emp-a5-${stamp}@test.local`;
    const adminPassword = 'correct-horse-battery-staple';
    const empPassword = 'employee-pw-99999';

    // -- Provision via API --
    const apiCtx = await request.newContext({ baseURL: API_URL });
    const reg = await apiCtx.post('/auth/register', {
      data: {
        orgName: `a5-org-${stamp}`,
        slug,
        adminEmail,
        adminPassword,
        adminFullName: 'A5 Admin',
      },
    });
    expect(reg.status()).toBe(201);
    const { accessToken: adminToken } = (await reg.json()) as { accessToken: string };

    const roles = (await (
      await apiCtx.get('/roles', { headers: { authorization: `Bearer ${adminToken}` } })
    ).json()) as RolesResult[];
    const employeeRole = roles.find((r) => r.name === 'Employee');
    expect(employeeRole, 'Employee default role should exist').toBeTruthy();

    const inviteResp = await apiCtx.post('/users', {
      headers: { authorization: `Bearer ${adminToken}` },
      data: { email: empEmail, fullName: 'A5 Employee', roleId: employeeRole!.id },
    });
    expect(inviteResp.status()).toBe(201);
    const { inviteToken } = (await inviteResp.json()) as InviteResult;
    expect(inviteToken).toBeTruthy();
    await apiCtx.dispose();

    // -- Employee context: accept invite, check /kpis --
    const empContext = await browser.newContext();
    const empPage = await empContext.newPage();
    await empPage.goto(`/accept-invitation?token=${inviteToken}`);
    await empPage.getByTestId('invite-password').fill(empPassword);
    await empPage.getByTestId('invite-confirm-password').fill(empPassword);
    const acceptResp = empPage.waitForResponse(
      (r) => r.url().endsWith('/accept-invitation') && r.request().method() === 'POST',
    );
    await empPage.getByTestId('invite-submit').click();
    expect((await acceptResp).status()).toBe(200);
    await expect(empPage).toHaveURL(/\/dashboard$/);

    await empPage.goto('/kpis');
    // Employee lacks KPI_CREATE — the "New KPI" button should NOT appear
    await expect(empPage.getByTestId('new-kpi-button')).toHaveCount(0);
    // Employee also lacks KPI_DELETE — no Delete buttons visible
    // (list may be empty so we just confirm no delete buttons exist in DOM)
    const deleteButtons = empPage.getByTestId(/^delete-kpi-/);
    expect(await deleteButtons.count()).toBe(0);
    await empContext.close();

    // -- Admin context: log in, verify /kpis shows the create button --
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto('/login');
    await adminPage.getByLabel(/email/i).fill(adminEmail);
    await adminPage.getByLabel('Password', { exact: true }).fill(adminPassword);
    const loginResp = adminPage.waitForResponse(
      (r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST',
    );
    await adminPage.getByRole('button', { name: /sign in/i }).click();
    expect((await loginResp).status()).toBe(200);
    await expect(adminPage).toHaveURL(/\/dashboard$/);

    await adminPage.goto('/kpis');
    await expect(adminPage.getByTestId('new-kpi-button')).toBeVisible();
    await adminContext.close();
  });
});
