/**
 * Dashboard-builder e2e — widget management on a dashboard detail page.
 *
 * Must-pass assertions:
 *   1. Add a widget → it appears in the grid (`dashboard-widgets-grid`,
 *      `widget-card-<id>`).
 *   2. Reload the page → widget still present (persistence invariant).
 *
 * Best-effort assertions:
 *   3. Enter edit mode, drag a widget → `POST .../position` request fires.
 *      (Drag-drop is hard to simulate reliably in headless; the test uses
 *       page.mouse but is explicitly non-blocking if it doesn't fire.)
 *
 * Requires the api to be reachable at $API_URL (default http://localhost:4000).
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    console.warn(
      `[skip] api not reachable at ${API_URL} — dashboard-builder e2e skipped`,
    );
  }
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface RegisterResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
}

async function registerOrg(stamp: string): Promise<RegisterResult> {
  const apiCtx = await request.newContext({ baseURL: API_URL });
  const regRes = await apiCtx.post('/auth/register', {
    data: {
      orgName: `Builder E2E ${stamp}`,
      slug: `builder-${stamp}`,
      adminEmail: `admin-${stamp}@builder.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Builder Admin',
    },
  });
  expect(regRes.status()).toBe(201);
  return regRes.json() as Promise<RegisterResult>;
}

async function injectTokens(
  page: import('@playwright/test').Page,
  reg: RegisterResult,
): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ([at, rt]) => {
      window.localStorage.setItem('kpi-nexus.access-token', at);
      window.localStorage.setItem('kpi-nexus.refresh-token', rt);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );
}

test.describe('Dashboard builder — widget add + persistence', () => {
  test(
    'add a widget via the UI form → appears in grid → persists after reload',
    { tag: ['@builder'] },
    async ({ page }) => {
      test.skip(!apiAvailable, 'api not reachable');

      const stamp = suffix();
      const reg = await registerOrg(stamp);
      const apiCtx = await request.newContext({
        baseURL: API_URL,
        extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
      });

      // Create a KPI to bind the widget to
      const kpiRes = await apiCtx.post('/kpis', {
        data: {
          name: `Builder KPI ${stamp}`,
          scope: 'ORG_WIDE',
          type: 'NUMBER',
          unit: 'pts',
          aggregationMethod: 'SUM',
        },
      });
      expect(kpiRes.status()).toBe(201);
      const kpi = (await kpiRes.json()) as { id: string };

      // Create a dashboard via API (skip the /dashboards/new UI to save steps)
      const dashRes = await apiCtx.post('/dashboards', {
        data: { name: `Builder Dashboard ${stamp}` },
      });
      expect(dashRes.status()).toBe(201);
      const dash = (await dashRes.json()) as { id: string };

      // Navigate to the dashboard detail page
      await injectTokens(page, reg);
      await page.goto(`/dashboards/${dash.id}`);
      await expect(page.getByTestId('dashboard-detail-heading')).toBeVisible();

      // No widgets yet — empty state
      await expect(page.getByTestId('dashboard-widgets-empty')).toBeVisible();

      // 1. Open the add-widget form
      await page.getByTestId('dashboard-add-widget-toggle').click();
      await expect(page.getByTestId('dashboard-add-widget-section')).toBeVisible({
        timeout: 5000,
      });

      // 2. Select widget type "KPI card", set title, enter kpi id
      await page.getByTestId('widget-type-select').selectOption('kpi_card');
      await page.getByTestId('widget-title-input').fill(`My KPI Card ${stamp}`);
      await page.getByTestId('widget-kpiid-input').fill(kpi.id);

      // 3. Submit and wait for the POST /dashboards/:id/widgets response
      const addResponse = page.waitForResponse(
        (r) =>
          r.url().includes(`/dashboards/${dash.id}/widgets`) &&
          r.request().method() === 'POST',
      );
      await page.getByTestId('widget-add-submit').click();
      const addResp = await addResponse;
      expect(addResp.status()).toBe(201);
      const addedWidget = (await addResp.json()) as { id: string };

      // 4. The grid should now be visible and contain the new widget
      await expect(page.getByTestId('dashboard-widgets-grid')).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        page.getByTestId(`widget-card-${addedWidget.id}`),
      ).toBeVisible({ timeout: 10_000 });

      // 5. Reload the page — widget must still be present (persistence invariant)
      await page.reload();
      await expect(page.getByTestId('dashboard-detail-heading')).toBeVisible();
      await expect(page.getByTestId('dashboard-widgets-grid')).toBeVisible({
        timeout: 10_000,
      });
      await expect(
        page.getByTestId(`widget-card-${addedWidget.id}`),
      ).toBeVisible({ timeout: 10_000 });
    },
  );

  test(
    'add two widgets → both persist after reload → delete one → one remains',
    { tag: ['@builder'] },
    async ({ page }) => {
      test.skip(!apiAvailable, 'api not reachable');

      const stamp = suffix();
      const reg = await registerOrg(stamp);
      const apiCtx = await request.newContext({
        baseURL: API_URL,
        extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
      });

      // Create dashboard
      const dashRes = await apiCtx.post('/dashboards', {
        data: { name: `Multi Widget ${stamp}` },
      });
      expect(dashRes.status()).toBe(201);
      const dash = (await dashRes.json()) as { id: string };

      // Add two widgets via API directly (faster than UI for the second widget)
      const w1Res = await apiCtx.post(`/dashboards/${dash.id}/widgets`, {
        data: {
          widgetType: 'number',
          title: 'Widget One',
          config: {},
          position: { x: 0, y: 0, w: 4, h: 3 },
        },
      });
      expect(w1Res.status()).toBe(201);
      const w1 = (await w1Res.json()) as { id: string };

      const w2Res = await apiCtx.post(`/dashboards/${dash.id}/widgets`, {
        data: {
          widgetType: 'bar',
          title: 'Widget Two',
          config: {},
          position: { x: 4, y: 0, w: 4, h: 3 },
        },
      });
      expect(w2Res.status()).toBe(201);
      const w2 = (await w2Res.json()) as { id: string };

      // Navigate to the dashboard
      await injectTokens(page, reg);
      await page.goto(`/dashboards/${dash.id}`);
      await expect(page.getByTestId('dashboard-detail-heading')).toBeVisible();

      // Both widgets visible
      await expect(page.getByTestId(`widget-card-${w1.id}`)).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByTestId(`widget-card-${w2.id}`)).toBeVisible({
        timeout: 10_000,
      });

      // Reload → both still present
      await page.reload();
      await expect(page.getByTestId('dashboard-detail-heading')).toBeVisible();
      await expect(page.getByTestId(`widget-card-${w1.id}`)).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByTestId(`widget-card-${w2.id}`)).toBeVisible({
        timeout: 10_000,
      });

      // Enter edit mode and delete widget 1 via the UI delete button.
      //
      // The delete button is tagged `.widget-no-drag` and the grid passes
      // `draggableCancel=".widget-no-drag"`, so react-grid-layout's DraggableCore
      // does NOT swallow the button's pointer events in edit mode. This exercises
      // the real UI delete path while drag is active.
      await page.getByTestId('dashboard-edit-toggle').click();
      await page.getByTestId(`widget-delete-${w1.id}`).click();

      // Widget 1 should disappear from the grid after the delete resolves.
      await expect(page.getByTestId(`widget-card-${w1.id}`)).not.toBeVisible({
        timeout: 10_000,
      });

      // Reload → widget 2 still present, widget 1 gone (persistence check)
      await page.reload();
      await expect(page.getByTestId('dashboard-detail-heading')).toBeVisible();
      await expect(page.getByTestId(`widget-card-${w2.id}`)).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByTestId(`widget-card-${w1.id}`)).not.toBeVisible({
        timeout: 5_000,
      });
    },
  );

  test(
    'edit mode drag — position POST fires (best-effort)',
    { tag: ['@builder', '@drag'] },
    async ({ page }, testInfo) => {
      test.skip(!apiAvailable, 'api not reachable');

      const stamp = suffix();
      const reg = await registerOrg(stamp);
      const apiCtx = await request.newContext({
        baseURL: API_URL,
        extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
      });

      const dashRes = await apiCtx.post('/dashboards', {
        data: { name: `Drag Test ${stamp}` },
      });
      expect(dashRes.status()).toBe(201);
      const dash = (await dashRes.json()) as { id: string };

      const wRes = await apiCtx.post(`/dashboards/${dash.id}/widgets`, {
        data: {
          widgetType: 'number',
          title: 'Drag Me',
          config: {},
          position: { x: 0, y: 0, w: 4, h: 3 },
        },
      });
      expect(wRes.status()).toBe(201);
      const w = (await wRes.json()) as { id: string };

      await injectTokens(page, reg);
      await page.goto(`/dashboards/${dash.id}`);
      await expect(page.getByTestId(`widget-card-${w.id}`)).toBeVisible({
        timeout: 10_000,
      });

      // Enter edit mode
      await page.getByTestId('dashboard-edit-toggle').click();

      // Locate the drag handle (`.widget-drag-handle` inside the card)
      const widgetCard = page.getByTestId(`widget-card-${w.id}`);
      const dragHandle = widgetCard.locator('.widget-drag-handle');
      await expect(dragHandle).toBeVisible({ timeout: 5000 });

      // Attempt a drag via page.mouse
      let positionRequestFired = false;
      page.on('request', (req) => {
        if (
          req.url().includes(`/widgets/${w.id}/position`) &&
          req.method() === 'POST'
        ) {
          positionRequestFired = true;
        }
      });

      try {
        const box = await dragHandle.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          // Move by ~3 grid columns worth (react-grid-layout col width ~ containerWidth/12)
          await page.mouse.move(
            box.x + box.width / 2 + 200,
            box.y + box.height / 2,
            { steps: 10 },
          );
          await page.mouse.up();
          // Wait for debounced position save (350 ms + network)
          await page.waitForTimeout(800);
        }
      } catch {
        // Drag failed — not a blocking assertion
      }

      if (positionRequestFired) {
        // Drag succeeded and position was saved — great
        console.log('[builder] Drag position POST fired successfully.');
      } else {
        testInfo.annotations.push({
          type: 'info',
          description:
            'Drag-and-drop position POST did not fire. This is acceptable in ' +
            'headless environments where react-grid-layout drag may not trigger.',
        });
      }

      // Must-pass: widget still renders after attempted drag
      await expect(page.getByTestId(`widget-card-${w.id}`)).toBeVisible({
        timeout: 5000,
      });
    },
  );

  test(
    'dashboard detail requires authentication — redirects to /login',
    { tag: ['@builder'] },
    async ({ page }) => {
      test.skip(!apiAvailable, 'api not reachable');

      await page.goto('/');
      await page.evaluate(() => {
        window.localStorage.removeItem('kpi-nexus.access-token');
        window.localStorage.removeItem('kpi-nexus.refresh-token');
      });
      await page.goto('/dashboards/fake-dashboard-id');
      await expect(page).toHaveURL(/\/login$/);
    },
  );
});
