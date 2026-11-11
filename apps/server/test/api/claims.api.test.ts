// Phase 3: matching alerts (US-04), claims (WF-04, FR-11, FR-12, NF-03, CC-01, CC-15, CC-16) and the
// handover with its DSP record (WF-04 steps 5–7, US-11). Every tenant-A response is leak-checked.
import type {
  AlertList,
  Claim,
  ClaimStart,
  DeskClaimQueue,
  DeskItemClaims,
  DeskToday,
  Dispatch,
  LikelyMatch,
  LoggedFoundItem,
  LostReport,
  LostReportCreated,
  Pickup,
  UploadedPhoto,
} from '@lf/contracts';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { matchFoundItem, matchLostReport } from '../../src/modules/matching';
import { createTestContext, type TestContext } from '../harness';
import { email, TEST_NOW } from '../fixtures';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

// One session per person: signing in on every call would trip the sign-in rate limit.
const sessions = new Map<string, Awaited<ReturnType<TestContext['as']>>>();
async function as(who: string) {
  const known = sessions.get(who);
  if (known) return known;
  const fresh = await ctx.as(who);
  sessions.set(who, fresh);
  return fresh;
}

const hoursAgo = (h: number) =>
  new Date(new Date(TEST_NOW).getTime() - h * 3_600_000).toISOString();
const matchingDeps = () => ({ boss: ctx.services.boss, appOrigin: ctx.services.config.appOrigin });
const system = (job: string) => ({
  tenantId: ctx.tenantA,
  actor: { kind: 'system' as const, job },
  requestId: 'test',
  clock: ctx.clock,
  db: ctx.services.db,
});

