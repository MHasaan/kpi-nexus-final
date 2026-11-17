/**
 * UI-008: /approvals asked for the workflow settings before anything else, so
 * anyone without ORG_SETTINGS — which is every approver who is not an
 * administrator — got an error instead of their inbox. A new organisation saw
 * "No workflows configured" with no way to configure one. And Approve / Reject
 * were offered to everyone, the requester included.
 */
import { type Browser, type Page, expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A second signed-in browser for someone who accepted an invitation. */
async function signInAs(browser: Browser, tokens: { accessToken: string; refreshToken: string }): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: 'kpi-nexus.tour-completed', value: '1' }] }] },
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [tokens.accessToken, tokens.refreshToken] as const,
  );
  return page;
}

test('approvals: set up from the page; the editor sees their request without buttons; the approver approves; the change applies', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const stamp = suffix();
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `appr-${stamp}`,
      slug: `appr-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@appr.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const join = async (name: string, roleName: string) => {
    const invited = (await (await admin.post('/users', {
      data: { email: `${name.toLowerCase().replace(/\s+/g, '.')}-${stamp}@appr.test.local`, fullName: name, roleId: roles.find((r) => r.name === roleName)!.id },
    })).json()) as { inviteToken: string };
    return (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
      accessToken: string;
      refreshToken: string;
    };
  };
  const editor = await join('Eve Editor', 'Manager'); // can edit KPIs, has no ORG_SETTINGS
  const kpi = (await (await admin.post('/kpis', {
    data: { name: `Churn ${stamp}`, scope: 'ORG_WIDE', type: 'PERCENTAGE', direction: 'LOWER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };

  // 1. A new organisation can switch on its first workflow from the page.
  await page.goto('/approvals');
  const config = page.getByTestId('workflow-KPI_DEFINITION');
  await expect(config).toContainText('KPI changes');
  await expect(page.getByTestId('workflow-KPI_TARGET')).toBeVisible();
  await expect(page.getByTestId('workflow-ROLE_PERMISSIONS')).toBeVisible();
  await config.getByTestId('workflow-KPI_DEFINITION-role-Admin').check();
  await config.getByTestId('workflow-active-KPI_DEFINITION').check();
  await expect(config).toContainText('On');
  const saved = (await (await admin.get('/approvals/workflows')).json()) as Array<{ entityType: string; isActive: boolean; requiredApproverRoleIds: string[] }>;
  expect(saved.find((w) => w.entityType === 'KPI_DEFINITION')).toMatchObject({ isActive: true, requiredApproverRoleIds: [roles.find((r) => r.name === 'Admin')!.id] });

  // 2. The editor renames the KPI: it is queued, not applied.
  const editorApi = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${editor.accessToken}` } });
  expect((await editorApi.patch(`/kpis/${kpi.id}`, { data: { name: `Churn rate ${stamp}` } })).status()).toBe(202);

  // 3. The editor — no ORG_SETTINGS — gets an inbox, not an error: their request, with Cancel and no Approve.
  const editorPage = await signInAs(browser, editor);
  await editorPage.goto('/approvals');
  await expect(editorPage.getByTestId('approvals-error')).toHaveCount(0);
  await expect(editorPage.getByTestId('workflow-config')).toHaveCount(0);
  const mine = editorPage.getByTestId('pending-requests').locator('[data-testid^="request-"]').first();
  await expect(mine).toContainText(`Churn ${stamp}`);
  await expect(mine).toContainText('Waiting for an approver');
  await expect(mine.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(mine.getByRole('button', { name: 'Reject' })).toHaveCount(0);
  await expect(mine.getByRole('button', { name: 'Cancel request' })).toBeVisible();

  // 4. The administrator sees who asked, what for, the change itself — and approves.
  await page.reload();
  const pending = page.getByTestId('pending-requests').locator('[data-testid^="request-"]').first();
  await expect(pending).toContainText('KPI change');
  await expect(pending).toContainText(`Churn ${stamp}`);
  await expect(pending).toContainText('Eve Editor');
  await expect(pending).toContainText(`Churn rate ${stamp}`);
  await pending.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Approved' })).toBeVisible();
  await expect(page.getByTestId('pending-empty')).toBeVisible();
  await expect(page.getByTestId('resolved-requests')).toContainText('Approved');

  // 5. The change is applied.
  expect(((await (await admin.get(`/kpis/${kpi.id}`)).json()) as { name: string }).name).toBe(`Churn rate ${stamp}`);
  await editorPage.context().close();
});
