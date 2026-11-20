/**
 * Flow walk (settings): on the Branding page a colour that has not been chosen
 * showed a black swatch, beside a box whose grey example read "#2563eb". Blank
 * means "the app's own colour" — which is neither. The swatch now shows the
 * colour that is in use, and the box says what blank means.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('an unchosen brand colour shows the colour in use, not black', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `buc-${stamp}`,
      slug: `buc-${stamp}`,
      adminFullName: 'Bina Admin',
      adminEmail: `admin-${stamp}@buc.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/settings/branding');
  const box = page.getByTestId('branding-primary-color');
  await expect(box).toHaveValue('');
  await expect(box).toHaveAttribute('placeholder', 'The app’s own colour');
  // The app's own accent, hsl(200 98% 39%) and hsl(199 89% 48%), as the picker writes colours.
  await expect(page.getByLabel('Primary color picker')).toHaveValue('#0284c5');
  await expect(page.getByLabel('Secondary color picker')).toHaveValue('#0da2e7');

  // A colour that is chosen is shown as chosen.
  await box.fill('#16a34a');
  await expect(page.getByLabel('Primary color picker')).toHaveValue('#16a34a');
});
