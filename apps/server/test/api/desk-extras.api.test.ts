// Phase 4 desk extras: a lost report filed for a walk-in student (US-10), proxy pickup (CC-09), and
// merging a duplicate record (CC-04). Two tenants.
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
  UploadedPhoto,
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
