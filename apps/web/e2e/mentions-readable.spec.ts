/**
 * Plan 7.7: the mentions page listed "You were mentioned" and a date — not
 * who wrote, what they wrote, or where to go and read it.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

test('a mention says who wrote, on what and what — and leads there', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `men-${stamp}`,
      slug: `men-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@men.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const invited = (await (await admin.post('/users', {
    data: { email: `eli-${stamp}@men.test.local`, fullName: 'Eli Employee', roleId: roles.find((r) => r.name === 'Employee')!.id },
  })).json()) as { inviteToken: string; user: { id: string } };
  const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
    accessToken: string;
    refreshToken: string;
  };
  const kpi = (await (await admin.post('/kpis', { data: { name: `Churn ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  const comment = await admin.post('/comments', {
    data: { entityType: 'kpi', entityId: kpi.id, body: `Can you check last month's figure? @Eli ${stamp}`, mentionedUserIds: [invited.user.id] },
  });
  expect(comment.status()).toBe(201);

  const context = await browser.newContext({
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: 'kpi-nexus.tour-completed', value: '1' }] }] },
  });
  const eli = await context.newPage();
  await eli.goto('/');
  await eli.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [tokens.accessToken, tokens.refreshToken] as const,
  );

  await eli.goto('/me/mentions');
  const row = eli.locator('[data-testid^="mention-"]').filter({ hasText: 'Ada Admin' }).first();
  await expect(row).toContainText('Ada Admin mentioned you on a KPI');
  await expect(row).toContainText(`Can you check last month's figure? @Eli ${stamp}`);
  await expect(eli.getByTestId('mentions-list')).not.toContainText('You were mentioned');
  await row.getByRole('link', { name: 'Open it' }).click();
  await expect(eli).toHaveURL(new RegExp(`/kpis/${kpi.id}$`));
  await expect(eli.getByTestId('kpi-detail-name')).toHaveText(`Churn ${stamp}`);
  await context.close();
});
