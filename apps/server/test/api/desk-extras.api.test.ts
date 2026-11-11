// Desk extras: a lost report and a claim filed for a walk-in student (US-10), proxy pickup (CC-09),
// merging a duplicate record (CC-04) and the daily shelf check (FR-15). Two tenants.
import type {
  Claim,
  ClaimStart,
  DeskFoundItem,
  DeskItemClaims,
  Dispatch,
  FoundPost,
  LoggedFoundItem,
  LostReport,
  LostReportCreated,
  Pickup,
  PolicySettings,
  ShelfCheckList,
  ShelfCheckResult,
  UploadedPhoto,
  WalkInClaimStart,
} from '@lf/contracts';
import sharp from 'sharp';
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

const report = (overrides: Record<string, unknown>) => ({
  category: 'wallet',
  colour: 'brown',
  shortName: 'Brown wallet',
  brand: null,
  publicDescription: null,
  privateNote: null,
  place: { buildingCode: 'LIB', floorId: null, zoneId: null },
  timeFrom: hoursAgo(5),
  timeTo: hoursAgo(3),
  ...overrides,
});

const intake = (overrides: Record<string, unknown> = {}) => ({
  category: 'bag',
  colour: 'black',
  shortName: 'Black bag',
  brand: null,
  model: null,
  publicDescription: null,
  place: { buildingCode: 'LIB', floorId: null, zoneId: null },
  foundAt: hoursAgo(1),
  privateTicks: ['marks'],
  privateNote: null,
  photoIds: [],
  condition: null,
  conditionPhotoIds: [],
  binCode: 'B-03',
  idNumber: null,
  ...overrides,
});

describe('walk-in student (US-10)', () => {
  it('lets the desk file a report that belongs to the student', async () => {
    const desk = await as(email.desk);
    const res = await desk.post<LostReportCreated>(
      '/api/lost-reports',
      report({ ownerEmail: email.student }),
    );
    expect(res.status).toBe(201);
    const mine = await (
      await as(email.student)
    ).get<LostReport>(`/api/lost-reports/${res.body.report.id}`);
    expect(mine.status).toBe(200);
    const unknown = await desk.post(
      '/api/lost-reports',
      report({ ownerEmail: 'nobody@northsouth.edu' }),
    );
    expect(unknown.status).toBe(400);
    const notDesk = await (
      await as(email.student2)
    ).post('/api/lost-reports', report({ ownerEmail: email.student }));
    expect(notDesk.status).toBe(400);
  });
});

