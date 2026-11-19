/**
 * Owner's decision (2026-11-19): a changed role takes effect at once.
 *
 * A person's role travelled in their session token, which is renewed every 15
 * minutes: someone demoted kept their old rights on the API until then. The
 * API now takes the role from the database each time it checks a token, so the
 * very next request — with the same token, no sign-out, no renewal — is
 * answered under the new role.
 *
 * No browser here: this is about what the API allows.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

test('a changed role is what the very next request is answered under', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `rco-${stamp}`,
      slug: `rco-${stamp}`,
      adminFullName: 'Rida Admin',
      adminEmail: `admin-${stamp}@rco.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const roleId = (name: string) => roles.find((r) => r.name === name)!.id;
  const invited = (await (await admin.post('/users', {
    data: { email: `eli-${stamp}@rco.test.local`, fullName: 'Eli Employee', roleId: roleId('Employee') },
  })).json()) as { user: { id: string }; inviteToken: string };
  const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as { accessToken: string };

  // One token, used throughout: never renewed.
  const eli = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${tokens.accessToken}` } });
  const permissions = async () => ((await (await eli.get('/auth/me')).json()) as { user: { permissions: string[] } }).user.permissions;
  // Something only someone who manages people may read.
  const managePeople = async () => (await eli.get(`/users/${invited.user.id}/access-profile`)).status();

  expect(await managePeople()).toBe(403);
  const asEmployee = await permissions();
  expect(asEmployee).not.toContain('USERS_MANAGE');

  // Promoted: allowed on the next request.
  expect((await admin.patch(`/users/${invited.user.id}`, { data: { roleId: roleId('Admin') } })).ok()).toBe(true);
  expect(await managePeople()).toBe(200);
  expect(await permissions()).toContain('USERS_MANAGE');

  // Demoted: refused on the next request.
  expect((await admin.patch(`/users/${invited.user.id}`, { data: { roleId: roleId('Employee') } })).ok()).toBe(true);
  expect(await managePeople()).toBe(403);
  expect((await permissions()).sort()).toEqual([...asEmployee].sort());
});
