/**
 * Flow walk, 2026-11-19. Small things a reader trips on along the way:
 *  - an objective's key result read "30000 → 47200 → 50000" and its status "ACTIVE";
 *  - the Tasks page said "moves are optimistic" and showed priorities as "HIGH";
 *  - a KPI's name was cut short on the team page ("Sales calls …") with room to spare.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('OKRs and tasks read in plain words and formatted numbers', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `pwo-${stamp}`,
      slug: `pwo-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@pwo.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const me = (await (await api.get('/auth/me')).json()) as { user: { id: string } };
  const objective = (await (await api.post('/objectives', {
    data: { name: `Grow ${stamp}`, ownerUserId: me.user.id, periodStart: '2026-10-01', periodEnd: '2026-12-31', status: 'ACTIVE' },
  })).json()) as { id: string };
  const kr = (await (await api.post(`/objectives/${objective.id}/key-results`, {
    data: { name: 'Reach fifty thousand', baselineValue: 30000, targetValue: 50000, currentValue: 47200, weight: 1 },
  })).json()) as { id: string };
  const task = (await (await api.post('/tasks', { data: { title: `Call leads ${stamp}`, priority: 'HIGH' } })).json()) as { id: string };

  await page.goto(`/okrs/${objective.id}`);
  await expect(page.getByTestId('objective-status')).toHaveText('Active');
  await expect(page.getByTestId(`kr-${kr.id}`).getByTestId('kr-values')).toHaveText('30,000 → 47,200 → 50,000');

  await page.goto('/tasks');
  await expect(page.locator('main')).not.toContainText('optimistic');
  const card = page.getByTestId(`task-${task.id}`);
  await expect(card.getByTestId('task-priority')).toHaveText('High');
});
