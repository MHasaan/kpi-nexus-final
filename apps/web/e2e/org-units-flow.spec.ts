/**
 * /org-units page e2e — admin CRUD UI for the organization tree.
 *
 * Admin registers via api → /org-units renders (with the seed Departments
 * dimension empty) → creates a top-level unit "Engineering" → creates a
 * child unit "Backend" under it → expands "Engineering" → adds a member
 * (the admin themselves) → removes the member → deletes the child →
 * deletes the parent.
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
    console.warn(`[skip] api not reachable at ${API_URL} — org-units e2e skipped`);
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

async function registerAndSeed(
  page: import('@playwright/test').Page,
  stamp: string,
): Promise<RegisterResult> {
  const apiCtx = await request.newContext({ baseURL: API_URL });
  const regRes = await apiCtx.post('/auth/register', {
    data: {
      orgName: `Org Units E2E ${stamp}`,
      slug: `org-units-${stamp}`,
      adminEmail: `admin-${stamp}@org-units.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Org Units Admin',
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

test.describe('/org-units page — admin CRUD UI', () => {
  test('admin creates parent + child, manages members, deletes', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    const reg = await registerAndSeed(page, stamp);

    await page.goto('/org-units');
    await expect(page.getByTestId('org-units-heading')).toBeVisible();
    // Fresh org has no units yet
    await expect(page.getByTestId('units-empty')).toBeVisible();

    // 1. Create top-level unit "Engineering"
    const parentName = `Engineering ${stamp}`;
    await page.getByTestId('unit-name-input').fill(parentName);
    await page.getByTestId('unit-submit-button').click();
    const parentRow = page.getByTestId(`unit-row-${parentName}`);
    await expect(parentRow).toBeVisible();
    await expect(parentRow).toContainText('ACTIVE');

    // 2. Create a child unit "Backend" with parent = Engineering
    const childName = `Backend ${stamp}`;
    await page.getByTestId('unit-name-input').fill(childName);
    await page.getByTestId('unit-parent-select').selectOption({ label: parentName });
    await page.getByTestId('unit-submit-button').click();
    const childRow = page.getByTestId(`unit-row-${childName}`);
    await expect(childRow).toBeVisible();
    // Parent badge shows
    await expect(childRow).toContainText(parentName);

    // 3. Expand the parent and add the admin user as a member
    await parentRow.getByTestId(`expand-unit-${parentName}`).click();
    const membersPanel = page.getByTestId(`members-panel-${parentName}`);
    await expect(membersPanel).toBeVisible();

    await page.getByTestId('add-member-select').selectOption(reg.user.id);
    await page.getByTestId('add-member-role').selectOption('LEAD');
    await page.getByTestId('add-member-button').click();

    const memberRow = page.getByTestId(`unit-member-${reg.user.id}`);
    await expect(memberRow).toBeVisible();
    await expect(memberRow).toContainText('LEAD');

    // 4. Remove the member
    await page.getByTestId(`remove-member-${reg.user.id}`).click();
    await expect(memberRow).not.toBeVisible();

    // 5. Collapse + delete child
    await parentRow.getByTestId(`expand-unit-${parentName}`).click();
    await page.getByTestId(`delete-unit-${childName}`).click();
    await expect(childRow).not.toBeVisible();

    // 6. Delete the parent
    await page.getByTestId(`delete-unit-${parentName}`).click();
    await expect(parentRow).not.toBeVisible();
    // Back to empty state
    await expect(page.getByTestId('units-empty')).toBeVisible();
  });

  test('create with name shorter than 2 chars → api validation error surfaces', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    await registerAndSeed(page, stamp);

    await page.goto('/org-units');
    await page.getByTestId('unit-name-input').fill('X');
    await page.getByTestId('unit-submit-button').click();
    await expect(page.getByTestId('unit-error')).toBeVisible();
  });

  test('/org-units without a token redirects to /login', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.removeItem('kpi-nexus.access-token');
      window.localStorage.removeItem('kpi-nexus.refresh-token');
    });
    await page.goto('/org-units');
    await expect(page).toHaveURL(/\/login$/);
  });
});
