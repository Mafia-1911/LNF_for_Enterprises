// Found items (WF-02, WF-03, FR-10, FR-13, NF-01, NF-02): student post, "Someone lost this?" panel,
// pings, desk intake and receive, ID card fast lane, gallery, desk search, corrections and VOID.
// Every response for tenant A is checked for tenant B data by the harness.
import type {
  AlertList,
  DeskFoundItem,
  DeskItemRow,
  DeskToday,
  FoundItemLabel,
  FoundPost,
  GalleryItem,
  LoggedFoundItem,
  LostReportCreated,
  SimilarLostReport,
} from '@lf/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../harness';
import { email, TEST_NOW } from '../fixtures';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

const hoursAgo = (h: number) =>
  new Date(new Date(TEST_NOW).getTime() - h * 3_600_000).toISOString();
const compact = (id: string) => id.replaceAll('-', '').toLowerCase();

function postBody(overrides: Record<string, unknown> = {}) {
  return {
    category: 'laptop',
    colour: 'grey',
    shortName: null,
    brand: 'Lenovo',
    model: 'ThinkPad E14',
    publicDescription: 'Grey laptop with a black charger.',
    place: { buildingCode: 'LIB', floorId: null, zoneId: null },
    foundAt: hoursAgo(1),
    privateTicks: ['stickers_engraving'],
    privateNote: 'Cat sticker under the lid, initials SR.',
    photoIds: [],
    pingReportIds: [],
    ...overrides,
  };
}

function logBody(overrides: Record<string, unknown> = {}) {
  return {
    category: 'umbrella',
    colour: 'black',
    shortName: 'Black umbrella',
    brand: null,
    model: null,
    publicDescription: null,
    place: { buildingCode: 'PLZ', floorId: null, zoneId: null },
    foundAt: hoursAgo(2),
    privateTicks: [],
    privateNote: null,
    photoIds: [],
    condition: 'One spoke bent.',
    conditionPhotoIds: [],
    binCode: 'B-01',
    idNumber: null,
    ...overrides,
  };
}

async function seededBagReportId(): Promise<string> {
  const { rows } = await ctx.owner.query<{ id: string }>(
    `select id from lost_reports where tenant_id = $1 and category = 'bag' order by created_at limit 1`,
    [ctx.tenantA],
  );
  return rows[0]?.id ?? '';
}

async function jobs(name: string): Promise<{ data: Record<string, string> }[]> {
  const { rows } = await ctx.owner.query<{ data: Record<string, string> }>(
    `select data from pgboss.job where name = $1`,
    [name],
  );
  return rows;
}

