/**
 * Flow walk (settings): on a 1280-pixel screen the AI settings table had seven
 * columns and no room for what was in them: a model read "gemini-3.5" (of
 * "gemini-3.5-flash") and the fallback choice "Built-in fa". Provider and model
 * now share a column, as the fallback's already did, and each shows its value whole.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('AI settings: each feature row shows its model and its choices whole at 1280 px', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.setViewportSize({ width: 1280, height: 900 });
  try {
    await registerOrgViaApi(page, {
      orgName: `ast-${stamp}`,
      slug: `ast-${stamp}`,
      adminFullName: 'Asad Admin',
      adminEmail: `admin-${stamp}@ast.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/settings/ai');
  const row = page.locator('[data-testid^="ai-config-"][data-testid$="-model"]').first();
  await expect(row).toBeVisible({ timeout: 15_000 });

  // Every model box is as wide as the model named in it.
  const cut = await page.locator('[data-testid^="ai-config-"][data-testid$="-model"]').evaluateAll((inputs) =>
    inputs.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => (el as HTMLInputElement).value),
  );
  expect(cut, 'models whose name is cut off').toEqual([]);

  // Every choice box is as wide as its own text.
  const short = await page.locator('main select[data-testid^="ai-config-"]').evaluateAll((selects) =>
    selects
      .map((el) => {
        const select = el as HTMLSelectElement;
        const style = getComputedStyle(select);
        const probe = document.createElement('span');
        probe.style.font = style.font;
        probe.style.whiteSpace = 'nowrap';
        probe.style.visibility = 'hidden';
        probe.textContent = select.options[select.selectedIndex]?.text ?? '';
        document.body.appendChild(probe);
        const text = probe.getBoundingClientRect().width;
        probe.remove();
        return { text: probe.textContent, room: select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - text };
      })
      .filter((s) => s.room < 0)
      .map((s) => s.text),
  );
  expect(short, 'choices cut off').toEqual([]);

  // And the table does not scroll sideways to manage it.
  const overflow = await page.locator('main table').first().evaluate((table) => table.parentElement!.scrollWidth - table.parentElement!.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
