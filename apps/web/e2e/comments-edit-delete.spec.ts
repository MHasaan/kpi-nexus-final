/**
 * Plan 7.7 (comments): the Comments button showed no count until the drawer
 * had been opened; a comment, once posted, could not be changed or removed
 * though the API allows its author both; and the box promised markdown that
 * was never rendered.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

test('comments: the count is there on arrival; an author can edit and delete their own', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `cmt-${stamp}`,
      slug: `cmt-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@cmt.test.local`,
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
    data: { email: `eli-${stamp}@cmt.test.local`, fullName: 'Eli Employee', roleId: roles.find((r) => r.name === 'Employee')!.id },
  })).json()) as { inviteToken: string };
  const tokens = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as { accessToken: string };
  const eli = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${tokens.accessToken}` } });

  const kpi = (await (await admin.post('/kpis', { data: { name: `Churn ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  const mine = (await (await admin.post('/comments', { data: { entityType: 'kpi', entityId: kpi.id, body: 'Frist draft' } })).json()) as { id: string };
  const theirs = (await (await eli.post('/comments', { data: { entityType: 'kpi', entityId: kpi.id, body: 'Looks right to me' } })).json()) as { id: string };

  // The count is on the button before anyone opens the drawer.
  await page.goto(`/kpis/${kpi.id}`);
  const trigger = page.getByTestId('comments-trigger');
  await expect(trigger).toHaveText(/Comments \(2\)/);
  await trigger.click();
  await expect(page.getByTestId('comments-drawer')).not.toContainText('markdown');

  // Someone else's comment: by name, and not mine to change.
  const other = page.getByTestId(`comment-${theirs.id}`);
  await expect(other).toContainText('Eli Employee');
  await expect(other.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expect(other.getByRole('button', { name: 'Delete' })).toHaveCount(0);

  // My own: edit it…
  await page.getByTestId(`comment-edit-${mine.id}`).click();
  await page.getByTestId(`comment-edit-body-${mine.id}`).fill('First draft, corrected');
  await page.getByTestId(`comment-edit-save-${mine.id}`).click();
  const own = page.getByTestId(`comment-${mine.id}`);
  await expect(own).toContainText('First draft, corrected');
  await expect(own).toContainText('edited');

  // …and delete it, after being asked.
  await page.getByTestId(`comment-delete-${mine.id}`).click();
  await expect(page.getByTestId('comment-delete-confirm')).toContainText('Delete your comment?');
  await page.getByTestId('comment-delete-confirm-confirm').click();
  await expect(own).toHaveCount(0);
  await expect(other).toBeVisible();
  await page.getByTestId('comments-close').click();
  await expect(trigger).toHaveText(/Comments \(1\)/);
});
