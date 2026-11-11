// Phase 4a smoke: the supervisor's overview, retention, policies (with a closure) and staff screens
// load, work, and pass axe at both viewports.
import { expect, test } from '@playwright/test';
import { expectAccessible, resetServerClock, signInAs } from './support';

const unique = () => Math.random().toString(36).slice(2, 7);

test('a supervisor sees the overview, runs retention, edits a closure and adds staff', async ({
  page,
}) => {
  await resetServerClock(page.request);
  await signInAs(page.request, 'farhana.islam@northsouth.edu');

  await page.goto('/');
  await expect(page).toHaveURL(/\/supervisor\/?$/);
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('In custody')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Latest activity' })).toBeVisible();
  await expectAccessible(page, 'supervisor overview');

  await page
    .getByRole('navigation', { name: 'Supervisor' })
    .getByRole('link', { name: /Retention/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Retention & disposal' })).toBeVisible();
  await page.getByRole('button', { name: 'Run daily job now' }).click();
  await expect(page.getByText(/Daily job done/).first()).toBeVisible();
  await expectAccessible(page, 'retention');

  await page
    .getByRole('navigation', { name: 'Supervisor' })
    .getByRole('link', { name: 'Policies' })
    .click();
  await expect(page.getByLabel('Retention period')).toHaveValue(/\d+/);
  const name = `E2E closure ${unique()}`;
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('From').fill('2027-03-01');
  await page.getByLabel('To').fill('2027-03-02');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText(name)).toBeVisible();
  await expectAccessible(page, 'policies');
  await page.getByRole('button', { name: `Remove ${name}` }).click();
  await expect(page.getByText(name)).toHaveCount(0);

  await page
    .getByRole('navigation', { name: 'Supervisor' })
    .getByRole('link', { name: 'Staff' })
    .click();
  await expect(page.getByText('Farhana Islam (you)')).toBeVisible();
  const email = `e2e.${unique()}@northsouth.edu`;
  await page.getByLabel('Full name').fill('E2E Officer');
  await page.getByLabel('University email').fill(email);
  await page.getByRole('button', { name: 'Add staff' }).click();
  await expect(page.getByText(email, { exact: false })).toBeVisible();
  await expectAccessible(page, 'staff');
  await page
    .getByRole('listitem')
    .filter({ hasText: email })
    .getByRole('button', { name: 'Cancel invite' })
    .click();
  await page.getByRole('button', { name: 'Remove access' }).click();
  await expect(page.getByText(email, { exact: false })).toHaveCount(0);
});
