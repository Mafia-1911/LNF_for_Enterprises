// Phase 3 end to end: a student claims an item from the gallery, the desk reviews it side by side
// and approves it, the student sees the pickup code, and the desk hands it back with a signature
// (DSP record). Also the lost-report page with "I found it myself". axe on every screen.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { APP, expectAccessible, query, resetServerClock, serverNow, signInAs } from './support';

const unique = () => Math.random().toString(36).slice(2, 7).toUpperCase();
const json = { origin: APP };

async function logItem(request: APIRequestContext, shortName: string): Promise<string> {
  const now = await serverNow(request);
  const res = await request.post(`${APP}/api/desk/found-items`, {
    headers: json,
    data: {
      category: 'bag',
      colour: 'green',
      shortName,
      brand: null,
      model: null,
      publicDescription: null,
      place: { buildingCode: 'LIB', floorId: null, zoneId: null },
      foundAt: new Date(now.getTime() - 3_600_000).toISOString(),
      privateTicks: ['contents_listed', 'name_tag'],
      privateNote: 'A blue notebook inside.',
      photoIds: [],
      condition: null,
      conditionPhotoIds: [],
      binCode: 'B-12',
      idNumber: null,
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { item: { id: string } }).item.id;
}

async function sign(page: Page) {
  const pad = page.getByRole('img', { name: /Signature area/ });
  const box = await pad.boundingBox();
  if (!box) throw new Error('No signature pad');
  await page.mouse.move(box.x + 40, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 60, { steps: 5 });
  await page.mouse.move(box.x + 220, box.y + 120, { steps: 5 });
  await page.mouse.up();
}

test('a student claims an item, the desk approves it and hands it back', async ({
  page,
  context,
}) => {
  await resetServerClock(page.request);
  const name = `E2E green bag ${unique()}`;
  await signInAs(page.request, 'nusrat.jahan@northsouth.edu');
  const itemId = await logItem(page.request, name);

  // The student finds it in the gallery and claims it.
  await context.clearCookies();
  await signInAs(page.request, 'rafiq.ahmed@northsouth.edu');
  await page.goto('/gallery');
  await page.getByLabel('Search').fill(name);
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { name: 'Is this yours?' })).toBeVisible();
  await expect(page.getByText('A blue notebook inside.')).toHaveCount(0);
  await expectAccessible(page, 'item and claim form');
  await page.getByLabel('What was inside?').fill('A blue notebook');
  await page.getByLabel('Describe the keychain or name tag.').fill('A small brass keychain');
  await page.getByLabel(/not in the public description/).fill('A torn strap on the left');
  await page.getByRole('button', { name: 'This is mine' }).click();
  await expect(page).toHaveURL(/\/claims\/CLM-\d{4}-\d{4}[A-Z]$/);
  await expect(page.getByText('In review')).toBeVisible();
  await expectAccessible(page, 'claim in review');
  const claimId = /CLM-\d{4}-\d{4}[A-Z]/.exec(page.url())?.[0] ?? '';

  // The desk reviews it next to what was recorded at intake.
  await context.clearCookies();
  await signInAs(page.request, 'nusrat.jahan@northsouth.edu');
  await page.goto('/desk/claims');
  await expectAccessible(page, 'check claims');
  await page.getByRole('link', { name }).click();
  await expect(page.getByText('“A blue notebook inside.”')).toBeVisible();
  await expectAccessible(page, 'claim review');
  for (const group of await page.getByRole('group', { name: /Verdict for/ }).all())
    await group.getByRole('button', { name: 'Pass' }).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('No claims are waiting on this item.')).toBeVisible();

  // The student sees the pickup code.
  await context.clearCookies();
  await signInAs(page.request, 'rafiq.ahmed@northsouth.edu');
  await page.goto(`/claims/${claimId}`);
  const code = ((await page.getByTestId('pickup-code').textContent()) ?? '').trim();
  expect(code).toMatch(/^\d{6}$/);
  await expectAccessible(page, 'pickup code');

  // The desk hands it back.
  await context.clearCookies();
  await signInAs(page.request, 'nusrat.jahan@northsouth.edu');
  await page.goto('/desk');
  await page.getByRole('link', { name: /Hand an item back/ }).click();
  await page.getByLabel('What is their 6-digit pickup code?').fill('000001');
  await page.getByRole('button', { name: 'Find claim' }).click();
  await expect(page.getByText('No claim uses that code.', { exact: false })).toBeVisible();
  await expectAccessible(page, 'handover step 1');
  await page.getByLabel('What is their 6-digit pickup code?').fill(code);
  await page.getByRole('button', { name: 'Find claim' }).click();
  await expect(page.getByText('Fetch from bin')).toBeVisible();
  await expect(page.getByText('Rafiq Ahmed').first()).toBeVisible();
  await expectAccessible(page, 'handover step 2');
  await page.getByRole('checkbox', { name: /matches the photo/ }).click();
  await page.getByLabel(/Last 4 characters/).fill('5042');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Ask the claimant to sign' })).toBeVisible();
  await expectAccessible(page, 'handover step 3');
  await sign(page);
  await page.getByRole('button', { name: 'Finish handover' }).click();
  await expect(page.getByRole('heading', { name: 'Handed over' })).toBeVisible();
  const dsp = ((await page.getByTestId('dsp-id').textContent()) ?? '').trim();
  expect(dsp).toMatch(/^DSP-\d{4}-\d{4}[A-Z]$/);
  await expectAccessible(page, 'handed over');

  const rows = await query<{ state: string }>(
    `select f.state from found_items f join tenants t on t.id = f.tenant_id where t.slug = 'nsu' and f.id = $1`,
    [itemId],
  );
  expect(rows).toEqual([{ state: 'DISPATCHED' }]);
});

test('the owner sees their report, renews it and closes it with "I found it myself"', async ({
  page,
}) => {
  await resetServerClock(page.request);
  await signInAs(page.request, 'rafiq.ahmed@northsouth.edu');
  const now = await serverNow(page.request);
  const res = await page.request.post(`${APP}/api/lost-reports`, {
    headers: json,
    data: {
      // Nothing in custody is purple jewellery, so no match job changes the report mid-test.
      category: 'jewellery',
      colour: 'purple',
      shortName: `E2E ring ${unique()}`,
      brand: null,
      publicDescription: null,
      privateNote: null,
      place: { buildingCode: 'AUD', floorId: null, zoneId: null },
      timeFrom: new Date(now.getTime() - 5 * 3_600_000).toISOString(),
      timeTo: new Date(now.getTime() - 3_600_000).toISOString(),
    },
  });
  expect(res.status()).toBe(201);
  const id = ((await res.json()) as { report: { id: string } }).report.id;
  await page.goto(`/lost/${id}`);
  await expect(page.getByRole('list', { name: 'Report status' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Likely matches in custody' })).toBeVisible();
  await expectAccessible(page, 'lost report');
  await page.getByRole('button', { name: 'Renew 30 days' }).click();
  await expect(page.getByText('Renewed 1 of 2 times.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'I found it myself' }).click();
  await expect(page.getByRole('dialog', { name: 'Close this report?' })).toBeVisible();
  await expectAccessible(page, 'close report dialog');
  await page.getByRole('button', { name: 'Yes, I found it' }).click();
  await expect(page).toHaveURL(/\/activity$/);
});
