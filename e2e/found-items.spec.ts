// Phase 1 end to end: a student posts a found item and gets an FND ID and QR; the desk receives it
// by typing the ID; the desk logs a walk-in item in four steps and prints its label; the gallery,
// alerts, find and record screens work. Every screen gets an axe scan at 360 px and 1280 px.
import { expect, test, type Page } from '@playwright/test';
import {
  dhakaInput,
  expectAccessible,
  query,
  resetServerClock,
  serverNow,
  signInAs,
} from './support';

const unique = () => Math.random().toString(36).slice(2, 7).toUpperCase();

async function postFoundItem(page: Page, shortName: string): Promise<string> {
  await page.goto('/found/new');
  await expect(page.getByRole('heading', { name: 'I found something' })).toBeVisible();
  await page.getByRole('radio', { name: 'Bottle' }).click();
  await page.getByRole('radio', { name: 'Blue', exact: true }).click();
  await page.getByLabel('Short name').fill(shortName);
  await page.getByRole('radio', { name: /Gym & Sports Complex/ }).click();
  await page.getByRole('checkbox', { name: 'Stickers or engraving' }).click();
  await page.getByLabel('Short note').fill('Sticker of a cat on the base');
  await expect(page.getByRole('heading', { name: 'Someone lost this?' })).toBeVisible();
  await expectAccessible(page, 'found form');
  await page.getByRole('button', { name: 'Submit and get my QR' }).click();
  await expect(page).toHaveURL(/\/found\/FND-\d{4}-\d{4}[A-Z]\/posted$/);
  const id = (await page.getByTestId('found-id').textContent())?.trim() ?? '';
  expect(id).toMatch(/^FND-\d{4}-\d{4}[A-Z]$/);
  await expect(page.getByAltText(`QR code for ${id}`)).toBeVisible();
  await expect(page.getByText(/^Hand in within \d+ hours$/)).toBeVisible();
  return id;
}

test('a student posts a found item and the desk receives it by its ID', async ({
  page,
  context,
}) => {
  await resetServerClock(page.request);
  await signInAs(page.request, 'rafiq.ahmed@northsouth.edu');
  const name = `E2E bottle ${unique()}`;
  const id = await postFoundItem(page, name);
  await expectAccessible(page, 'found item posted');

  const events = await query<{ event: string }>(
    `select e.event from audit_events e join tenants t on t.id = e.tenant_id
     where t.slug = 'nsu' and e.record_type = 'found_item' and e.record_id = $1`,
    [id],
  );
  expect(events).toEqual([{ event: 'POST' }]);

  // It shows in My activity under Found.
  await page.goto('/activity');
  await page.getByRole('tab', { name: /^Found/ }).click();
  await expect(page.getByRole('link', { name })).toBeVisible();
  await expectAccessible(page, 'my activity');

  // The desk types the ID (any case, no dashes), checks the details and shelves it.
  await context.clearCookies();
  await signInAs(page.request, 'nusrat.jahan@northsouth.edu');
  await page.goto('/desk');
  await expect(page.getByRole('heading', { name: 'What do you need to do?' })).toBeVisible();
  await expectAccessible(page, 'desk home');
  await page.getByRole('link', { name: /Log a found item/ }).click();
  await page.getByLabel('Student brought a QR code?').fill(id.replaceAll('-', '').toLowerCase());
  await page.getByRole('button', { name: 'Open post' }).click();
  await expect(page.getByRole('heading', { name: 'Receive a student post' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Bottle' })).toBeChecked();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByLabel('Short name')).toHaveValue(name);
  await page.getByLabel('Condition').fill('Small dent on the lid');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('checkbox', { name: 'Stickers or engraving' })).toBeChecked();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('bin-code')).toHaveText(/^A-\d{2}$/);
  await page.getByRole('button', { name: 'Save and print label' }).click();

  await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible();
  await expect(page.getByText(`Saved as ${id}.`, { exact: false })).toBeVisible();
  await expectAccessible(page, 'label');
  const state = await query<{ state: string }>(
    `select f.state from found_items f join tenants t on t.id = f.tenant_id where t.slug = 'nsu' and f.id = $1`,
    [id],
  );
  expect(state).toEqual([{ state: 'IN_CUSTODY' }]);
});

test('the desk logs a walk-in item in four steps, finds it and corrects it with a reason', async ({
  page,
}) => {
  await resetServerClock(page.request);
  await signInAs(page.request, 'nusrat.jahan@northsouth.edu');
  const name = `E2E umbrella ${unique()}`;
  await page.goto('/desk/log?step=1');
  await expect(page.getByText('Step 1 of 4 ·')).toBeVisible();
  await expectAccessible(page, 'log step 1');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('alert')).toHaveText('Pick what it is.');
  await page.getByRole('radio', { name: 'Umbrella' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByText('Step 2 of 4 ·')).toBeVisible();
  await expect(page.getByRole('radio', { name: /Admin Building/ })).toBeChecked();
  await page.getByRole('radio', { name: /Plaza & Food Court/ }).click();
  await page.getByLabel('Found at').fill(dhakaInput(await serverNow(page.request), 1));
  await page.getByLabel('Short name').fill(name);
  await page.getByRole('radio', { name: 'Black', exact: true }).click();
  await expectAccessible(page, 'log step 2');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByText('Step 3 of 4 ·')).toBeVisible();
  await expectAccessible(page, 'log step 3');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByText('Step 4 of 4 ·')).toBeVisible();
  await expect(page.getByTestId('bin-code')).toHaveText(/^B-\d{2}$/);
  await expectAccessible(page, 'log step 4');
  await page.getByRole('button', { name: 'Save and print label' }).click();
  await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible();
  const saved = (await page.getByText(/^Saved as FND-/).textContent()) ?? '';
  const id = /FND-\d{4}-\d{4}[A-Z]/.exec(saved)?.[0] ?? '';
  expect(id).not.toBe('');

  await page.goto('/desk/find');
  await page.getByLabel('ID or words').fill(id.toLowerCase());
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expectAccessible(page, 'item record');
  await page.getByRole('button', { name: 'Correct' }).click();
  await page.getByLabel('Condition').fill('One spoke bent');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText('Say why you are changing it.')).toBeVisible();
  await page.getByLabel('Reason for the change').fill('Checked it again');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText(/Checked it again \(condition\)/)).toBeVisible();
});

test('the gallery shows items at the desk; visitors have no gallery', async ({ page, context }) => {
  await signInAs(page.request, 'rafiq.ahmed@northsouth.edu');
  await page.goto('/gallery');
  await expect(page.getByRole('heading', { name: 'Gallery' })).toBeVisible();
  await page.getByLabel('Search').fill('umbrella');
  await expect(page.getByText('Black umbrella').first()).toBeVisible();
  await expect(page.getByText('University ID card')).toHaveCount(0);
  await expectAccessible(page, 'gallery');
  await page.goto('/alerts');
  await expect(page.getByRole('heading', { name: 'Alerts' })).toBeVisible();
  await expectAccessible(page, 'alerts');

  await context.clearCookies();
  await signInAs(page.request, '8801700000001@visitors.lostfound.invalid');
  await page.goto('/home');
  await expect(page.getByRole('link', { name: 'Gallery' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /I found something/ })).toHaveCount(0);
  await page.goto('/gallery');
  await expect(page).toHaveURL(/\/home$/);
});
