/**
 * Mentioning a colleague, for someone who may not list people (owner decision
 * 2026-11-19: names only).
 *
 * A member without the people-list permission was offered only the people who
 * had already commented on the item, so "@Ada" on a fresh item reached nobody.
 * Typing a name now looks colleagues up — a name and nothing else.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

test('a member who may not list people can still look a colleague up by name to mention them', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `mlm-${stamp}`,
      slug: `mlm-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@mlm.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const anon = await request.newContext({ baseURL: API_URL });
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const employee = roles.find((r) => r.name === 'Employee')!.id;
  const invite = async (name: string, email: string) =>
    (await (await admin.post('/users', { data: { email, fullName: name, roleId: employee } })).json()) as { inviteToken: string; user: { id: string } };
  const eliInvite = await invite('Eli Employee', `eli-${stamp}@mlm.test.local`);
  // Invited, never accepted: not a colleague to mention yet.
  await invite('Adele Pending', `adele-${stamp}@mlm.test.local`);
  const eli = (await (await anon.post('/auth/accept-invitation', { data: { token: eliInvite.inviteToken, password: PASSWORD } })).json()) as {
    accessToken: string;
    refreshToken: string;
  };
  // Another organisation, with an Adam of its own.
  expect((await anon.post('/auth/register', {
    data: { orgName: `mlm-other-${stamp}`, slug: `mlm-other-${stamp}`, adminEmail: `adam-${stamp}@other.test.local`, adminPassword: PASSWORD, adminFullName: 'Adam Elsewhere' },
  })).status()).toBe(201);
  const kpi = (await (await admin.post('/kpis', { data: { name: `Churn ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };

  // The look-up itself, as Eli: he may not list people, and gets names and ids only.
  const asEli = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${eli.accessToken}` } });
  expect((await asEli.get('/users')).status()).toBe(403);
  const found = await asEli.post('/comments/mentionable', { data: { query: 'ad' } });
  expect(found.status()).toBe(200);
  expect(await found.json()).toEqual([{ id: expect.any(String), fullName: 'Ada Admin' }]);
  expect((await asEli.post('/comments/mentionable', { data: { query: '%' } })).status()).toBe(400);
  expect((await anon.post('/comments/mentionable', { data: { query: 'ad' } })).status()).toBe(401);

  // In the comment box.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: 'kpi-nexus.tour-completed', value: '1' }] }] },
  });
  const eliPage = await context.newPage();
  await eliPage.goto('/');
  await eliPage.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [eli.accessToken, eli.refreshToken] as const,
  );
  await eliPage.goto(`/kpis/${kpi.id}`);
  await eliPage.getByTestId('comments-trigger').click();
  const box = eliPage.getByTestId('comment-body');
  await box.pressSequentially('Is this right? @Ad');
  const offered = eliPage.getByTestId('mention-suggestions').getByRole('option');
  // One colleague is offered: not the invited Adele, not the other organisation's Adam.
  await expect(offered).toHaveCount(1);
  await expect(offered.first()).toContainText('Ada Admin');
  await offered.first().click();
  await expect(box).toHaveValue('Is this right? @AdaAdmin ');
  await expect(eliPage.getByTestId('comment-mention-note')).toContainText('Will notify Ada Admin');
  await eliPage.getByTestId('comment-submit').click();
  await expect(eliPage.getByTestId('comments-drawer')).toContainText('Is this right? @AdaAdmin');
  await context.close();

  // Ada has the mention.
  await expect.poll(async () => ((await (await admin.get('/me/mentions')).json()) as unknown[]).length).toBe(1);
});
