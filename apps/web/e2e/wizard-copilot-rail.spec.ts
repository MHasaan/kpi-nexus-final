/**
 * Plan 3.8 (UI-005): the AI co-pilot showed a proposal as three numbers and
 * raw section keys, let Apply be pressed twice, ticked a rename of the
 * organisation by default, and said nothing when a suggestion changed nothing.
 */
import { type Page, expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    return (await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function enter(page: Page, stamp: string): Promise<void> {
  await page.goto('/signup');
  await page.getByTestId('signup-email').fill(`admin-${stamp}@rail.test.local`);
  await page.getByTestId('signup-org').fill(`Rail ${stamp}`);
  await page.getByTestId('entry-full').click();
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Rail ${stamp}`, { timeout: 15_000 });
  if (!(await page.getByTestId('copilot-rail').isVisible())) await page.getByTestId('copilot-toggle').click();
  await expect(page.getByTestId('copilot-rail')).toBeVisible();
}

test('co-pilot generate: the proposal is shown by name, in plain words, and Apply cannot be pressed twice', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  await page.route('**/onboarding/ai/generate', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        interactionId: 'stub-gen',
        counts: { roles: 2, positions: 0, orgUnitTypes: 1, orgUnits: 2, kpiCategories: 1, kpis: 1 },
        preview: {
          organization: { name: 'Generated Co', industry: 'Software' },
          roles: [{ name: 'Admin', isAdmin: true }, { name: 'Engineer' }],
          positions: [],
          orgUnitTypes: [{ name: 'Department' }],
          orgUnits: [{ name: 'Engineering', type: 'Department' }, { name: 'Sales', type: 'Department' }],
          kpiCategories: [{ name: 'Growth' }],
          kpis: [{ name: 'Monthly Recurring Revenue', category: 'Growth' }],
        },
      }),
    }),
  );
  let applies = 0;
  await page.route('**/onboarding/ai/apply', async (route) => {
    applies += 1;
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ applied: ['roles'] }) });
  });

  await enter(page, suffix());
  await page.getByTestId('ai-prompt').fill('B2B SaaS startup');
  await page.getByTestId('ai-generate').click();
  const diff = page.getByTestId('ai-diff');
  await expect(diff).toBeVisible();

  // Plain names for the sections, and what is in each.
  await expect(diff).toContainText('Units');
  await expect(diff).toContainText('KPI categories');
  await expect(diff).not.toContainText('orgUnits');
  await diff.getByTestId('ai-section-names-orgUnits').click();
  await expect(diff).toContainText('Engineering');
  await expect(diff).toContainText('Sales');
  await diff.getByTestId('ai-section-names-kpis').click();
  await expect(diff).toContainText('Monthly Recurring Revenue');
  // The organisation section offers details, and says the name stays.
  await expect(diff.getByTestId('ai-section-organization')).toBeChecked();
  await diff.getByTestId('ai-section-names-organization').click();
  await expect(diff).toContainText('Industry: Software');
  await expect(diff).toContainText('keeps its name');
  await expect(diff).not.toContainText('Generated Co');

  // Two quick presses send one request; the button is disabled while it runs.
  const apply = page.getByTestId('ai-apply');
  await apply.click();
  await expect(apply).toBeDisabled();
  await apply.click({ force: true }).catch(() => undefined);
  await expect(diff).toContainText('Applied');
  expect(applies).toBe(1);
});

test('co-pilot assistant: a rename of a named organisation is not ticked; each change is described', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  await page.route('**/onboarding/ai/assistant', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        interactionId: 'stub-1',
        mode: 'assistant',
        patch: [
          { op: 'add', path: '/roles/-', value: { name: 'Head of Design', permissions: ['KPI_VIEW'], isAdmin: false, level: 2 } },
          { op: 'replace', path: '/organization/name', value: 'Renamed By AI' },
        ],
      }),
    }),
  );
  const stamp = suffix();
  await enter(page, stamp);
  await page.getByTestId('copilot-tab-assistant').click();
  await page.getByTestId('ai-prompt').fill('Add a Head of Design role');
  await page.getByTestId('ai-send').click();

  const preview = page.getByTestId('ai-patch-preview');
  await expect(preview).toContainText('Add “Head of Design”');
  await expect(preview).toContainText('Change name to “Renamed By AI”');
  await expect(preview.getByTestId('ai-patch-section-roles')).toBeChecked();
  await expect(preview.getByTestId('ai-patch-section-organization')).not.toBeChecked();

  await page.getByTestId('ai-patch-apply').click();
  await expect(preview).toContainText('Applied Roles');
  await expect(page.getByTestId('count-roles')).toHaveText('1');
  await expect(page.getByTestId('wizard-org-name')).toHaveValue(`Rail ${stamp}`);
});

test('co-pilot suggest: a suggestion that is already in the draft says so', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  await page.route('**/onboarding/ai/suggest', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ interactionId: 'stub-2', mode: 'suggest', suggestions: ['Growth'] }) }),
  );
  await enter(page, suffix());
  await page.getByTestId('copilot-tab-suggest').click();
  await page.getByTestId('ai-suggest-field').selectOption('kpiCategories');
  await page.getByTestId('ai-send').click();
  await page.getByTestId('ai-suggestion-chip').filter({ hasText: 'Growth' }).click();
  await expect(page.getByTestId('count-kpiCategories')).toHaveText('1');

  // Ask again: the same suggestion comes back, and is already there.
  await page.getByTestId('ai-send').click();
  await page.getByTestId('ai-suggestion-chip').filter({ hasText: /^Growth$/ }).click();
  await expect(page.getByTestId('ai-suggestion-note').last()).toHaveText('“Growth” is already in your draft.');
  await expect(page.getByTestId('count-kpiCategories')).toHaveText('1');
});

// Manual QA (2026-11-19, F-001): the Suggest and Explain tabs looked like separate tools but shared one feed —
// the Explain tab still showed the Suggest block and its chips. Each tab now shows its own thread.
test('co-pilot tabs: each shows its own thread, and keeps it when you come back', async ({ page }) => {
  test.skip(!apiAvailable, 'api not reachable');
  await page.route('**/onboarding/ai/suggest', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ interactionId: 'stub-3', mode: 'suggest', suggestions: ['Growth'] }) }),
  );
  await page.route('**/onboarding/ai/explain', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ interactionId: 'stub-4', mode: 'explain', explanation: 'A category groups KPIs that belong together.' }) }),
  );
  await enter(page, suffix());
  await page.getByTestId('copilot-tab-suggest').click();
  await page.getByTestId('ai-suggest-field').selectOption('kpiCategories');
  await page.getByTestId('ai-send').click();
  await expect(page.getByTestId('ai-suggestion-chip').filter({ hasText: 'Growth' })).toBeVisible();

  await page.getByTestId('copilot-tab-explain').click();
  const thread = page.getByTestId('copilot-thread');
  await expect(thread.getByTestId('ai-suggestion-chip')).toHaveCount(0);
  await expect(thread).toContainText('Nothing here yet');
  await page.getByTestId('ai-send').click();
  await expect(thread).toContainText('A category groups KPIs that belong together.');
  await expect(thread.getByTestId('ai-suggestion-chip')).toHaveCount(0);

  await page.getByTestId('copilot-tab-suggest').click();
  await expect(thread.getByTestId('ai-suggestion-chip').filter({ hasText: 'Growth' })).toBeVisible();
  await expect(thread).not.toContainText('A category groups KPIs');
});
