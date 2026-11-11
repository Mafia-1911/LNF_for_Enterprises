// Phase 5 smoke: the Help how-to on a screen, and the daily shelf check. axe on each.
import { expect, test } from '@playwright/test';
import { expectAccessible, resetServerClock, signInAs } from './support';

test('Help opens a short how-to for the current screen', async ({ page }) => {
  await resetServerClock(page.request);
  await signInAs(page.request, 'nusrat.jahan@northsouth.edu');
  await page.goto('/desk');
  await page.getByRole('button', { name: 'Help' }).click();
  const dialog = page.getByRole('dialog', { name: 'The desk in 30 seconds' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('listitem')).toHaveCount(4);
  await expectAccessible(page, 'help how-to');
  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).toHaveCount(0);
});

test('the desk does the daily shelf check', async ({ page }) => {
  await resetServerClock(page.request);
  await signInAs(page.request, 'nusrat.jahan@northsouth.edu');
  await page.goto('/desk/more');
  await page.getByRole('link', { name: /Daily shelf check/ }).click();
  await expect(page.getByRole('heading', { name: 'Daily shelf check' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Bin / }).first()).toBeVisible();
  await expectAccessible(page, 'shelf check');
  await page.getByRole('button', { name: 'Missing' }).first().click();
  await page.getByRole('button', { name: /Save shelf check/ }).click();
  await expect(page.getByText('Missing items')).toBeVisible();
  await expectAccessible(page, 'shelf check saved');
});