describe('walk-in claim (US-10)', () => {
  it('lets the desk file a claim that belongs to the student, with the officer in the audit', async () => {
    const desk = await as(email.desk);
    const logged = await desk.post<LoggedFoundItem>(
      '/api/desk/found-items',
      intake({ shortName: 'Green bag', colour: 'green' }),
    );
    const itemId = logged.body.item.id;
    const start = await desk.post<WalkInClaimStart>('/api/desk/walk-in-claims/start', {
      foundItemId: itemId.toLowerCase().replace(/-/g, ''),
      ownerEmail: email.student.toUpperCase(),
    });
    expect(start.status).toBe(200);
    expect(start.body).toMatchObject({
      item: { id: itemId },
      claimant: { name: 'Rafiq Ahmed' },
      blockedReason: null,
    });
    expect(start.body.questions.length).toBeGreaterThan(0);

    const answers = start.body.questions.map((q) => ({ key: q.key, answer: 'A torn strap' }));
    const filed = await desk.post<Claim>('/api/desk/walk-in-claims', {
      foundItemId: itemId,
      ownerEmail: email.student,
      answers,
    });
    expect(filed.status).toBe(201);
    expect(filed.body.item.id).toBe(itemId);

    const student = await as(email.student);
    expect((await student.get<Claim>(`/api/claims/${filed.body.id}`)).status).toBe(200);
    const again = await desk.post<WalkInClaimStart>('/api/desk/walk-in-claims/start', {
      foundItemId: itemId,
      ownerEmail: email.student,
    });
    expect(again.body.blockedReason).not.toBeNull();

    const audit = await ctx.owner.query<{ event: string; actor_id: string }>(
      `select event, actor_id from audit_events where tenant_id = $1 and record_id = $2 and event = 'SUBMIT'`,
      [ctx.tenantA, filed.body.id],
    );
    const deskId = await ctx.owner.query<{ id: string }>('select id from users where email = $1', [
      email.desk,
    ]);
    expect(audit.rows).toEqual([{ event: 'SUBMIT', actor_id: deskId.rows[0]?.id }]);
    const alert = await ctx.owner.query<{ body: string }>(
      `select a.body from alerts a join users u on u.id = a.user_id where u.email = $1 and a.link = $2`,
      [email.student, `/claims/${filed.body.id}`],
    );
    expect(alert.rows[0]?.body).toMatch(/desk filed a claim/);
  });

  it('refuses unknown students, other roles and other tenants’ items', async () => {
    const desk = await as(email.desk);
    const logged = await desk.post<LoggedFoundItem>(
      '/api/desk/found-items',
      intake({ shortName: 'White bag', colour: 'white' }),
    );
    const itemId = logged.body.item.id;
    const unknown = await desk.post<{ error: { fields: Record<string, string> } }>(
      '/api/desk/walk-in-claims/start',
      { foundItemId: itemId, ownerEmail: 'nobody@northsouth.edu' },
    );
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.fields['ownerEmail']).toMatch(/signed in/);
    expect(
      (
        await desk.post('/api/desk/walk-in-claims', {
          foundItemId: itemId,
          ownerEmail: email.desk,
          answers: [{ key: 'x', answer: 'Something' }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await (
          await as(email.student)
        ).post('/api/desk/walk-in-claims/start', { foundItemId: itemId, ownerEmail: email.student })
      ).status,
    ).toBe(403);

    // FND numbers count per tenant, so tenant B's ID may also name one of tenant A's own items;
    // either way tenant A never sees B's item, and B's desk can't file for A's students.
    const deskB = await ctx.as('nusrat.jahan@other.test', ctx.hosts.B);
    const itemB = await deskB.post<LoggedFoundItem>(
      '/api/desk/found-items',
      intake({ shortName: 'Tenant B only parcel' }),
    );
    expect(itemB.status).toBe(201);
    const crossed = await desk.post('/api/desk/walk-in-claims/start', {
      foundItemId: itemB.body.item.id,
      ownerEmail: email.student,
    });
    expect(crossed.text).not.toContain('Tenant B only parcel');
    expect(
      (
        await deskB.post('/api/desk/walk-in-claims/start', {
          foundItemId: itemB.body.item.id,
          ownerEmail: email.student,
        })
      ).status,
    ).toBe(400);
    const rows = await ctx.owner.query('select 1 from claims where found_item_id = $1', [itemId]);
    expect(rows.rowCount).toBe(0);
  });
});

describe('proxy pickup (CC-09)', () => {
  it('records the proxy, checks their ID at the desk, and keeps both names on the DSP', async () => {
    const desk = await as(email.desk);
    const logged = await desk.post<LoggedFoundItem>('/api/desk/found-items', intake());
    const itemId = logged.body.item.id;
    const student = await as(email.student);
    const start = await student.get<ClaimStart>(`/api/found-items/${itemId}/claim`);
    const claim = await student.post<Claim>(`/api/found-items/${itemId}/claims`, {
      answers: start.body.questions.map((q) => ({ key: q.key, answer: 'A torn strap' })),
    });
    const early = await student.post(`/api/claims/${claim.body.id}/proxy`, {
      name: 'Tahmid Hasan',
      universityId: '2214450613',
    });
    expect(early.status).toBe(400);

    const side = await desk.get<DeskItemClaims>(`/api/desk/found-items/${itemId}/claims`);
    await desk.post(`/api/desk/claims/${claim.body.id}/review`, {
      verdicts: Object.fromEntries(
        (side.body.claims[0]?.answers ?? []).map((a) => [a.key, 'pass']),
      ),
      decision: 'approve',
      note: null,
    });
    const approved = await student.get<Claim>(`/api/claims/${claim.body.id}`);
    expect(approved.body.canNominateProxy).toBe(true);
    const named = await student.post<Claim>(`/api/claims/${claim.body.id}/proxy`, {
      name: 'Tahmid Hasan',
      universityId: '2214450613',
    });
    expect(named.status).toBe(200);
    expect(named.body.proxy).toEqual({ name: 'Tahmid Hasan', idMasked: '••••0613' });
    expect(named.text).not.toContain('2214450613');
    expect(
      (
        await (
          await as(email.visitor)
        ).post(`/api/claims/${claim.body.id}/proxy`, {
          name: 'X Y',
          universityId: '1234',
        })
      ).status,
    ).toBe(403);

    const pickup = await desk.post<Pickup>('/api/desk/pickups/lookup', {
      code: approved.body.pickupCode,
    });
    expect(pickup.body.proxy).toEqual({ name: 'Tahmid Hasan', idLast4: '0613' });

    const png = await sharp({
      create: { width: 600, height: 200, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.append('file', new File([png], 'signature.png', { type: 'image/png' }));
    const sig = await desk.request<{ photo: UploadedPhoto }>('POST', '/api/photos', form);
    const wrong = await desk.post(`/api/desk/pickups/${claim.body.id}/hand-over`, {
      photoMatches: true,
      idLast4: '5042',
      secondCheck: null,
      signaturePhotoId: sig.body.photo.id,
      collectedBy: 'proxy',
    });
    expect(wrong.status).toBe(400);
    const done = await desk.post<Dispatch>(`/api/desk/pickups/${claim.body.id}/hand-over`, {
      photoMatches: true,
      idLast4: '0613',
      secondCheck: null,
      signaturePhotoId: sig.body.photo.id,
      collectedBy: 'proxy',
    });
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({ recipientName: 'Rafiq Ahmed', proxyName: 'Tahmid Hasan' });
  });

  it("refuses a nomination when the university doesn't allow proxies", async () => {
    const sup = await as(email.supervisor);
    const settings = await sup.get<PolicySettings>('/api/supervisor/policies');
    await sup.put('/api/supervisor/policies', { ...settings.body.policies, proxyPickup: false });
    const desk = await as(email.desk);
    const logged = await desk.post<LoggedFoundItem>(
      '/api/desk/found-items',
      intake({ shortName: 'Grey bag', colour: 'grey' }),
    );
    const student = await as(email.student2);
    const start = await student.get<ClaimStart>(`/api/found-items/${logged.body.item.id}/claim`);
    const claim = await student.post<Claim>(`/api/found-items/${logged.body.item.id}/claims`, {
      answers: start.body.questions.map((q) => ({ key: q.key, answer: 'Scuffed corner' })),
    });
    const side = await desk.get<DeskItemClaims>(
      `/api/desk/found-items/${logged.body.item.id}/claims`,
    );
    await desk.post(`/api/desk/claims/${claim.body.id}/review`, {
      verdicts: Object.fromEntries(
        (side.body.claims[0]?.answers ?? []).map((a) => [a.key, 'pass']),
      ),
      decision: 'approve',
      note: null,
    });
    expect((await student.get<Claim>(`/api/claims/${claim.body.id}`)).body.canNominateProxy).toBe(
      false,
    );
    const refused = await student.post(`/api/claims/${claim.body.id}/proxy`, {
      name: 'Someone Else',
      universityId: '2211111111',
    });
    expect(refused.status).toBe(400);
    await sup.put('/api/supervisor/policies', settings.body.policies);
  });
});

describe('merge duplicates (CC-04)', () => {
  it('shows a student post as a possible duplicate and merges it into the desk record', async () => {
    const post = await (
      await as(email.student2)
    ).post<FoundPost>('/api/found-items', {
      category: 'calculator',
      colour: 'black',
      shortName: 'Black Casio calculator',
      brand: 'Casio',
      model: null,
      publicDescription: null,
      place: { buildingCode: 'NAC', floorId: null, zoneId: null },
      foundAt: hoursAgo(2),
      privateTicks: [],
      privateNote: null,
      photoIds: [],
      pingReportIds: [],
    });
    expect(post.status).toBe(201);
    const desk = await as(email.desk);
    const logged = await desk.post<LoggedFoundItem>(
      '/api/desk/found-items',
      intake({
        category: 'calculator',
        shortName: 'Casio calculator',
        place: { buildingCode: 'NAC', floorId: null, zoneId: null },
        binCode: 'A-02',
        privateTicks: [],
      }),
    );
    const kept = logged.body.item.id;
    const record = await desk.get<DeskFoundItem>(`/api/desk/found-items/${kept}`);
    expect(record.body.possibleDuplicates.map((d) => d.id)).toContain(post.body.id);

    const notDup = await desk.post<LoggedFoundItem>('/api/desk/found-items', intake());
    expect(
      (await desk.post(`/api/desk/found-items/${notDup.body.item.id}/merge`, { into: kept }))
        .status,
    ).toBe(400);
    const merged = await desk.post<DeskFoundItem>(`/api/desk/found-items/${post.body.id}/merge`, {
      into: kept,
    });
    expect(merged.status).toBe(200);
    expect(merged.body.id).toBe(kept);
    const old = await desk.get<DeskFoundItem>(`/api/desk/found-items/${post.body.id}`);
    expect(old.body).toMatchObject({ state: 'VOID', mergedInto: kept });
    expect(
      (
        await (
          await as(email.student)
        ).post(`/api/desk/found-items/${post.body.id}/merge`, { into: kept })
      ).status,
    ).toBe(403);
  });
});

describe('daily shelf check (FR-15)', () => {
  it('lists items bin by bin and records present or missing on each item', async () => {
    const desk = await as(email.desk);
    const logged = await desk.post<LoggedFoundItem>(
      '/api/desk/found-items',
      intake({ shortName: 'Navy bag', colour: 'navy', binCode: 'B-07' }),
    );
    const id = logged.body.item.id;
    const list = await desk.get<ShelfCheckList>('/api/desk/shelf-check');
    expect(list.status).toBe(200);
    expect(list.body.bins.find((b) => b.binCode === 'B-07')?.items.map((i) => i.id)).toContain(id);

    const saved = await desk.post<ShelfCheckResult>('/api/desk/shelf-check', {
      results: [{ id, present: false }],
    });
    expect(saved.status).toBe(201);
    expect(saved.body.missing.map((m) => m.id)).toEqual([id]);
    const record = await desk.get<DeskFoundItem>(`/api/desk/found-items/${id}`);
    expect(record.body.history.at(-1)?.label).toBe('Shelf check: missing');
    expect((await desk.post('/api/desk/shelf-check', { results: [] })).status).toBe(400);
    expect((await (await as(email.student)).get('/api/desk/shelf-check')).status).toBe(403);
  });
});
