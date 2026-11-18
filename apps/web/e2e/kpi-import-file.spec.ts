/**
 * Plan 7.7 (KPI import): the page took CSV only by pasting it into a box.
 * A CSV file can now be chosen; its text lands in the same box, to be checked
 * and committed as before.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('KPI import: choose a CSV file, dry-run it, and commit; a file too large is refused', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `kif-${stamp}`,
      slug: `kif-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@kif.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/kpis/import');
  const csv = `Name,Type,Direction,Target\nRevenue ${stamp},CURRENCY,HIGHER_IS_BETTER,1000\nChurn ${stamp},PERCENTAGE,LOWER_IS_BETTER,5\n`;

  await page.getByTestId('kpi-import-file').setInputFiles({ name: 'kpis.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await expect(page.getByTestId('kpi-import-textarea')).toHaveValue(csv);
  await expect(page.getByTestId('kpi-import-file-name')).toContainText('kpis.csv');

  await page.getByTestId('kpi-import-dryrun').click();
  await expect(page.getByTestId('kpi-import-commit')).toBeEnabled();

  // Changing the text after a dry-run means it has not been checked: commit waits for another dry-run.
  await page.getByTestId('kpi-import-textarea').fill(`${csv}Extra ${stamp},NUMBER,HIGHER_IS_BETTER,1\n`);
  await expect(page.getByTestId('kpi-import-commit')).toBeDisabled();
  await page.getByTestId('kpi-import-dryrun').click();
  await expect(page.getByTestId('kpi-import-commit')).toBeEnabled();
  await page.getByTestId('kpi-import-commit').click();
  await expect(page.getByText('Imported 3 KPIs.')).toBeVisible();

  // A file over the limit is refused before anything is read into the box.
  await page.getByTestId('kpi-import-file').setInputFiles({ name: 'huge.csv', mimeType: 'text/csv', buffer: Buffer.alloc(1_100_000, 'a') });
  await expect(page.getByTestId('kpi-import-error')).toContainText('too large');
  await expect(page.getByTestId('kpi-import-textarea')).toHaveValue('');
});
