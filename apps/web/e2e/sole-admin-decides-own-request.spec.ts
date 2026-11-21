/**
 * Flow walk: an organisation with one administrator who turned "KPI changes
 * need approval" on could never get a change through. The administrator could
 * not decide their own request and nobody else could. When nobody else could,
 * an administrator may now decide their own request; the page says why.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('a sole administrator can decide their own approval request', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `sad-${stamp}`,
      slug: `sad-${stamp}`,
      adminFullName: 'Sadia Admin',
      adminEmail: `admin-${stamp}@sad.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  const roles = (await (await api.get('/roles')).json()) as Array<{ id: string; isAdmin: boolean }>;
  expect((await api.put('/approvals/workflows/KPI_DEFINITION', { data: { requiredApproverRoleIds: [roles.find((r) => r.isAdmin)!.id], isActive: true } })).ok()).toBe(true);
  // The administrator renames the KPI: it waits for approval.
  expect((await api.patch(`/kpis/${kpi.id}`, { data: { name: `Revenue ${stamp} (net)` } })).status()).toBe(202);

  await page.goto('/approvals');
  const pending = page.locator('[data-testid^="request-"]').first();
  await expect(pending).toContainText('Waiting for your decision');
  // It is still their own request, and still says so — not their name, as if someone else had asked.
  await expect(pending).toContainText('Asked by you');
  await expect(pending).not.toContainText('Asked by Sadia Admin');
  await expect(pending.getByTestId(/^own-request-note-/)).toContainText('nobody else can approve it');
  await pending.locator('[data-testid^="approve-"]').click();
  await expect.poll(async () => ((await (await api.get(`/kpis/${kpi.id}`)).json()) as { name: string }).name).toBe(`Revenue ${stamp} (net)`);
});
