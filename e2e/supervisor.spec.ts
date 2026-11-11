// Phase 4a smoke: the supervisor's overview, retention, policies (with a closure) and staff screens
// load, work, and pass axe at both viewports.
import { expect, test } from '@playwright/test';
import { expectAccessible, query, resetServerClock, signInAs } from './support';

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

test('a supervisor checks approvals, the dispatch directory, disputes and flags', async ({
  page,
}) => {
  await resetServerClock(page.request);
  await signInAs(page.request, 'farhana.islam@northsouth.edu');
  const nav = page.getByRole('navigation', { name: 'Supervisor' });

  await page.goto('/supervisor/approvals');
  await expect(page.getByRole('heading', { name: 'High-value approvals' })).toBeVisible();
  await expectAccessible(page, 'approvals');

  await nav.getByRole('link', { name: 'Dispatch directory' }).click();
  await expect(page.getByRole('heading', { name: 'Dispatch directory' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'CSV' })).toHaveAttribute(
    'href',
    /\/api\/supervisor\/exports\/dispatches\.csv/,
  );
  await expectAccessible(page, 'dispatch directory');
  const [dsp] = await query<{ id: string }>(
    `select d.id from dispatches d join tenants t on t.id = d.tenant_id where t.slug = 'nsu' order by d.created_at desc limit 1`,
  );
  if (dsp) {
    await page.getByLabel('Search').fill(dsp.id);
    await page.getByRole('link', { name: `Open ${dsp.id}` }).click();
    await expect(page.getByRole('heading', { name: dsp.id })).toBeVisible();
    await page.getByLabel('Add a correction').fill('E2E: the ID checked was the NID card.');
    await page.getByRole('button', { name: 'Add amendment' }).click();
    await expect(page.getByText('E2E: the ID checked was the NID card.').first()).toBeVisible();
    await expectAccessible(page, 'handover record');
  }

  await nav.getByRole('link', { name: /Disputes/ }).click();
  await expect(page.getByRole('heading', { name: 'Disputes' })).toBeVisible();
  await expectAccessible(page, 'disputes');

  await nav.getByRole('link', { name: /Flags/ }).click();
  await expect(page.getByRole('heading', { name: 'Flagged accounts' })).toBeVisible();
  await expectAccessible(page, 'flags');
});

test('a supervisor reads loss hotspots and imports paper register rows', async ({ page }) => {
  await resetServerClock(page.request);
  await signInAs(page.request, 'farhana.islam@northsouth.edu');
  await page.goto('/supervisor/reports');
  await expect(page.getByRole('heading', { name: 'Loss hotspots' })).toBeVisible();
  await expect(page.getByText('Records in range')).toBeVisible();
  await page.getByRole('button', { name: '90 days' }).click();
  await expectAccessible(page, 'loss hotspots');

  await page.goto('/supervisor/register');
  await expect(page.getByRole('heading', { name: 'Paper register import' })).toBeVisible();
  await page.getByRole('tab', { name: 'Fast table entry' }).click();
  await page.getByLabel('Row 1 date').fill('2026-10-05');
  await page.getByLabel('Row 1 item').fill(`E2E logbook bottle ${unique()}`);
  await page.getByLabel('Row 1 category').selectOption('bottle');
  await page.getByLabel('Row 1 colour').selectOption('blue');
  await expect(page.getByText('1 ready')).toBeVisible();
  await expectAccessible(page, 'paper register');
  await page.getByRole('button', { name: 'Import 1 item' }).click();
  await expect(page.getByText(/Imported 1 items into custody/).first()).toBeVisible();
});

test('the desk reserves outage labels and starts entering one', async ({ page }) => {
  await resetServerClock(page.request);
  await signInAs(page.request, 'nusrat.jahan@northsouth.edu');
  await page.goto('/desk/more');
  await page.getByRole('link', { name: /Outage label sheets/ }).click();
  await expect(page.getByRole('heading', { name: 'Outage label sheets' })).toBeVisible();
  await page.getByRole('button', { name: 'Reserve IDs' }).click();
  await expect(page.getByRole('link', { name: 'Enter now' }).first()).toBeVisible();
  await expectAccessible(page, 'outage sheet');
  await page.getByRole('link', { name: 'Enter now' }).first().click();
  await expect(page.getByText(/Paper label FND-/)).toBeVisible();
  await expect(page.getByLabel('When was it tagged?')).toBeVisible();
  await expectAccessible(page, 'enter a paper-tagged item');
});

test('the desk starts a lost report for a walk-in student', async ({ page }) => {
  await resetServerClock(page.request);
  await signInAs(page.request, 'nusrat.jahan@northsouth.edu');
  await page.goto('/desk/more');
  await page.getByRole('link', { name: /Help a walk-in student/ }).click();
  await expectAccessible(page, 'walk-in');
  await page
    .getByLabel("Student's university email", { exact: true })
    .fill('rafiq.ahmed@northsouth.edu');
  await page.getByRole('button', { name: 'Start the report' }).click();
  await expect(page.getByText('Filing for a walk-in student')).toBeVisible();
  await expect(page.getByText('rafiq.ahmed@northsouth.edu', { exact: false })).toBeVisible();
  await expectAccessible(page, 'lost report for a walk-in student');
});

test('the desk looks up an item for a walk-in student’s claim', async ({ page }) => {
  await resetServerClock(page.request);
  await signInAs(page.request, 'nusrat.jahan@northsouth.edu');
  const [item] = await query<{ id: string }>(
    `select f.id from found_items f join tenants t on t.id = f.tenant_id
     where t.slug = 'nsu' and f.state = 'IN_CUSTODY' and f.category <> 'university_id'
     order by f.created_at limit 1`,
  );
  test.skip(!item, 'no item in custody to claim');
  await page.goto('/desk/walk-in');
  await page.getByLabel('FND ID on the label').fill(item?.id ?? '');
  await page.getByLabel("Claiming student's university email").fill('rafiq.ahmed@northsouth.edu');
  await page.getByRole('button', { name: 'Find the item' }).click();
  await expect(page.getByText(`(${item?.id ?? ''}) for`)).toBeVisible();
  await expectAccessible(page, 'walk-in claim');
});
