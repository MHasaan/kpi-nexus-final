/**
 * /org-units page — reorganization UI e2e
 *
 * Registers a fresh admin org → creates unit A and unit B →
 * RENAME A → asserts new name in list →
 * MERGE A into B (from A's open panel) → asserts A row shows ARCHIVED →
 * NAME HISTORY renders. Self-skips when API not reachable.
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    console.warn(`[skip] api not reachable at ${API_URL} — org-units-reorg e2e skipped`);
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

async function registerAdmin(
  page: import('@playwright/test').Page,
  stamp: string,
): Promise<RegisterResult> {
  const apiCtx = await request.newContext({ baseURL: API_URL });
  const regRes = await apiCtx.post('/auth/register', {
    data: {
      orgName: `Reorg E2E ${stamp}`,
      slug: `reorg-${stamp}`,
      adminEmail: `admin-${stamp}@reorg.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Reorg Admin',
    },
  });
  expect(regRes.status()).toBe(201);
  const reg: RegisterResult = await regRes.json();
  await page.goto('/');
  await page.evaluate(
    ([accessToken, refreshToken]) => {
      window.localStorage.setItem('kpi-nexus.access-token', accessToken);
      window.localStorage.setItem('kpi-nexus.refresh-token', refreshToken);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );
  return reg;
}

test.describe('/org-units reorganization UI', () => {
  test('rename unit A then merge A into B (A becomes ARCHIVED)', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    await registerAdmin(page, stamp);

    await page.goto('/org-units');
    await expect(page.getByTestId('org-units-heading')).toBeVisible();

    // 1. Create unit A
    const nameA = `Alpha ${stamp}`;
    await page.getByTestId('unit-name-input').fill(nameA);
    await page.getByTestId('unit-submit-button').click();
    await expect(page.getByTestId(`unit-row-${nameA}`)).toBeVisible({ timeout: 10000 });

    // 2. Create unit B
    const nameB = `Beta ${stamp}`;
    await page.getByTestId('unit-name-input').fill(nameB);
    await page.getByTestId('unit-submit-button').click();
    await expect(page.getByTestId(`unit-row-${nameB}`)).toBeVisible({ timeout: 10000 });

    // 3. Expand unit A — members panel + reorg panel appear once members load
    await page.getByTestId(`expand-unit-${nameA}`).click();
    await expect(page.getByTestId(`members-panel-${nameA}`)).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(`reorg-panel-${nameA}`)).toBeVisible({ timeout: 10000 });

    // 4. RENAME unit A using the reorg panel
    await page.getByTestId(`reorg-rename-toggle-${nameA}`).click();
    const renameInput = page.getByTestId(`rename-input-${nameA}`);
    await expect(renameInput).toBeVisible({ timeout: 5000 });
    const nameARenamed = `Alpha Renamed ${stamp}`;
    await renameInput.fill(nameARenamed);
    await page.getByTestId(`rename-form-${nameA}`).getByRole('button', { name: /^save$/i }).click();

    // After rename the page refreshes. The renamed unit row appears; old row gone.
    // The panel stays open (expandedUnitId is unchanged — same unit ID).
    await expect(page.getByTestId(`unit-row-${nameARenamed}`)).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(`unit-row-${nameA}`)).not.toBeVisible({ timeout: 5000 });

    // 5. MERGE unit A (renamed) into unit B from the still-open reorg panel.
    //    merge-into archives the source (A), B remains active.
    await expect(page.getByTestId(`reorg-panel-${nameARenamed}`)).toBeVisible({ timeout: 10000 });
    await page.getByTestId(`reorg-merge-toggle-${nameARenamed}`).click();
    const mergeSelect = page.getByTestId(`merge-target-select-${nameARenamed}`);
    await expect(mergeSelect).toBeVisible({ timeout: 5000 });
    await mergeSelect.selectOption({ label: nameB });
    await page
      .getByTestId(`merge-form-${nameARenamed}`)
      .getByRole('button', { name: /confirm merge/i })
      .click();

    // Merge archives the source unit (A renamed). Its row should now show ARCHIVED.
    const rowA = page.getByTestId(`unit-row-${nameARenamed}`);
    await expect(rowA).toBeVisible({ timeout: 10000 });
    await expect(rowA).toContainText('ARCHIVED', { timeout: 10000 });
    // Unit B is unaffected
    await expect(page.getByTestId(`unit-row-${nameB}`)).toBeVisible();
  });

  test('name history panel renders (empty before any rename)', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    await registerAdmin(page, stamp);

    await page.goto('/org-units');
    const unitName = `Hist ${stamp}`;
    await page.getByTestId('unit-name-input').fill(unitName);
    await page.getByTestId('unit-submit-button').click();
    await expect(page.getByTestId(`unit-row-${unitName}`)).toBeVisible({ timeout: 10000 });

    // Expand to get the reorg panel
    await page.getByTestId(`expand-unit-${unitName}`).click();
    await expect(page.getByTestId(`members-panel-${unitName}`)).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId(`reorg-panel-${unitName}`)).toBeVisible({ timeout: 10000 });

    // Open name history
    await page.getByTestId(`reorg-history-toggle-${unitName}`).click();
    const historyPanel = page.getByTestId(`name-history-${unitName}`);
    await expect(historyPanel).toBeVisible({ timeout: 10000 });
    // Should say "No renames recorded." (no history yet)
    await expect(historyPanel).toContainText('No renames');
  });
});
