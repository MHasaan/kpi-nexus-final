/**
 * Flow walk (a member's KPI list): the note on drafts told every reader "Draft
 * only marks one you have not reviewed yet. To change it, open Edit and set
 * its status." — someone who may not edit KPIs has no Edit to open.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

test('the note on draft KPIs tells only an editor to open Edit', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `dnf-${stamp}`,
      slug: `dnf-${stamp}`,
      adminFullName: 'Dee Admin',
      adminEmail: `admin-${stamp}@dnf.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  expect((await admin.post('/kpis', { data: { name: `Churn ${stamp}`, scope: 'ORG_WIDE' } })).status()).toBe(201);
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const invited = (await (await admin.post('/users', {
    data: { email: `eli-${stamp}@dnf.test.local`, fullName: 'Eli Employee', roleId: roles.find((r) => r.name === 'Employee')!.id },
  })).json()) as { inviteToken: string };
  const eli = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
    accessToken: string;
    refreshToken: string;
  };

  // The administrator, who can edit: told how to change it.
  await page.goto('/kpis');
  await expect(page.getByTestId('kpis-draft-note')).toContainText('To change it, open Edit and set its status.');

  // An Employee, who cannot: told what Draft means, not to open an Edit they do not have.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: 'kpi-nexus.tour-completed', value: '1' }] }] },
  });
  const member = await context.newPage();
  await member.goto('/');
  await member.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [eli.accessToken, eli.refreshToken] as const,
  );
  await member.goto('/kpis');
  const note = member.getByTestId('kpis-draft-note');
  await expect(note).toContainText('is a draft');
  await expect(note).toContainText('has not been reviewed yet');
  await expect(note).not.toContainText('open Edit');
  await context.close();
});
