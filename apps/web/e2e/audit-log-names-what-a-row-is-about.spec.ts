/**
 * Flow walk (settings): each row of the audit log read "CREATE KPI:cmwnc9zl by
 * omar@…" — the kind of thing and the start of its id. Which KPI was behind a
 * "Metadata" fold, as JSON. A row now also names what it is about, when the
 * record holds a name for it.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('the audit log names the KPI or person a row is about', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `aln-${stamp}`,
      slug: `aln-${stamp}`,
      adminFullName: 'Alia Admin',
      adminEmail: `admin-${stamp}@aln.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  expect((await api.post('/kpis', { data: { name: `Returns ${stamp}`, scope: 'ORG_WIDE' } })).status()).toBe(201);
  expect((await api.post('/users', { data: { email: `invitee-${stamp}@aln.test.local`, fullName: 'Ina Invited' } })).status()).toBe(201);

  await page.goto('/settings/audit');
  const list = page.getByTestId('audit-list');
  const kpiRow = list.locator('li').filter({ hasText: `Returns ${stamp}` });
  await expect(kpiRow.getByTestId('audit-subject')).toHaveText(`“Returns ${stamp}”`);
  // The exact record is still there: the action and the kind of thing, as stored.
  await expect(kpiRow.getByTestId('audit-action-badge')).toHaveText('CREATE');
  await expect(list.locator('li').filter({ hasText: `invitee-${stamp}@aln.test.local` }).getByTestId('audit-subject')).toHaveText(`“invitee-${stamp}@aln.test.local”`);
});
