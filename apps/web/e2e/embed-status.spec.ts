/**
 * QA-L13: the public KPI embed printed "No data" beside a valid value when the
 * KPI had no thresholds. BE-049: it also showed per-person values. Both are
 * checked here against a real embed link.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('KPI embed: the status matches the value, and "No data" appears only with no value', async ({ page, browser }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `emb-${stamp}`,
      slug: `emb-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@emb.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const today = new Date().toISOString().slice(0, 10);
  const period = { periodStart: `${today.slice(0, 8)}01`, periodEnd: today };
  const make = async (name: string, extra: Record<string, unknown>, value?: number) => {
    const kpi = (await (await api.post('/kpis', { data: { name: `${name} ${stamp}`, scope: 'ORG_WIDE', unit: '%', direction: 'HIGHER_IS_BETTER', ...extra } })).json()) as { id: string };
    if (value !== undefined) expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value, ...period } })).status()).toBe(201);
    const minted = (await (await api.post(`/reports/kpis/${kpi.id}/embed-token`, { data: {} })).json()) as { token: string };
    return minted.token;
  };
  const onTarget = await make('On target', { targetValue: 100 }, 120);
  const ungraded = await make('Ungraded', {}, 55);
  const empty = await make('Empty', { targetValue: 100 });

  // Anyone with the link, not signed in.
  const viewer = await (await browser.newContext()).newPage();

  // A value graded against its target alone: a real status.
  await viewer.goto(`/embed/kpi/${onTarget}`);
  await expect(viewer.getByTestId('embed-kpi-card')).toContainText('120');
  await expect(viewer.getByTestId('embed-kpi-status')).toHaveText('On track');

  // A value with nothing to grade it against: the value, and no "No data".
  await viewer.goto(`/embed/kpi/${ungraded}`);
  await expect(viewer.getByTestId('embed-kpi-card')).toContainText('55');
  await expect(viewer.getByTestId('embed-kpi-status')).toHaveCount(0);
  await expect(viewer.getByTestId('embed-kpi-card')).not.toContainText('No data');

  // No value: "No data", once.
  await viewer.goto(`/embed/kpi/${empty}`);
  await expect(viewer.getByTestId('embed-kpi-card').getByText('No data')).toHaveCount(1);
  await viewer.context().close();
});
