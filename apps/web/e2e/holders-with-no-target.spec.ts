/**
 * Flow walk (the invited person): a per-unit KPI with no target anywhere, once
 * one of its two units had recorded a value, read "0 of 2 units on track · Off
 * track" on the administrator's home page. Nobody is off track against a
 * target that does not exist: it now reads "1 of 2 units recorded · No target".
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('a per-unit KPI with no target is not called off track', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `hnt2-${stamp}`,
      slug: `hnt2-${stamp}`,
      adminFullName: 'Hadi Admin',
      adminEmail: `admin-${stamp}@hnt2.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const sales = (await (await api.post('/org-units', { data: { name: `Sales ${stamp}` } })).json()) as { id: string };
  const depot = (await (await api.post('/org-units', { data: { name: `Depot ${stamp}` } })).json()) as { id: string };
  const name = `Orders ${stamp}`;
  const kpi = (await (await api.post('/kpis', { data: { name, scope: 'PER_UNIT', orgUnitIds: [sales.id, depot.id] } })).json()) as { id: string };
  const held = (await (await api.get(`/org-units/${sales.id}/kpis`)).json()) as Array<{ kpiId: string; assignmentId: string }>;
  const assignmentId = held.find((h) => h.kpiId === kpi.id)!.assignmentId;
  const today = new Date().toISOString().slice(0, 10);
  expect((await api.post(`/org-units/kpi-assignments/${assignmentId}/data`, { data: { value: 12500, periodStart: `${today.slice(0, 8)}01`, periodEnd: today } })).status()).toBe(201);

  const row = ((await (await api.get('/kpis/dashboard-summary')).json()) as Array<{ kpiId: string; status: string; holders: unknown }>).find((r) => r.kpiId === kpi.id)!;
  expect(row.status).toBe('NO_TARGET');
  expect(row.holders).toEqual({ total: 2, withValue: 1, withTarget: 0, onTrack: 0 });

  await page.goto('/dashboard');
  const line = page.getByTestId(`dashboard-card-${name}`);
  await expect(line).toContainText('1 of 2 units recorded');
  await expect(line).toContainText('No target');
  await expect(line).not.toContainText('on track');
  await expect(line).not.toContainText('Off track');
});
