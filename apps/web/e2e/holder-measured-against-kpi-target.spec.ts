/**
 * Flow walk (per-person and per-unit KPIs): a KPI given a target — "Calls
 * made: 40" — and handed to people showed each of them no target on My KPIs
 * and never worked out their status, because only a target set on the
 * person's own assignment counted. The organisation's count of people on
 * track therefore stayed at none, whatever they recorded. A holder with no
 * target of their own is now measured against the KPI's.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = 'correct-horse-battery-staple';

test('a person or unit with no target of their own is measured against the KPI’s target', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `hmt-${stamp}`,
      slug: `hmt-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@hmt.test.local`,
      adminPassword: PASSWORD,
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const admin = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const anon = await request.newContext({ baseURL: API_URL });
  const me = (await (await admin.get('/auth/me')).json()) as { user: { id: string } };
  const roles = (await (await admin.get('/roles')).json()) as Array<{ id: string; name: string }>;
  const invited = (await (await admin.post('/users', {
    data: { email: `eli-${stamp}@hmt.test.local`, fullName: 'Eli Employee', roleId: roles.find((r) => r.name === 'Employee')!.id },
  })).json()) as { inviteToken: string; user: { id: string } };
  const eli = (await (await anon.post('/auth/accept-invitation', { data: { token: invited.inviteToken, password: PASSWORD } })).json()) as {
    accessToken: string;
    refreshToken: string;
  };
  const asEli = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${eli.accessToken}` } });

  // A per-person KPI with its target on the KPI, held by two people. Eli records 45.
  const calls = (await (await admin.post('/kpis', {
    data: { name: `Calls ${stamp}`, scope: 'PER_USER', targetValue: 40, userIds: [invited.user.id, me.user.id] },
  })).json()) as { id: string };
  const mine = (await (await asEli.get('/user-kpis/my-kpis')).json()) as Array<{ assignmentId: string; targetValue: number | null }>;
  expect(mine[0]!.targetValue).toBe(40);
  expect((await asEli.post(`/user-kpis/my-kpis/${mine[0]!.assignmentId}/data`, { data: { value: 45, periodStart: '2026-01-05', periodEnd: '2026-01-11' } })).status()).toBe(201);

  // Eli's own page: his target, and where he stands against it.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:3000', localStorage: [{ name: 'kpi-nexus.tour-completed', value: '1' }] }] },
  });
  const his = await context.newPage();
  await his.goto('/');
  await his.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [eli.accessToken, eli.refreshToken] as const,
  );
  await his.goto('/my-kpis');
  const card = his.getByTestId('my-kpis-list');
  await expect(card).toContainText('Target 40');
  await expect(card).toContainText('On track');
  await context.close();

  // The organisation's view counts him on track: one of two, the other has recorded nothing.
  const summary = (await (await admin.get('/kpis/dashboard-summary')).json()) as Array<{ kpiId: string; holders: { total: number; withValue: number; onTrack: number } | null }>;
  expect(summary.find((r) => r.kpiId === calls.id)!.holders).toEqual({ total: 2, withValue: 1, onTrack: 1 });

  // The same for a unit: target on the KPI, none on the unit.
  const unit = (await (await admin.post('/org-units', { data: { name: `Sales ${stamp}` } })).json()) as { id: string };
  expect((await admin.post('/kpis', { data: { name: `Pipeline ${stamp}`, scope: 'PER_UNIT', targetValue: 100, orgUnitIds: [unit.id] } })).status()).toBe(201);
  const held = async () => (await (await admin.get(`/org-units/${unit.id}/kpis`)).json()) as Array<{ assignmentId: string; targetValue: number | null; status: string | null }>;
  expect((await held())[0]!.targetValue).toBe(100);
  expect((await admin.post(`/org-units/kpi-assignments/${(await held())[0]!.assignmentId}/data`, { data: { value: 120, periodStart: '2026-01-01', periodEnd: '2026-01-31' } })).status()).toBe(201);
  expect((await held())[0]).toMatchObject({ targetValue: 100, status: 'exceeded' });
});
