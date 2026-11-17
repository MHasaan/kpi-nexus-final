/**
 * UI-001: the API returns a KPI's points newest period first. Widgets took
 * `.at(-1)` as "latest", which is the OLDEST point in the window, and plotted
 * the array as given, so charts ran right to left.
 *
 * The periods here sit wholly inside the range on purpose, so this spec is
 * about which point is read as latest — not about the window rule (UI-002).
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A whole day, `back` days ago, in UTC. */
function day(back: number): { periodStart: string; periodEnd: string } {
  const start = new Date(Date.now() - back * 86_400_000);
  start.setUTCHours(0, 0, 0, 0);
  return {
    periodStart: start.toISOString(),
    periodEnd: new Date(start.getTime() + 86_399_000).toISOString(),
  };
}

test('dashboard widgets show the newest period and plot time left to right', async ({ page }) => {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  let reg: { accessToken: string; refreshToken: string };
  try {
    reg = (await (await anon.post('/auth/register', {
      data: {
        orgName: `widgets-${stamp}`,
        slug: `widgets-${stamp}`,
        adminEmail: `admin-${stamp}@widgets.test.local`,
        adminPassword: 'correct-horse-battery-staple',
        adminFullName: 'Widgets Admin',
      },
    })).json()) as { accessToken: string; refreshToken: string };
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });

  await page.goto('/');
  await page.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );

  const kpi = (await (await api.post('/kpis', {
    data: {
      name: `Widget KPI ${stamp}`,
      scope: 'ORG_WIDE',
      type: 'NUMBER',
      direction: 'HIGHER_IS_BETTER',
      aggregationMethod: 'LAST',
      frequency: 'DAILY',
    },
  })).json()) as { id: string };

  // Oldest first, so "the last one recorded" and "the newest period" agree —
  // the widget must show 300 either way it reads the array.
  for (const [value, back] of [[100, 3], [200, 2], [300, 1]] as const) {
    const res = await api.post(`/kpis/${kpi.id}/data`, { data: { value, ...day(back) } });
    expect(res.status()).toBe(201);
  }

  const dashboard = (await (await api.post('/dashboards', {
    data: { name: `Widget Dash ${stamp}` },
  })).json()) as { id: string };
  const widgets = [
    { widgetType: 'kpi_card', title: 'card widget', position: { x: 0, y: 0, w: 4, h: 3 } },
    { widgetType: 'line', title: 'line widget', position: { x: 4, y: 0, w: 8, h: 3 } },
  ] as const;
  const ids: Record<string, string> = {};
  for (const w of widgets) {
    const res = await api.post(`/dashboards/${dashboard.id}/widgets`, {
      data: { ...w, config: { kpiId: kpi.id } },
    });
    expect(res.status(), `${w.widgetType} widget created`).toBe(201);
    ids[w.widgetType] = ((await res.json()) as { id: string }).id;
  }

  await page.goto(`/dashboards/${dashboard.id}`);

  // The card shows the newest period's value, not the oldest point in the window.
  const card = page.getByTestId(`widget-render-${ids.kpi_card}`);
  await expect(card).toBeVisible();
  await expect(card).toContainText('300');
  await expect(card).not.toContainText('100');

  // The chart labels each point by its period, so three days give three
  // different labels, in order. Before the fix all three were the entry date.
  const line = page.getByTestId(`widget-render-${ids.line}`);
  await expect(line).toBeVisible();
  await expect(line).toContainText('/');
  const text = (await line.innerText()).replace(/\n/g, ' ');
  const labels = [...text.matchAll(/\d{1,2}\/\d{1,2}\/\d{4}/g)].map((m) => m[0]);
  expect(new Set(labels).size, `one label per period (${text})`).toBe(3);
  const times = labels.map((l) => new Date(l).getTime());
  expect([...times].sort((x, y) => x - y), `time reads left to right (${labels.join(', ')})`).toEqual(times);
});
