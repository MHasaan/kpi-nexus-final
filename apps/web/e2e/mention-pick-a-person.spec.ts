/**
 * Flow walk (comments): typing "@Eli" in a comment notified nobody — only the
 * exact full name without its space matched, nothing was offered, and nothing
 * said the mention had missed. Typing @ now offers people to pick, and the box
 * says who will be notified (or that no one matches) before the comment is posted.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

test('typing @ in a comment offers people; the one picked is notified', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `mpp-${stamp}`,
      slug: `mpp-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@mpp.test.local`,
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
    data: { email: `eli-${stamp}@mpp.test.local`, fullName: 'Eli Employee', roleId: roles.find((r) => r.name === 'Employee')!.id },
  })).json()) as { inviteToken: string; user: { id: string } };
  const eli = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as { accessToken: string };
  const kpi = (await (await admin.post('/kpis', { data: { name: `Churn ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };

  await page.goto(`/kpis/${kpi.id}`);
  await page.getByTestId('comments-trigger').click();
  const box = page.getByTestId('comment-body');

  // A name nobody has: the box says so before anything is posted.
  await box.fill('Can you look? @Zed');
  await expect(page.getByTestId('comment-mention-note')).toContainText('No one here matches @Zed');

  // Typing @ and the start of a name offers the person; picking writes the mention.
  await box.fill('');
  await box.pressSequentially('Can you look? @El');
  await page.getByTestId('mention-suggestions').getByRole('option', { name: 'Eli Employee' }).click();
  await expect(box).toHaveValue('Can you look? @EliEmployee ');
  await expect(page.getByTestId('comment-mention-note')).toContainText('Will notify Eli Employee');

  await page.getByTestId('comment-submit').click();
  await expect(page.getByTestId('comments-drawer')).toContainText('Can you look? @EliEmployee');

  // Eli has the mention.
  const mentions = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${eli.accessToken}` } });
  await expect.poll(async () => ((await (await mentions.get('/me/mentions')).json()) as unknown[]).length).toBe(1);
});
