// GOLDEN SLICE end to end: a student completes all four steps, gets an LST ID, and exactly one
// audit event is written. Runs at 360 px and 1280 px, with an axe scan on every screen.
import { expect, test } from '@playwright/test';
import {
  dhakaInput,
  expectAccessible,
  query,
  resetServerClock,
  serverNow,
  signInAs,
} from './support';

test('a student reports a lost item in four steps', async ({ page }) => {
  await resetServerClock(page.request);
  await signInAs(page.request, 'rafiq.ahmed@northsouth.edu');
  await page.goto('/');
  await expect(page).toHaveURL(/\/home$/);
  await expectAccessible(page, 'student home');

  await page.getByRole('link', { name: /I lost something/ }).click();
  await expect(page.getByText('Step 1 of 4 ·')).toBeVisible();
  await expectAccessible(page, 'step 1');
  // Continue without choosing: the step explains what is missing.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toHaveText('Pick what you lost.');
  await page.getByRole('radio', { name: 'Glasses' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Describe your glasses' })).toBeVisible();
  await expect(page.getByText('Step 2 of 4 ·')).toBeVisible();
  await page.getByRole('radio', { name: 'Grey' }).click();
  await page.getByLabel('Short name').fill('Calvin');
  await page.getByLabel('Brand').fill('Calvin Klein');
  await page.getByLabel('Public description').fill('Thin metal frame in a black case.');
  await page.getByLabel('Private details').fill('Scratch on the left lens');
  await expect(page.getByText(/^Draft saved \d{2}:\d{2}$/)).toBeVisible();
  await expectAccessible(page, 'step 2');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Step 3 of 4 ·')).toBeVisible();
  await page.getByRole('radio', { name: /North Academic Building/ }).click();
  await page.getByLabel('Floor').selectOption({ label: '2nd floor' });
  await page.getByLabel('Room or zone').selectOption({ label: 'Labs' });
  const now = await serverNow(page.request);
  await page.getByLabel('From').fill(dhakaInput(now, 3));
  await page.getByLabel('To').fill(dhakaInput(now, 1));
  await expectAccessible(page, 'step 3');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Ready to submit' })).toBeVisible();
  await expect(page.getByText('Step 4 of 4 ·')).toBeVisible();
  await expect(page.getByText('Glasses · Grey ·')).toBeVisible();
  await expectAccessible(page, 'step 4');
  await page.getByRole('button', { name: 'Submit report' }).click();

  await expect(page).toHaveURL(/\/lost\/LST-\d{4}-\d{4}[A-Z]\/submitted$/);
  const id = (await page.getByTestId('report-id').textContent())?.trim() ?? '';
  expect(id).toMatch(/^LST-\d{4}-\d{4}[A-Z]$/);
  await expect(page.getByText('Your report stays open for 30 days.')).toBeVisible();
  await expectAccessible(page, 'submitted');

  const events = await query<{ event: string; to_state: string }>(
    `select e.event, e.to_state from audit_events e join tenants t on t.id = e.tenant_id
     where t.slug = 'nsu' and e.record_type = 'lost_report' and e.record_id = $1`,
    [id],
  );
  expect(events).toEqual([{ event: 'SUBMIT', to_state: 'OPEN' }]);

  // The draft is cleared after submitting.
  expect(
    await page.evaluate(() =>
      Object.keys(window.localStorage).filter((k) => k.startsWith('lf.draft.')),
    ),
  ).toEqual([]);

  await page.getByRole('link', { name: 'View my report' }).click();
  await expect(page.getByText(id)).toBeVisible();
  await expect(page.getByText('Scratch on the left lens')).toHaveCount(0);
});
