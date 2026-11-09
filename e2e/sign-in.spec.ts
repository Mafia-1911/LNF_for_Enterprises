// The three sign-in methods (email code, phone code, university SSO) and the staff rule.
import { expect, test } from '@playwright/test';
import { clearMailpit, emailedCode, expectAccessible, query, textedCode } from './support';

test('the sign-in and visitor screens pass an accessibility scan at this width', async ({
  page,
}) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expectAccessible(page, 'sign in');
  await page.getByRole('tab', { name: 'Visitor' }).click();
  await expect(page.getByRole('heading', { name: 'Visitor sign up' })).toBeVisible();
  await expectAccessible(page, 'visitor sign up');
});

test.describe('sign-in methods', () => {
  // Each method runs once, on desktop: codes are rate-limited per address and the flows don't depend on width.
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 600, 'Runs once, in the desktop project.');
  // Every local browser reaches the server from 127.0.0.1, so codes share one rate-limit bucket
  // (3 a minute). Start each run with an empty bucket in the dev database.
  test.beforeAll(async () => {
    await query('delete from rate_limits');
  });

  test('a student signs in with a code sent by email', async ({ page }) => {
    await clearMailpit(page.request);
    await page.goto('/sign-in');
    await expectAccessible(page, 'sign in');
    await page.getByLabel('University email').fill('rafiq.ahmed@northsouth.edu');
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expectAccessible(page, 'code entry');
    await page
      .getByLabel('6-digit code')
      .fill(await emailedCode(page.request, 'rafiq.ahmed@northsouth.edu'));
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('banner').getByText('Rafiq Ahmed')).toBeVisible();
  });

  test('staff are told to use single sign-on instead of an email code', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('University email').fill('nusrat.jahan@northsouth.edu');
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await expect(page.getByText(/Staff accounts sign in with NSU single sign-on/)).toBeVisible();
  });

  test('a visitor signs up with a code sent to their phone', async ({ page }) => {
    const phone = `+8801${3 + Math.floor(Math.random() * 7)}${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    await page.goto('/sign-in?tab=visitor');
    await expect(page.getByRole('heading', { name: 'Visitor sign up' })).toBeVisible();
    await expectAccessible(page, 'visitor sign up');
    await page.getByLabel('Your name').fill('Test Visitor');
    await page.getByLabel('Mobile number').fill(phone.replace('+88', ''));
    await page.getByRole('button', { name: 'Text me a code' }).click();
    await expect(page.getByRole('heading', { name: 'Check your phone' })).toBeVisible();
    await page.getByLabel('6-digit code').fill(await textedCode(page.request, phone));
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole('banner').getByText('Test Visitor')).toBeVisible();
    // Visitors can't browse the gallery.
    await expect(page.getByRole('link', { name: 'Gallery' })).toHaveCount(0);
  });

  test('a desk officer signs in with NSU single sign-on and lands on the desk', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Continue with NSU single sign-on' }).click();
    await expect(page.getByRole('heading', { name: 'NSU single sign-on' })).toBeVisible();
    await page.getByRole('button', { name: /Nusrat Jahan/ }).click();
    await expect(page).toHaveURL(/\/desk$/);
    await expect(page.getByRole('heading', { name: 'Lost & Found desk' })).toBeVisible();
    await expectAccessible(page, 'desk home');
  });
});