describe('POST /api/found-items (student post, WF-02)', () => {
  it('creates a REPORTED_BY_FINDER post with an FND ID, a QR and a 48-hour deadline', async () => {
    const finder = await ctx.as(email.student2);
    const res = await finder.post<FoundPost>('/api/found-items', postBody());
    expect(res.status).toBe(201);
    const post = res.body;
    expect(post.id).toMatch(/^FND-2611-\d{4}[A-Z]$/);
    expect(post.state).toBe('REPORTED_BY_FINDER');
    expect(post.title).toBe('Grey laptop');
    expect(post.handInDeadline).toBe('2026-11-10T10:39:00.000Z');
    expect(post.qrDataUri).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(post.desk.location).toBe('Admin Building, Ground floor, Security Room');
    // Private details are never returned, and stored encrypted.
    expect(res.text).not.toContain('Cat sticker');
    const stored = await ctx.owner.query<{ note_ciphertext: string; ticks: string[] }>(
      `select note_ciphertext, ticks from private_details where tenant_id = $1 and record_id = $2`,
      [ctx.tenantA, post.id],
    );
    expect(stored.rows[0]?.ticks).toEqual(['stickers_engraving']);
    expect(stored.rows[0]?.note_ciphertext).not.toContain('Cat sticker');
    const audit = await ctx.owner.query(
      `select event, to_state from audit_events where tenant_id = $1 and record_id = $2`,
      [ctx.tenantA, post.id],
    );
    expect(audit.rows).toEqual([{ event: 'POST', to_state: 'REPORTED_BY_FINDER' }]);
  });

  it('lists my posts and opens one by ID in any case, without dashes', async () => {
    const finder = await ctx.as(email.student2);
    const list = await finder.get<{ items: FoundPost[] }>('/api/found-items');
    expect(list.status).toBe(200);
    const first = list.body.items[0];
    expect(first?.state).toBe('REPORTED_BY_FINDER');
    const one = await finder.get<FoundPost>(`/api/found-items/${compact(first?.id ?? '')}`);
    expect(one.status).toBe(200);
    expect(one.body.id).toBe(first?.id);
    // Another student can't open it.
    const other = await ctx.as(email.student);
    expect((await other.get(`/api/found-items/${first?.id ?? ''}`)).status).toBe(404);
  });

  it('refuses restricted categories, bad ticks and times in the future', async () => {
    const finder = await ctx.as(email.student2);
    const weapon = await finder.post<{ error: { fields: Record<string, string> } }>(
      '/api/found-items',
      postBody({ category: 'weapon' }),
    );
    expect(weapon.status).toBe(400);
    expect(weapon.body.error.fields['category']).toBe('Pick what you found.');
    const ticks = await finder.post<{ error: { fields: Record<string, string> } }>(
      '/api/found-items',
      postBody({ privateTicks: ['amount_counted'] }),
    );
    expect(ticks.status).toBe(400);
    expect(ticks.body.error.fields['privateTicks']).toMatch(/don't fit this category/);
    const future = await finder.post<{ error: { fields: Record<string, string> } }>(
      '/api/found-items',
      postBody({ foundAt: '2026-11-09T10:39:00.000Z' }),
    );
    expect(future.status).toBe(400);
    expect(future.body.error.fields['foundAt']).toMatch(/in the future/);
  });

  it('is for students and desk staff only', async () => {
    expect((await (await ctx.as(email.visitor)).post('/api/found-items', postBody())).status).toBe(
      403,
    );
    expect((await (await ctx.as(email.itAdmin)).post('/api/found-items', postBody())).status).toBe(
      403,
    );
    expect((await ctx.anonymous().post('/api/found-items', postBody())).status).toBe(401);
  });
});

describe('"Someone lost this?" and pings (US-02, NF-01)', () => {
  it('shows similar open lost reports with reasons and no names or contacts', async () => {
    const finder = await ctx.as(email.student2);
    const res = await finder.post<{ reports: SimilarLostReport[] }>('/api/found-items/similar', {
      category: 'bag',
      colour: 'black',
      buildingCode: 'LIB',
      foundAt: TEST_NOW,
    });
    expect(res.status).toBe(200);
    expect(res.body.reports.length).toBeGreaterThan(0);
    const top = res.body.reports[0];
    expect(top?.id).toBe(await seededBagReportId());
    expect(top?.reasons).toEqual(expect.arrayContaining(['Same colour', 'Same building']));
    expect(res.text).not.toContain('Rafiq');
    expect(res.text).not.toContain('rafiq.ahmed');
  });

  it("doesn't show the finder their own lost reports", async () => {
    const owner = await ctx.as(email.student);
    const res = await owner.post<{ reports: SimilarLostReport[] }>('/api/found-items/similar', {
      category: 'bag',
      colour: 'black',
      buildingCode: 'LIB',
    });
    expect(res.body.reports.map((r) => r.id)).not.toContain(await seededBagReportId());
  });

  it('pings the owner anonymously and tells them when the item reaches the desk', async () => {
    const reportId = await seededBagReportId();
    const finder = await ctx.as(email.student2);
    const posted = await finder.post<FoundPost>(
      '/api/found-items',
      postBody({
        category: 'bag',
        colour: 'black',
        brand: null,
        model: null,
        shortName: 'Black backpack',
        privateTicks: ['contents_listed'],
        pingReportIds: [reportId],
      }),
    );
    expect(posted.status).toBe(201);
    expect(posted.body.pinged).toBe(1);

    const owner = await ctx.as(email.student);
    const alerts = await owner.get<AlertList>('/api/alerts');
    const ping = alerts.body.alerts.find((a) => a.kind === 'possible_match');
    expect(ping?.body).toContain(posted.body.id);
    expect(alerts.text).not.toContain('Sadia');
    expect(alerts.body.unread).toBeGreaterThan(0);
    const mail = await jobs('send-email');
    expect(
      mail.some((j) => j.data['to'] === email.student && j.data['text']?.includes(posted.body.id)),
    ).toBe(true);

    // The finder brings it in: the desk receives it and the owner is told it arrived.
    const desk = await ctx.as(email.desk);
    const received = await desk.post<LoggedFoundItem>(
      `/api/desk/found-items/${compact(posted.body.id)}/receive`,
      logBody({
        category: 'bag',
        colour: 'black',
        shortName: 'Black backpack',
        place: { buildingCode: 'LIB', floorId: null, zoneId: null },
        foundAt: hoursAgo(1),
        binCode: 'B-02',
        condition: null,
      }),
    );
    expect(received.status).toBe(200);
    expect(received.body.item.state).toBe('IN_CUSTODY');
    expect(received.body.item.binCode).toBe('B-02');
    expect(received.body.item.sourceLabel).toBe('Student post');
    expect(received.body.item.history.map((h) => h.event)).toEqual(['POST', 'RECEIVE_AT_DESK']);
    expect(received.body.label.qrDataUri).toMatch(/^data:image\/svg\+xml;base64,/);
    const after = await owner.get<AlertList>('/api/alerts');
    expect(after.body.alerts.some((a) => a.kind === 'item_arrived')).toBe(true);

    // Receiving twice is refused: the record has moved on.
    const again = await desk.post(
      `/api/desk/found-items/${posted.body.id}/receive`,
      logBody({ category: 'bag', binCode: 'B-02' }),
    );
    expect(again.status).toBe(409);
  });

  it('refuses pings to reports that are not open or not in the same category', async () => {
    const finder = await ctx.as(email.student2);
    const res = await finder.post<{ error: { fields: Record<string, string> } }>(
      '/api/found-items',
      postBody({ pingReportIds: [await seededBagReportId()] }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.fields['pingReportIds']).toMatch(/isn't open any more/);
  });
});

describe('desk intake (WF-03)', () => {
  it('logs a walk-in item straight into custody with a bin, a label and a retention date', async () => {
    const desk = await ctx.as(email.desk);
    const res = await desk.post<LoggedFoundItem>('/api/desk/found-items', logBody());
    expect(res.status).toBe(201);
    const { item, label } = res.body;
    expect(item.state).toBe('IN_CUSTODY');
    expect(item.binCode).toBe('B-01');
    expect(item.condition).toBe('One spoke bent.');
    expect(item.sourceLabel).toBe('Desk, by Nusrat Jahan');
    expect(item.retentionEndsAt).toBe('2027-01-07T10:39:00.000Z');
    expect(label).toMatchObject({ id: item.id, binCode: 'B-01', categoryLabel: 'Umbrella' });
    expect(label.url).toMatch(new RegExp(`/i/${item.id}$`));
  });

  it('suggests the least-full bin on the right shelf', async () => {
    const desk = await ctx.as(email.desk);
    const res = await desk.get<{ suggested: string; bins: { code: string; itemCount: number }[] }>(
      '/api/desk/bins?category=umbrella',
    );
    expect(res.status).toBe(200);
    expect(res.body.suggested).toMatch(/^B-\d{2}$/);
    expect(res.body.suggested).not.toBe('B-01');
    expect(res.body.bins.find((b) => b.code === 'B-01')?.itemCount).toBeGreaterThan(0);
  });

  it('never shelves restricted items and needs a real bin for everything else', async () => {
    const desk = await ctx.as(email.desk);
    const shelved = await desk.post<{ error: { fields: Record<string, string> } }>(
      '/api/desk/found-items',
      logBody({ category: 'weapon', shortName: 'Pocket knife', binCode: 'A-01' }),
    );
    expect(shelved.status).toBe(400);
    expect(shelved.body.error.fields['binCode']).toMatch(/never shelved/);
    const restricted = await desk.post<LoggedFoundItem>(
      '/api/desk/found-items',
      logBody({ category: 'weapon', shortName: 'Pocket knife', binCode: null }),
    );
    expect(restricted.status).toBe(201);
    expect(restricted.body.item.restricted).toBe(true);
    expect(restricted.body.item.binCode).toBeNull();
    const noBin = await desk.post<{ error: { fields: Record<string, string> } }>(
      '/api/desk/found-items',
      logBody({ binCode: null }),
    );
    expect(noBin.body.error.fields['binCode']).toBe('Pick the bin it goes in.');
    const unknown = await desk.post<{ error: { fields: Record<string, string> } }>(
      '/api/desk/found-items',
      logBody({ binCode: 'Z-99' }),
    );
    expect(unknown.body.error.fields['binCode']).toMatch(/isn't on the list/);
  });

  it('ID card fast lane: emails the owner at once, masks the number, never lists the card', async () => {
    const desk = await ctx.as(email.desk);
    const missing = await desk.post<{ error: { fields: Record<string, string> } }>(
      '/api/desk/found-items',
      logBody({ category: 'university_id', shortName: 'University ID card', binCode: 'S-01' }),
    );
    expect(missing.body.error.fields['idNumber']).toBe('Type the ID number printed on the card.');

    const res = await desk.post<LoggedFoundItem>(
      '/api/desk/found-items',
      logBody({
        category: 'university_id',
        shortName: 'University ID card',
        binCode: 'S-01',
        idNumber: '2112345042',
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.item.idNumberMasked).toBe('••••5042');
    expect(res.body.item.ownerEmailed).toBe(true);
    expect(res.text).not.toContain('2112345042');
    const stored = await ctx.owner.query<{ id_number_ciphertext: string }>(
      `select id_number_ciphertext from found_items where tenant_id = $1 and id = $2`,
      [ctx.tenantA, res.body.item.id],
    );
    expect(stored.rows[0]?.id_number_ciphertext).not.toContain('2112345042');

    const owner = await ctx.as(email.student);
    const alerts = await owner.get<AlertList>('/api/alerts');
    const card = alerts.body.alerts.find((a) => a.kind === 'id_card_found');
    expect(card?.body).toContain('ending 5042');
    expect(card?.body).not.toContain('2112345042');

    const gallery = await owner.get<{ items: GalleryItem[] }>(
      '/api/gallery?category=university_id',
    );
    expect(gallery.body.items).toEqual([]);
    const all = await owner.get<{ items: GalleryItem[] }>('/api/gallery');
    expect(all.body.items.map((i) => i.id)).not.toContain(res.body.item.id);
  });

  it('emails a card owner who has never used the portal, from the directory', async () => {
    const desk = await ctx.as(email.desk);
    const res = await desk.post<LoggedFoundItem>(
      '/api/desk/found-items',
      logBody({
        category: 'university_id',
        shortName: null,
        binCode: 'S-02',
        idNumber: '2010 987 001',
      }),
    );
    expect(res.body.item.ownerEmailed).toBe(true);
    const mail = await jobs('send-email');
    expect(mail.some((j) => j.data['to'] === 'sadia.rahman@northsouth.edu')).toBe(true);
  });

  it('is for desk officers and supervisors only', async () => {
    for (const who of [email.student, email.itAdmin, email.visitor]) {
      const c = await ctx.as(who);
      expect((await c.post('/api/desk/found-items', logBody())).status).toBe(403);
      expect((await c.get('/api/desk/today')).status).toBe(403);
      expect((await c.get('/api/desk/found-items')).status).toBe(403);
    }
    expect((await (await ctx.as(email.supervisor)).get('/api/desk/today')).status).toBe(200);
  });
});

describe('gallery (FR-10)', () => {
  it('lists items at the desk, not posts still with the finder, and hides sensitive photos', async () => {
    const desk = await ctx.as(email.desk);
    const card = await desk.post<LoggedFoundItem>(
      '/api/desk/found-items',
      logBody({
        category: 'bank_card',
        shortName: 'Bank debit card',
        binCode: 'S-03',
        idNumber: '4111 2222 3333 4821',
      }),
    );
    const student = await ctx.as(email.student);
    const res = await student.get<{ items: GalleryItem[] }>('/api/gallery');
    expect(res.status).toBe(200);
    const states = new Set(res.body.items.map((i) => i.state));
    expect(states.has('REPORTED_BY_FINDER')).toBe(false);
    const bank = res.body.items.find((i) => i.id === card.body.item.id);
    expect(bank).toMatchObject({ sensitive: true, photoId: null });
    expect(res.text).not.toContain('4821');
    expect(res.body.items.some((i) => i.category === 'weapon')).toBe(false);
  });

  it('filters by words, category and building', async () => {
    const student = await ctx.as(email.student);
    const words = await student.get<{ items: GalleryItem[] }>('/api/gallery?q=umbrella%20black');
    expect(words.body.items.length).toBeGreaterThan(0);
    expect(words.body.items.every((i) => i.category === 'umbrella')).toBe(true);
    const building = await student.get<{ items: GalleryItem[] }>('/api/gallery?building=LIB');
    expect(building.body.items.every((i) => i.place.buildingCode === 'LIB')).toBe(true);
    const none = await student.get<{ items: GalleryItem[] }>('/api/gallery?q=zebra');
    expect(none.body.items).toEqual([]);
  });

  it('is not for visitors (SRS: visitors cannot browse the gallery)', async () => {
    const res = await (
      await ctx.as(email.visitor)
    ).get<{ error: { message: string } }>('/api/gallery');
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/gallery is for students and staff/);
  });

  it('never shows the other university', async () => {
    const deskB = await ctx.as('nusrat.jahan@other.test', ctx.hosts.B);
    const b = await deskB.post<LoggedFoundItem>(
      '/api/desk/found-items',
      logBody({ shortName: 'OTHER-UNIVERSITY-ONLY umbrella' }),
    );
    expect(b.status).toBe(201);
    const student = await ctx.as(email.student);
    const res = await student.get<{ items: GalleryItem[] }>('/api/gallery?q=umbrella');
    expect(res.body.items.map((i) => i.id)).not.toContain(b.body.item.id);
    // Same ID sequence per tenant: tenant A's desk can't open B's record either.
    const desk = await ctx.as(email.desk);
    const look = await desk.get<DeskFoundItem>(`/api/desk/found-items/${b.body.item.id}`);
    expect(look.status === 404 || !look.text.includes('OTHER-UNIVERSITY-ONLY')).toBe(true);
  });
});

describe('desk views', () => {
  it('finds items by ID (any case, no dashes, or a label link) and by words', async () => {
    const desk = await ctx.as(email.desk);
    const logged = await desk.post<LoggedFoundItem>(
      '/api/desk/found-items',
      logBody({
        category: 'watch',
        shortName: 'Analog wristwatch, brown strap',
        binCode: 'S-04',
        colour: 'brown',
      }),
    );
    const id = logged.body.item.id;
    for (const q of [id, compact(id), `http://nsu.test/i/${id}`]) {
      const res = await desk.get<{ items: DeskItemRow[] }>(
        `/api/desk/found-items?q=${encodeURIComponent(q)}`,
      );
      expect(res.body.items.map((i) => i.id)).toEqual([id]);
    }
    const words = await desk.get<{ items: DeskItemRow[] }>(
      '/api/desk/found-items?q=wristwatch%20strap',
    );
    expect(words.body.items.map((i) => i.id)).toContain(id);
  });

  it('shows the full record with private details and history to staff', async () => {
    const desk = await ctx.as(email.desk);
    const logged = await desk.post<LoggedFoundItem>(
      '/api/desk/found-items',
      logBody({
        category: 'bag',
        shortName: 'Black backpack with yellow logo',
        binCode: 'B-03',
        privateTicks: ['contents_listed', 'name_tag'],
        privateNote: 'Calculus textbook, blue pencil case.',
      }),
    );
    const res = await desk.get<DeskFoundItem>(`/api/desk/found-items/${logged.body.item.id}`);
    expect(res.status).toBe(200);
    expect(res.body.privateDetails).toEqual({
      ticks: ['contents_listed', 'name_tag'],
      note: 'Calculus textbook, blue pencil case.',
    });
    expect(res.body.history).toEqual([
      expect.objectContaining({ event: 'LOG_INTAKE', toState: 'IN_CUSTODY', by: 'Nusrat Jahan' }),
    ]);
    const label = await desk.get<FoundItemLabel>(
      `/api/desk/found-items/${logged.body.item.id}/label`,
    );
    expect(label.body.binCode).toBe('B-03');
  });

  it('lists student posts to shelve on the Today screen', async () => {
    const desk = await ctx.as(email.desk);
    const today = await desk.get<DeskToday>('/api/desk/today');
    expect(today.status).toBe(200);
    expect(today.body.toShelve.length).toBeGreaterThan(0);
    expect(today.body.toShelve.every((r) => r.state === 'REPORTED_BY_FINDER')).toBe(true);
    expect(today.body.claimsToReview).toEqual([]);
  });

  it('corrects a record only with a reason, and keeps it in the history', async () => {
    const desk = await ctx.as(email.desk);
    const logged = await desk.post<LoggedFoundItem>(
      '/api/desk/found-items',
      logBody({ binCode: 'B-04' }),
    );
    const id = logged.body.item.id;
    const noReason = await desk.post(`/api/desk/found-items/${id}/correct`, {
      binCode: 'B-05',
      reason: '',
    });
    expect(noReason.status).toBe(400);
    const nothing = await desk.post(`/api/desk/found-items/${id}/correct`, {
      reason: 'Checked it',
    });
    expect(nothing.status).toBe(400);
    const ok = await desk.post<DeskFoundItem>(`/api/desk/found-items/${id}/correct`, {
      binCode: 'B-05',
      reason: 'Moved to a bigger bin',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.binCode).toBe('B-05');
    expect(ok.body.history.at(-1)).toMatchObject({
      event: 'CORRECT',
      note: 'Moved to a bigger bin (bin B-04 → B-05)',
    });
  });

  it('VOID: desk staff for a post not yet received, the supervisor for an item in custody', async () => {
    const finder = await ctx.as(email.student2);
    const post = await finder.post<FoundPost>('/api/found-items', postBody());
    const desk = await ctx.as(email.desk);
    const voided = await desk.post<DeskFoundItem>(`/api/desk/found-items/${post.body.id}/void`, {
      reason: 'Posted twice by mistake',
    });
    expect(voided.status).toBe(200);
    expect(voided.body.state).toBe('VOID');
    expect(voided.body.history.at(-1)).toMatchObject({
      event: 'VOID',
      note: 'Posted twice by mistake',
    });

    const logged = await desk.post<LoggedFoundItem>(
      '/api/desk/found-items',
      logBody({ binCode: 'B-06' }),
    );
    const byDesk = await desk.post(`/api/desk/found-items/${logged.body.item.id}/void`, {
      reason: 'Error',
    });
    expect(byDesk.status).toBe(403);
    const supervisor = await ctx.as(email.supervisor);
    const bySupervisor = await supervisor.post<DeskFoundItem>(
      `/api/desk/found-items/${logged.body.item.id}/void`,
      { reason: 'Logged in error' },
    );
    expect(bySupervisor.body.state).toBe('VOID');
  });
});

describe('lost report submit shows similar items in custody (CC-05)', () => {
  it('returns matching items already at the desk, with plain reasons', async () => {
    const student = await ctx.as(email.student2);
    const res = await student.post<LostReportCreated>('/api/lost-reports', {
      category: 'umbrella',
      colour: 'black',
      shortName: 'My umbrella',
      brand: null,
      publicDescription: null,
      privateNote: null,
      place: { buildingCode: 'PLZ', floorId: null, zoneId: null },
      timeFrom: hoursAgo(5),
      timeTo: hoursAgo(3),
    });
    expect(res.status).toBe(201);
    expect(res.body.similarInCustody.length).toBeGreaterThan(0);
    expect(res.body.similarInCustody[0]?.reasons).toEqual(
      expect.arrayContaining(['Same colour', 'Same building']),
    );
  });
});

describe('alerts', () => {
  it('marks alerts as read', async () => {
    const owner = await ctx.as(email.student);
    const before = await owner.get<AlertList>('/api/alerts');
    expect(before.body.unread).toBeGreaterThan(0);
    expect((await owner.post('/api/alerts/read', {})).status).toBe(200);
    const after = await owner.get<AlertList>('/api/alerts');
    expect(after.body.unread).toBe(0);
    expect(after.body.alerts.every((a) => a.readAt !== null)).toBe(true);
    expect((await ctx.anonymous().get('/api/alerts')).status).toBe(401);
  });
});