type Overrides = Record<string, unknown>;
async function logItem(overrides: Overrides = {}): Promise<string> {
  const desk = await as(email.desk);
  const res = await desk.post<LoggedFoundItem>('/api/desk/found-items', {
    category: 'bag',
    colour: 'black',
    shortName: 'Black backpack',
    brand: 'Herschel',
    model: null,
    publicDescription: null,
    place: { buildingCode: 'LIB', floorId: null, zoneId: null },
    foundAt: hoursAgo(1),
    privateTicks: ['contents_listed', 'name_tag'],
    privateNote: 'Calculus textbook and a blue pencil case.',
    photoIds: [],
    condition: null,
    conditionPhotoIds: [],
    binCode: 'B-01',
    idNumber: null,
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.item.id;
}

async function newReport(who: string, overrides: Overrides = {}): Promise<string> {
  const c = await as(who);
  const res = await c.post<LostReportCreated>('/api/lost-reports', {
    category: 'bag',
    colour: 'black',
    shortName: 'My black backpack',
    brand: 'Herschel',
    publicDescription: null,
    privateNote: null,
    place: { buildingCode: 'LIB', floorId: null, zoneId: null },
    timeFrom: hoursAgo(5),
    timeTo: hoursAgo(3),
    ...overrides,
  });
  expect(res.status).toBe(201);
  return res.body.report.id;
}

async function claim(who: string, itemId: string, extra: Overrides = {}) {
  const c = await as(who);
  const start = await c.get<ClaimStart>(`/api/found-items/${itemId}/claim`);
  const answers = (start.body.questions ?? []).map((q) => ({
    key: q.key,
    answer: `Answer to ${q.key}`,
  }));
  return c.post<Claim>(`/api/found-items/${itemId}/claims`, { answers, ...extra });
}

async function withdraw(who: string, claimId: string) {
  const res = await (await as(who)).post<Claim>(`/api/claims/${claimId}/withdraw`, {});
  expect(res.body.state).toBe('WITHDRAWN');
}

async function review(
  claimId: string,
  decision: 'approve' | 'reject' | 'more',
  verdict: 'pass' | 'fail',
  note: string | null = null,
) {
  const desk = await as(email.desk);
  const claimRow = await ctx.owner.query<{ found_item_id: string }>(
    'select found_item_id from claims where tenant_id = $1 and id = $2',
    [ctx.tenantA, claimId],
  );
  const side = await desk.get<DeskItemClaims>(
    `/api/desk/found-items/${claimRow.rows[0]?.found_item_id ?? ''}/claims`,
  );
  const answers = side.body.claims.find((c) => c.id === claimId)?.answers ?? [];
  return desk.post<DeskItemClaims>(`/api/desk/claims/${claimId}/review`, {
    verdicts: Object.fromEntries(answers.map((a) => [a.key, verdict])),
    decision,
    note,
  });
}

async function state(table: string, id: string): Promise<string> {
  const { rows } = await ctx.owner.query<{ state: string }>(
    `select state from ${table} where tenant_id = $1 and id = $2`,
    [ctx.tenantA, id],
  );
  return rows[0]?.state ?? '';
}

/** A signature as the person at the desk captures it (photos belong to whoever uploads them). */
async function signature(who: string = email.desk): Promise<string> {
  const desk = await as(who);
  const png = await sharp({
    create: { width: 600, height: 200, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append('file', new File([png], 'signature.png', { type: 'image/png' }));
  const res = await desk.request<{ photo: UploadedPhoto }>('POST', '/api/photos', form);
  expect(res.status).toBe(201);
  return res.body.photo.id;
}

describe('matching alerts (FR-07, US-04)', () => {
  it('alerts the owner once when a matching item reaches the desk, and lists it on the report', async () => {
    const reportId = await newReport(email.student2);
    const itemId = await logItem();
    // The seeded bag report matches too, so two owners may be alerted; never twice for one pair.
    const first = await matchFoundItem(matchingDeps(), system('match-found-item'), itemId);
    expect(first.alerted).toBeGreaterThanOrEqual(1);
    expect(await matchFoundItem(matchingDeps(), system('match-found-item'), itemId)).toMatchObject({
      alerted: 0,
    });
    expect(await state('lost_reports', reportId)).toBe('POSSIBLE_MATCH');

    const owner = await as(email.student2);
    const alerts = await owner.get<AlertList>('/api/alerts');
    expect(
      alerts.body.alerts.filter(
        (a) => a.kind === 'possible_match' && a.link === `/lost/${reportId}`,
      ),
    ).toHaveLength(1);
    const matches = await owner.get<{ matches: LikelyMatch[] }>(
      `/api/lost-reports/${reportId}/matches`,
    );
    expect(matches.status).toBe(200);
    expect(matches.body.matches.map((m) => m.id)).toContain(itemId);
    expect(matches.body.matches[0]?.reasons).toEqual(
      expect.arrayContaining(['Same colour', 'Same building']),
    );
    expect(
      (await (await as(email.student)).get(`/api/lost-reports/${reportId}/matches`)).status,
    ).toBe(404);
  });

  it('matches a new report against items already in custody', async () => {
    const itemId = await logItem({
      category: 'umbrella',
      colour: 'red',
      shortName: 'Red umbrella',
      brand: null,
      binCode: 'B-02',
      privateTicks: [],
    });
    const reportId = await newReport(email.student, {
      category: 'umbrella',
      colour: 'red',
      shortName: 'Red umbrella',
      brand: null,
    });
    expect(
      await matchLostReport(matchingDeps(), system('match-lost-report'), reportId),
    ).toMatchObject({ alerted: 1 });
    const matches = await (
      await as(email.student)
    ).get<{ matches: LikelyMatch[] }>(`/api/lost-reports/${reportId}/matches`);
    expect(matches.body.matches.map((m) => m.id)).toContain(itemId);
  });
});

describe('claims (WF-04, FR-11, NF-03)', () => {
  it('asks questions built from the private details, never showing the details themselves', async () => {
    const itemId = await logItem({ binCode: 'B-03' });
    const res = await (await as(email.student)).get<ClaimStart>(`/api/found-items/${itemId}/claim`);
    expect(res.status).toBe(200);
    expect(res.body.questions.map((q) => q.question)).toEqual([
      'What was inside?',
      'Describe the keychain or name tag.',
      'Describe something about it that is not in the public description.',
    ]);
    expect(res.text).not.toContain('Calculus');
    expect(res.body.blockedReason).toBeNull();
  });

  it('submits a claim: answers encrypted, item CLAIM_PENDING, linked report CLAIMED', async () => {
    const itemId = await logItem({ binCode: 'B-04' });
    const reportId = await newReport(email.student);
    const res = await claim(email.student, itemId, { lostReportId: reportId });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^CLM-2611-\d{4}[A-Z]$/);
    expect(res.body.state).toBe('SUBMITTED');
    expect(res.body.pickupCode).toBeNull();
    expect(await state('found_items', itemId)).toBe('CLAIM_PENDING');
    expect(await state('lost_reports', reportId)).toBe('CLAIMED');
    const stored = await ctx.owner.query<{ answers_ciphertext: string }>(
      'select answers_ciphertext from claims where tenant_id = $1 and id = $2',
      [ctx.tenantA, res.body.id],
    );
    expect(stored.rows[0]?.answers_ciphertext).not.toContain('Answer to');
    const audit = await ctx.owner.query<{ event: string; actor_kind: string }>(
      `select event, actor_kind from audit_events where tenant_id = $1 and record_id = $2 order by id`,
      [ctx.tenantA, itemId],
    );
    expect(audit.rows.map((r) => r.event)).toEqual(['LOG_INTAKE', 'CLAIM_SUBMITTED']);
    expect(audit.rows[1]?.actor_kind).toBe('system:claims');
    await withdraw(email.student, res.body.id);
  });

  it('refuses a second claim on the same item, missing answers, and claims on items not at the desk', async () => {
    const itemId = await logItem({ binCode: 'B-05' });
    const first = await claim(email.student, itemId);
    expect(first.status).toBe(201);
    const again = await claim(email.student, itemId);
    expect(again.status).toBe(409);
    const c = await as(email.student2);
    const missing = await c.post<{ error: { fields: Record<string, string> } }>(
      `/api/found-items/${itemId}/claims`,
      {
        answers: [{ key: 'contents_listed', answer: 'Books' }],
      },
    );
    expect(missing.status).toBe(400);
    const card = await logItem({
      category: 'university_id',
      shortName: 'ID card',
      binCode: 'S-01',
      idNumber: '9999 0000',
      privateTicks: [],
    });
    expect((await c.get(`/api/found-items/${card}/claim`)).status).toBe(404);
    await withdraw(email.student, first.body.id);
  });

  it('allows at most 3 open claims per person (FR-11)', async () => {
    const items = [];
    for (const bin of ['A-01', 'A-02', 'A-03', 'A-04'])
      items.push(
        await logItem({
          category: 'bottle',
          shortName: `Bottle ${bin}`,
          binCode: bin,
          privateTicks: [],
        }),
      );
    const who = email.visitor;
    const made: string[] = [];
    for (const id of items.slice(0, 3)) {
      const res = await claim(who, id);
      expect(res.status).toBe(201);
      made.push(res.body.id);
    }
    const fourth = await claim(who, items[3] ?? '');
    expect(fourth.status).toBe(409);
    expect((fourth.body as unknown as { error: { message: string } }).error.message).toMatch(
      /3 open claims/,
    );
    for (const id of made) await withdraw(who, id);
  });

  it('is for owners only', async () => {
    const itemId = await logItem({ binCode: 'B-06' });
    expect((await (await as(email.desk)).get(`/api/found-items/${itemId}/claim`)).status).toBe(403);
    expect((await ctx.anonymous().get('/api/claims')).status).toBe(401);
    expect((await (await as(email.itAdmin)).get('/api/claims')).status).toBe(403);
  });
});

describe('desk review (FR-12, CC-01)', () => {
  it('shows every claim side by side; approving gives a pickup code and closes the other claims', async () => {
    const itemId = await logItem({ binCode: 'B-07' });
    const first = await claim(email.student, itemId);
    const second = await claim(email.student2, itemId);
    const desk = await as(email.desk);

    const queue = await desk.get<DeskClaimQueue>('/api/desk/claims');
    expect(queue.body.items.find((i) => i.item.id === itemId)?.claims).toBe(2);
    const side = await desk.get<DeskItemClaims>(`/api/desk/found-items/${itemId}/claims`);
    expect(side.body.recorded.note).toBe('Calculus textbook and a blue pencil case.');
    expect(side.body.recorded.ticks.map((t) => t.label)).toEqual([
      'Contents listed',
      'Keychain or name tag',
    ]);
    expect(side.body.claims.map((c) => c.claimant.name)).toEqual(['Rafiq Ahmed', 'Sadia Rahman']);
    expect(side.body.claims[0]?.answers[0]?.answer).toBe('Answer to contents_listed');
    expect(
      (await (await as(email.student)).get(`/api/desk/found-items/${itemId}/claims`)).status,
    ).toBe(403);

    const failing = await review(first.body.id, 'approve', 'fail');
    expect(failing.status).toBe(400);
    const approved = await review(first.body.id, 'approve', 'pass');
    expect(approved.status).toBe(200);
    expect(await state('found_items', itemId)).toBe('READY_FOR_PICKUP');

    const mine = await (await as(email.student)).get<Claim>(`/api/claims/${first.body.id}`);
    expect(mine.body.state).toBe('APPROVED');
    expect(mine.body.pickupCode).toMatch(/^\d{6}$/);
    expect(mine.body.pickupEndsAt).not.toBeNull();
    const other = await (await as(email.student2)).get<Claim>(`/api/claims/${second.body.id}`);
    expect(other.body.state).toBe('CANCELLED');
    expect(other.body.pickupCode).toBeNull();
    const alerts = await (await as(email.student2)).get<AlertList>('/api/alerts');
    expect(alerts.body.alerts.some((a) => a.title === 'Your claim was closed')).toBe(true);

    const today = await desk.get<DeskToday>('/api/desk/today');
    expect(today.body.pickupsDue.map((r) => r.id)).toContain(itemId);
    // The code is never in an email.
    const mail = await ctx.owner.query<{ data: { text: string } }>(
      `select data from pgboss.job where name = 'send-email'`,
    );
    expect(mail.rows.some((j) => j.data.text.includes(mine.body.pickupCode ?? 'none'))).toBe(false);
  });

  it('rejecting the only claim puts the item back on the shelf and the report back to possible match', async () => {
    const itemId = await logItem({ binCode: 'B-08' });
    const reportId = await newReport(email.visitor);
    const c = await claim(email.visitor, itemId, { lostReportId: reportId });
    const res = await review(c.body.id, 'reject', 'fail', 'The contents did not match.');
    expect(res.status).toBe(200);
    expect(await state('claims', c.body.id)).toBe('REJECTED');
    expect(await state('found_items', itemId)).toBe('IN_CUSTODY');
    expect(await state('lost_reports', reportId)).toBe('POSSIBLE_MATCH');
  });

  it('asks for more, and the answer sends the claim back to review', async () => {
    const itemId = await logItem({ binCode: 'B-09' });
    const c = await claim(email.student, itemId);
    const noNote = await review(c.body.id, 'more', 'pass');
    expect(noNote.status).toBe(400);
    expect(
      (await review(c.body.id, 'more', 'pass', 'What colour is the pencil case?')).status,
    ).toBe(200);
    const student = await as(email.student);
    const waiting = await student.get<Claim>(`/api/claims/${c.body.id}`);
    expect(waiting.body.state).toBe('MORE_INFO_REQUESTED');
    expect(waiting.body.moreInfoRequest).toBe('What colour is the pencil case?');
    const answered = await student.post<Claim>(`/api/claims/${c.body.id}/more`, { answer: 'Blue' });
    expect(answered.body.state).toBe('SUBMITTED');
    expect(answered.body.answers.at(-1)).toEqual({
      key: 'more_4',
      question: 'What colour is the pencil case?',
      answer: 'Blue',
    });
    await withdraw(email.student, c.body.id);
  });

  it('pauses claim rights after three failed verifications in 7 days (CC-15)', async () => {
    for (const bin of ['C-01', 'C-02', 'C-03']) {
      const itemId = await logItem({
        category: 'clothing',
        shortName: `Hoodie ${bin}`,
        binCode: bin,
        privateTicks: [],
      });
      const c = await claim(email.student2, itemId);
      expect((await review(c.body.id, 'reject', 'fail')).status).toBe(200);
    }
    const next = await logItem({
      category: 'clothing',
      shortName: 'Hoodie C-04',
      binCode: 'C-04',
      privateTicks: [],
    });
    const start = await (
      await as(email.student2)
    ).get<ClaimStart>(`/api/found-items/${next}/claim`);
    expect(start.body.blockedReason).toMatch(/paused until/);
    expect((await claim(email.student2, next)).status).toBe(409);
  });

  it('lets the claimant withdraw, freeing the item', async () => {
    const itemId = await logItem({ binCode: 'B-10' });
    const c = await claim(email.student, itemId);
    const res = await (
      await as(email.student)
    ).post<Claim>(`/api/claims/${c.body.id}/withdraw`, {});
    expect(res.body.state).toBe('WITHDRAWN');
    expect(await state('found_items', itemId)).toBe('IN_CUSTODY');
  });
});

describe('handover (WF-04 steps 5–7)', () => {
  async function approvedClaim(who: string, overrides: Overrides) {
    const itemId = await logItem(overrides);
    const c = await claim(who, itemId);
    expect((await review(c.body.id, 'approve', 'pass')).status).toBe(200);
    const code =
      (await (await as(who)).get<Claim>(`/api/claims/${c.body.id}`)).body.pickupCode ?? '';
    return { itemId, claimId: c.body.id, code };
  }

  it('finds the claim by code, checks identity and signature, and writes the DSP record', async () => {
    const { itemId, claimId, code } = await approvedClaim(email.student, { binCode: 'B-11' });
    const desk = await as(email.desk);
    const wrong = await desk.post<{ error: { message: string } }>('/api/desk/pickups/lookup', {
      code: '000000' === code ? '111111' : '000000',
    });
    expect(wrong.status).toBe(404);
    expect(wrong.body.error.message).toBe(
      'No claim uses that code. Check the digits with the person, or search under Find an item.',
    );
    const found = await desk.post<Pickup>('/api/desk/pickups/lookup', { code });
    expect(found.body).toMatchObject({
      claimId,
      item: { id: itemId, binCode: 'B-11' },
      claimant: { name: 'Rafiq Ahmed' },
      highValue: false,
    });

    const unsigned = await desk.post(`/api/desk/pickups/${claimId}/hand-over`, {
      photoMatches: true,
      idLast4: '5042',
    });
    expect(unsigned.status).toBe(400);
    const done = await desk.post<Dispatch>(`/api/desk/pickups/${claimId}/hand-over`, {
      photoMatches: true,
      idLast4: '5042',
      secondCheck: null,
      signaturePhotoId: await signature(),
    });
    expect(done.status).toBe(201);
    expect(done.body.id).toMatch(/^DSP-2611-\d{4}[A-Z]$/);
    expect(done.body).toMatchObject({
      recipientName: 'Rafiq Ahmed',
      idLast4: '5042',
      officerName: 'Nusrat Jahan',
    });
    expect(await state('found_items', itemId)).toBe('DISPATCHED');
    expect(await state('claims', claimId)).toBe('COLLECTED');
    expect((await desk.get<Dispatch>(`/api/desk/dispatches/${done.body.id}`)).body.claimId).toBe(
      claimId,
    );
    const again = await desk.post(`/api/desk/pickups/${claimId}/hand-over`, {
      photoMatches: true,
      idLast4: '5042',
      signaturePhotoId: await signature(),
    });
    expect(again.status).toBe(409);
  });

  it('needs a second check for high-value items, and a supervisor for visitors (CC-08, CC-10)', async () => {
    const phone = await approvedClaim(email.student, {
      category: 'phone',
      shortName: 'Black phone',
      binCode: 'S-02',
      privateTicks: ['lock_screen'],
    });
    const desk = await as(email.desk);
    const base = { photoMatches: true, idLast4: '5042' };
    const noCheck = await desk.post<{ error: { fields: Record<string, string> } }>(
      `/api/desk/pickups/${phone.claimId}/hand-over`,
      {
        ...base,
        signaturePhotoId: await signature(),
      },
    );
    expect(noCheck.body.error.fields['secondCheck']).toMatch(/high-value/);
    const unlocked = await desk.post(`/api/desk/pickups/${phone.claimId}/hand-over`, {
      ...base,
      secondCheck: 'device_unlocked',
      signaturePhotoId: await signature(),
    });
    expect(unlocked.status, unlocked.text).toBe(201);

    const visitor = await approvedClaim(email.visitor, {
      category: 'watch',
      shortName: 'Gold watch',
      binCode: 'S-03',
      privateTicks: [],
    });
    const lookup = await desk.post<Pickup>('/api/desk/pickups/lookup', { code: visitor.code });
    expect(lookup.body.needsSupervisor).toBe(true);
    const byDesk = await desk.post<{ error: { fields: Record<string, string> } }>(
      `/api/desk/pickups/${visitor.claimId}/hand-over`,
      {
        ...base,
        secondCheck: 'supervisor_approved',
        signaturePhotoId: await signature(),
      },
    );
    expect(byDesk.body.error.fields['secondCheck']).toMatch(/needs a supervisor/);
    const supervisor = await as(email.supervisor);
    expect(
      (
        await supervisor.post(`/api/desk/pickups/${visitor.claimId}/hand-over`, {
          ...base,
          secondCheck: 'supervisor_approved',
          signaturePhotoId: await signature(email.supervisor),
        })
      ).status,
    ).toBe(201);
  });

  it('resolves the lost report and tells the finder (US-11)', async () => {
    const finder = await as(email.student2);
    const post = await finder.post<{ id: string }>('/api/found-items', {
      category: 'glasses',
      colour: 'gold',
      shortName: 'Gold sunglasses',
      brand: null,
      model: null,
      publicDescription: null,
      place: { buildingCode: 'AUD', floorId: null, zoneId: null },
      foundAt: hoursAgo(2),
      privateTicks: ['marks'],
      privateNote: null,
      photoIds: [],
      pingReportIds: [],
    });
    const desk = await as(email.desk);
    await desk.post(`/api/desk/found-items/${post.body.id}/receive`, {
      category: 'glasses',
      colour: 'gold',
      shortName: 'Gold sunglasses',
      brand: null,
      model: null,
      publicDescription: null,
      place: { buildingCode: 'AUD', floorId: null, zoneId: null },
      foundAt: hoursAgo(2),
      privateTicks: [],
      privateNote: null,
      photoIds: [],
      condition: null,
      conditionPhotoIds: [],
      binCode: 'A-05',
      idNumber: null,
    });
    const reportId = await newReport(email.student, {
      category: 'glasses',
      colour: 'gold',
      shortName: 'Sunglasses',
      brand: null,
      place: { buildingCode: 'AUD', floorId: null, zoneId: null },
    });
    const c = await claim(email.student, post.body.id, { lostReportId: reportId });
    await review(c.body.id, 'approve', 'pass');
    const code =
      (await (await as(email.student)).get<Claim>(`/api/claims/${c.body.id}`)).body.pickupCode ??
      '';
    const lookup = await desk.post<Pickup>('/api/desk/pickups/lookup', { code });
    await desk.post(`/api/desk/pickups/${lookup.body.claimId}/hand-over`, {
      photoMatches: true,
      idLast4: '5042',
      signaturePhotoId: await signature(),
    });
    expect(await state('lost_reports', reportId)).toBe('RESOLVED');
    const told = await finder.get<AlertList>('/api/alerts');
    expect(
      told.body.alerts.some((a) => a.title === 'The item you found is back with its owner'),
    ).toBe(true);
    expect(told.text).not.toContain('Rafiq');
  });
});

describe('lost report renew and withdraw (US-12, CC-16)', () => {
  it('renews twice, then refuses', async () => {
    const id = await newReport(email.student, {
      category: 'keys',
      colour: 'silver',
      shortName: 'Keys',
      brand: null,
    });
    const owner = await as(email.student);
    expect(
      (await owner.post<LostReport>(`/api/lost-reports/${id}/renew`, {})).body.renewCount,
    ).toBe(1);
    expect(
      (await owner.post<LostReport>(`/api/lost-reports/${id}/renew`, {})).body.renewCount,
    ).toBe(2);
    const third = await owner.post<{ error: { message: string } }>(
      `/api/lost-reports/${id}/renew`,
      {},
    );
    expect(third.status).toBe(409);
    expect(third.body.error.message).toMatch(/renewed twice/);
  });

  it('"I found it myself" closes the report and cancels its open claim', async () => {
    const itemId = await logItem({
      category: 'calculator',
      shortName: 'Casio calculator',
      brand: 'Casio',
      binCode: 'A-06',
      privateTicks: [],
    });
    const reportId = await newReport(email.visitor, {
      category: 'calculator',
      colour: 'black',
      shortName: 'Calculator',
      brand: 'Casio',
    });
    const c = await claim(email.visitor, itemId, { lostReportId: reportId });
    const owner = await as(email.visitor);
    expect((await owner.post(`/api/lost-reports/${reportId}/withdraw`, {})).status).toBe(200);
    expect(await state('lost_reports', reportId)).toBe('WITHDRAWN');
    expect(await state('claims', c.body.id)).toBe('CANCELLED');
    expect(await state('found_items', itemId)).toBe('IN_CUSTODY');
    expect(
      (await (await as(email.student)).post(`/api/lost-reports/${reportId}/withdraw`, {})).status,
    ).toBe(404);
  });
});
