/**
 * Full happy-path e2e — P1 exit criterion.
 *
 * Admin registers → invites a new user via /users (API direct) → invitee
 * visits /accept-invitation?token=… → fills password → lands on
 * /dashboard signed in as the invitee.
 *
 * Admin-side invite UI lands in a follow-up — this test exercises the
 * api directly to mint the token, mirroring how the email flow will
 * eventually deliver it.
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

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
  if (!apiAvailable) {
    console.warn(`[skip] api not reachable at ${API_URL} — invitation e2e skipped`);
  }
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface RegisterResult {
  accessToken: string;
}
interface InviteResult {
  inviteToken?: string;
}
interface RolesResult {
  id: string;
  name: string;
}

test.describe('Full happy-path: invite user → accept → role gating visible', () => {
  test('admin invites Employee → invitee sets password → signs in', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    const slug = `invite-e2e-${stamp}`;
    const adminEmail = `admin-${stamp}@invite-e2e.test.local`;
    const inviteeEmail = `invitee-${stamp}@invite-e2e.test.local`;
    const adminPassword = 'correct-horse-battery-staple';
    const inviteePassword = 'invitee-pw-1';

    // 1. Admin registers via API (no FE detour needed)
    const apiCtx = await request.newContext({ baseURL: API_URL });
    const reg = await apiCtx.post('/auth/register', {
      data: {
        orgName: `invite-e2e-${stamp}`,
        slug,
        adminEmail,
        adminPassword,
        adminFullName: 'Invite E2E Admin',
      },
    });
    expect(reg.status()).toBe(201);
    const { accessToken: adminToken } = (await reg.json()) as RegisterResult;

    // 2. Look up the Employee role id
    const roles = (await (
      await apiCtx.get('/roles', {
        headers: { authorization: `Bearer ${adminToken}` },
      })
    ).json()) as RolesResult[];
    const employeeRole = roles.find((r) => r.name === 'Employee')!;

    // 3. Admin invites the new user
    const inviteResp = await apiCtx.post('/users', {
      headers: { authorization: `Bearer ${adminToken}` },
      data: {
        email: inviteeEmail,
        fullName: 'Invited User',
        roleId: employeeRole.id,
      },
    });
    expect(inviteResp.status()).toBe(201);
    const { inviteToken } = (await inviteResp.json()) as InviteResult;
    expect(inviteToken).toBeTruthy();

    // 4. Invitee visits the accept-invitation page with the token
    await page.goto(`/accept-invitation?token=${inviteToken}`);
    await expect(
      page.getByRole('heading', { name: /accept your invitation/i }),
    ).toBeVisible();

    // 5. Fill password + confirm + submit
    await page.getByTestId('invite-password').fill(inviteePassword);
    await page.getByTestId('invite-confirm-password').fill(inviteePassword);

    const acceptResp = page.waitForResponse(
      (r) => r.url().endsWith('/accept-invitation') && r.request().method() === 'POST',
    );
    await page.getByTestId('invite-submit').click();
    expect((await acceptResp).status()).toBe(200);

    // 6. Lands on dashboard
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(inviteeEmail).first()).toBeVisible();

    // 7. Permission gating: the Employee role lacks ROLES_MANAGE. The /roles
    //    page is gated on it (redirect to /unauthorized), and — since the
    //    frontend never trusts itself — the API refuses role creation too.
    await page.goto('/roles');
    await expect(page).toHaveURL(/\/unauthorized$/);
    const inviteeToken = await page.evaluate(() => window.localStorage.getItem('kpi-nexus.access-token'));
    expect(inviteeToken).toBeTruthy();
    const createResp = await apiCtx.post('/roles', {
      headers: { authorization: `Bearer ${inviteeToken}` },
      data: { name: `Should-Not-Work-${suffix()}`, permissions: [] },
    });
    expect(createResp.status()).toBe(403);

    await apiCtx.dispose();
  });

  test('accept-invitation page without ?token= shows a helpful message', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await page.goto('/accept-invitation');
    await expect(
      page.getByRole('heading', { name: /invitation link is missing/i }),
    ).toBeVisible();
  });

  test('password mismatch → inline error, no api call', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await page.goto('/accept-invitation?token=any-token');
    await page.getByTestId('invite-password').fill('aaaaaaaa');
    await page.getByTestId('invite-confirm-password').fill('bbbbbbbb');
    await page.getByTestId('invite-submit').click();

    await expect(page.getByTestId('invite-error')).toHaveText(/do not match/i);
  });
});
