/**
 * X-08: whether a KPI is doing well depends on its direction. Pages compared
 * `latestValue >= targetValue`, so every lower-is-better KPI comfortably under
 * its target was marked "Below".
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('a lower-is-better KPI under its target reads On target on the scorecard', async ({ page }) => {
  const stamp = suffix();
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `direction-${stamp}`,
      slug: `direction-${stamp}`,
      adminFullName: 'Direction Admin',
      adminEmail: `admin-${stamp}@direction.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` },
  });

  // Churn at 3.5% against a 4% ceiling: good. And revenue short of target: not.
  const kpis = [
    { name: `Churn ${stamp}`, direction: 'LOWER_IS_BETTER', targetValue: 4, value: 3.5, expected: 'On target' },
    { name: `Revenue ${stamp}`, direction: 'HIGHER_IS_BETTER', targetValue: 100, value: 40, expected: 'Below' },
  ] as const;

  for (const k of kpis) {
    const created = (await (await api.post('/kpis', {
      data: {
        name: k.name,
        scope: 'ORG_WIDE',
        type: 'NUMBER',
        direction: k.direction,
        aggregationMethod: 'LAST',
        frequency: 'MONTHLY',
        targetValue: k.targetValue,
        scorecardQuadrant: 'FINANCIAL',
      },
    })).json()) as { id: string };
    const now = new Date();
    const res = await api.post(`/kpis/${created.id}/data`, {
      data: {
        value: k.value,
        periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
        periodEnd: now.toISOString(),
      },
    });
    expect(res.status(), `${k.name} value recorded`).toBe(201);
  }

  await page.goto('/kpis/scorecard');
  const quadrant = page.getByTestId('quadrant-FINANCIAL');
  await expect(quadrant).toBeVisible();

  for (const k of kpis) {
    const row = quadrant.locator('li').filter({ hasText: k.name });
    await expect(row, `${k.name} is listed`).toHaveCount(1);
    await expect(row, `${k.name} reads "${k.expected}"`).toContainText(k.expected);
  }
});
