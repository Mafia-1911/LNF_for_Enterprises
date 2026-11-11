// Supervisor (phase 4b): the dispatch directory with CSV and amendments (FR-16–18), disputes (WF-06,
// CC-01, CC-14), high-value approvals (CC-08, CC-10) and flags (CC-03, CC-15). Two tenants.
import type {
  ApprovalList,
  Claim,
  ClaimStart,
  DeskItemClaims,
  Dispatch,
  DispatchList,
  DispatchRecord,
  Dispute,
  DisputeList,
  FlagList,
  LoggedFoundItem,
  Pickup,
  UploadedPhoto,
} from '@lf/contracts';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runHandInTimer } from '../../src/modules/items';
import { DAY_MS } from '../../src/platform/clock';
import { createTestContext, type TestContext } from '../harness';
import { email, TEST_NOW } from '../fixtures';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  ctx.clock.reset();
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

const hourAgo = () => new Date(new Date(TEST_NOW).getTime() - 3_600_000).toISOString();

async function logItem(category: string, shortName: string): Promise<string> {
  const res = await (
    await as(email.desk)
  ).post<LoggedFoundItem>('/api/desk/found-items', {
    category,
    colour: 'black',
    shortName,
    brand: null,
    model: null,
    publicDescription: null,
    place: { buildingCode: 'LIB', floorId: null, zoneId: null },
    foundAt: hourAgo(),
    privateTicks: ['marks'],
    privateNote: null,
    photoIds: [],
    condition: null,
    conditionPhotoIds: [],
    binCode: category === 'laptop' ? 'S-01' : 'B-05',
    idNumber: null,
  });
  expect(res.status).toBe(201);
  return res.body.item.id;
}

async function claim(who: string, itemId: string): Promise<string> {
  const c = await as(who);
  const start = await c.get<ClaimStart>(`/api/found-items/${itemId}/claim`);
  const res = await c.post<Claim>(`/api/found-items/${itemId}/claims`, {
    answers: start.body.questions.map((q) => ({ key: q.key, answer: 'A long scratch' })),
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function review(itemId: string, claimId: string, verdict: 'pass' | 'fail') {
  const desk = await as(email.desk);
  const side = await desk.get<DeskItemClaims>(`/api/desk/found-items/${itemId}/claims`);
  const answers = side.body.claims.find((c) => c.id === claimId)?.answers ?? [];
  return desk.post(`/api/desk/claims/${claimId}/review`, {
    verdicts: Object.fromEntries(answers.map((a) => [a.key, verdict])),
    decision: verdict === 'pass' ? 'approve' : 'reject',
    note: verdict === 'pass' ? null : "The answers didn't match",
  });
}

async function signature(who: string): Promise<string> {
  const png = await sharp({ create: { width: 600, height: 200, channels: 3, background: '#fff' } })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append('file', new File([png], 'signature.png', { type: 'image/png' }));
  const res = await (await as(who)).request<{ photo: UploadedPhoto }>('POST', '/api/photos', form);
  return res.body.photo.id;
}

async function handOver(
  claimId: string,
  who: string = email.desk,
  secondCheck: string | null = null,
) {
  return (await as(who)).post<Dispatch>(`/api/desk/pickups/${claimId}/hand-over`, {
    photoMatches: true,
    idLast4: '5042',
    secondCheck,
    signaturePhotoId: await signature(who),
  });
}

let dspId = '';
let losingClaim = '';
let winningClaim = '';

describe('dispatch directory and disputes', () => {
  it('lists, searches and exports handovers, and adds amendments', async () => {
    const itemId = await logItem('bag', 'Black JanSport backpack');
    winningClaim = await claim(email.student, itemId);
    losingClaim = await claim(email.student2, itemId);
    expect((await review(itemId, winningClaim, 'pass')).status).toBe(200);
    const done = await handOver(winningClaim);
    expect(done.status).toBe(201);
    dspId = done.body.id;

    const sup = await as(email.supervisor);
    const all = await sup.get<DispatchList>('/api/supervisor/dispatches');
    expect(all.status).toBe(200);
    expect(all.body.dispatches.find((d) => d.id === dspId)).toMatchObject({
      foundItemId: itemId,
      claimantName: 'Rafiq Ahmed',
      idMasked: '••••5042',
      locked: false,
    });
    for (const q of [dspId.toLowerCase(), itemId, 'rafiq', '5042']) {
      const found = await sup.get<DispatchList>(
        `/api/supervisor/dispatches?q=${encodeURIComponent(q)}`,
      );
      expect(
        found.body.dispatches.map((d) => d.id),
        q,
      ).toContain(dspId);
    }
    const none = await sup.get<DispatchList>('/api/supervisor/dispatches?category=laptop');
    expect(none.body.dispatches.map((d) => d.id)).not.toContain(dspId);

    const csv = await sup.get('/api/supervisor/exports/dispatches.csv');
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(csv.text).toContain('"DSP ID","FND ID"');
    expect(csv.text).toContain(dspId);
    expect(csv.text).toContain('"••••5042"');

    const short = await sup.post(`/api/supervisor/dispatches/${dspId}/amendments`, {
      reason: 'x',
    });
    expect(short.status).toBe(400);
    const amended = await sup.post<DispatchRecord>(
      `/api/supervisor/dispatches/${dspId}/amendments`,
      {
        reason: 'The ID checked was the NID, not the university card.',
      },
    );
    expect(amended.status).toBe(201);
    expect(amended.body.amendments).toHaveLength(1);
    const record = await sup.get<DispatchRecord>(`/api/supervisor/dispatches/${dspId}`);
    expect(record.body.history.map((h) => h.label)).toContain('Handed over');
    expect((await sup.get('/api/supervisor/dispatches/DSP-0000-0000A')).status).toBe(404);

    // Locks 24 h after creation.
    ctx.clock.advance(DAY_MS + 60_000);
    const later = await sup.get<DispatchList>('/api/supervisor/dispatches');
    expect(later.body.dispatches.find((d) => d.id === dspId)?.locked).toBe(true);
    ctx.clock.reset();

    for (const who of [email.desk, email.student])
      expect((await (await as(who)).get('/api/supervisor/dispatches')).status).toBe(403);
  });

  it('lets the losing claimant dispute, and the supervisor note and resolve it', async () => {
    const loser = await as(email.student2);
    const view = await loser.get<Claim>(`/api/claims/${losingClaim}`);
    expect(view.body.canDispute).toBe('second_claimant');
    expect((await loser.get<{ dispute: null }>(`/api/claims/${losingClaim}/dispute`)).body).toEqual(
      {
        dispute: null,
      },
    );
    const tooShort = await loser.post(`/api/claims/${losingClaim}/dispute`, { statement: 'mine' });
    expect(tooShort.status).toBe(400);
    const raised = await loser.post<{ dispute: Dispute }>(`/api/claims/${losingClaim}/dispute`, {
      statement: 'My lab manual had my name on the first page.',
    });
    expect(raised.status).toBe(201);
    expect(raised.body.dispute).toMatchObject({ state: 'OPEN', dispatchId: dspId });
    const again = await loser.post(`/api/claims/${losingClaim}/dispute`, {
      statement: 'Again, it is mine for sure.',
    });
    expect(again.status).toBe(409);
    // Someone else's claim can't be disputed by this person.
    expect(
      (
        await (
          await as(email.student)
        ).post(`/api/claims/${losingClaim}/dispute`, {
          statement: 'Not my claim at all here.',
        })
      ).status,
    ).toBe(404);

    const sup = await as(email.supervisor);
    const list = await sup.get<DisputeList>('/api/supervisor/disputes');
    const dispute = list.body.disputes.find((d) => d.claimId === losingClaim);
    expect(dispute).toMatchObject({ raisedBy: 'Sadia Rahman', state: 'OPEN' });
    const id = dispute?.id ?? '';
    const noted = await sup.post<Dispute>(`/api/supervisor/disputes/${id}/notes`, {
      note: 'Called both students.',
    });
    expect(noted.status).toBe(201);
    expect(noted.body.history.map((h) => h.label)).toEqual(['Dispute raised', 'Note']);
    const resolved = await sup.post<Dispute>(`/api/supervisor/disputes/${id}/resolve`, {
      outcome: 'upheld',
      note: 'The lab manual had her name.',
      flagRecipient: true,
    });
    expect(resolved.status).toBe(200);
    expect(resolved.body).toMatchObject({ state: 'RESOLVED', outcome: 'upheld' });
    expect(
      (await sup.get<Dispute>(`/api/supervisor/disputes/${id}`)).body.history.at(-1)?.label,
    ).toBe('Account flagged');
    const twice = await sup.post(`/api/supervisor/disputes/${id}/resolve`, {
      outcome: 'rejected',
      note: 'Changed my mind.',
      flagRecipient: false,
    });
    expect(twice.status).toBe(409);
    expect((await (await as(email.desk)).get('/api/supervisor/disputes')).status).toBe(403);
    expect(
      (await sup.get('/api/supervisor/disputes/00000000-0000-4000-8000-000000000000')).status,
    ).toBe(404);

    // The wrong recipient shows on the Flags page; clearing hides it.
    const flags = await sup.get<FlagList>('/api/supervisor/flags');
    const flag = flags.body.flags.find((f) => f.name === 'Rafiq Ahmed');
    expect(flag?.kinds).toContain('wrong_recipient');
    const cleared = await sup.post<FlagList>(`/api/supervisor/flags/${flag?.userId ?? ''}/clear`);
    expect(cleared.status).toBe(200);
    expect(cleared.body.flags.some((f) => f.userId === flag?.userId)).toBe(false);
    expect((await sup.post(`/api/supervisor/flags/${flag?.userId ?? ''}/clear`)).status).toBe(404);
  });
});

describe('high-value approvals', () => {
  it('lets the desk ask, the supervisor approve, and the desk finish the handover', async () => {
    const itemId = await logItem('laptop', 'Silver MacBook');
    const claimId = await claim(email.visitor, itemId);
    expect((await review(itemId, claimId, 'pass')).status).toBe(200);
    const desk = await as(email.desk);
    const code = (await (await as(email.visitor)).get<Claim>(`/api/claims/${claimId}`)).body
      .pickupCode;
    const pickup = await desk.post<Pickup>('/api/desk/pickups/lookup', { code });
    expect(pickup.body).toMatchObject({ needsSupervisor: true, approval: 'none' });

    const blocked = await handOver(claimId, email.desk, 'supervisor_approved');
    expect(blocked.status).toBe(400);
    const asked = await desk.post<{ approval: string }>(
      `/api/desk/pickups/${claimId}/request-approval`,
    );
    expect(asked.body).toEqual({ approval: 'requested' });

    const sup = await as(email.supervisor);
    const waiting = await sup.get<ApprovalList>('/api/supervisor/approvals');
    expect(waiting.body.approvals.find((a) => a.claimId === claimId)).toMatchObject({
      itemTitle: 'Silver MacBook',
      requestedBy: 'Nusrat Jahan',
      approved: false,
    });
    expect((await desk.get('/api/supervisor/approvals')).status).toBe(403);
    const approved = await sup.post<ApprovalList>(`/api/supervisor/approvals/${claimId}/approve`);
    expect(approved.body.approvals.find((a) => a.claimId === claimId)?.approved).toBe(true);
    expect((await desk.post<Pickup>('/api/desk/pickups/lookup', { code })).body.approval).toBe(
      'approved',
    );

    const done = await handOver(claimId, email.desk, 'supervisor_approved');
    expect(done.status).toBe(201);
    expect((await sup.post('/api/supervisor/approvals/CLM-0000-0000A/approve')).status).toBe(404);
    // Not high value: nothing to ask for.
    const bagId = await logItem('bag', 'Grey tote');
    const bagClaim = await claim(email.student, bagId);
    await review(bagId, bagClaim, 'pass');
    expect((await desk.post(`/api/desk/pickups/${bagClaim}/request-approval`)).status).toBe(400);
  });
});

describe('flags for paused claimants (CC-15)', () => {
  it('flags three failed verifications and lifts the pause when cleared', async () => {
    for (let i = 0; i < 3; i += 1) {
      const itemId = await logItem('bottle', `Black bottle ${i}`);
      const c = await claim(email.student2, itemId);
      expect((await review(itemId, c, 'fail')).status).toBe(200);
    }
    const sup = await as(email.supervisor);
    const flags = await sup.get<FlagList>('/api/supervisor/flags');
    const flag = flags.body.flags.find((f) => f.name === 'Sadia Rahman');
    expect(flag?.kinds).toContain('failed_verifications');

    const next = await logItem('bottle', 'Black bottle 4');
    const student = await as(email.student2);
    const paused = await student.get<ClaimStart>(`/api/found-items/${next}/claim`);
    expect(paused.body.blockedReason).toMatch(/paused/);
    await sup.post(`/api/supervisor/flags/${flag?.userId ?? ''}/clear`);
    const open = await student.get<ClaimStart>(`/api/found-items/${next}/claim`);
    expect(open.body.blockedReason).toBeNull();
  });
});

describe('repeat no-show finders (CC-03)', () => {
  it('flags a finder whose posts were never handed in, twice', async () => {
    const finder = await as(email.student);
    for (const name of ['Grey charger', 'White charger'])
      expect(
        (
          await finder.post('/api/found-items', {
            category: 'charger',
            colour: 'grey',
            shortName: name,
            brand: null,
            model: null,
            publicDescription: null,
            place: { buildingCode: 'LIB', floorId: null, zoneId: null },
            foundAt: hourAgo(),
            privateTicks: [],
            privateNote: null,
            photoIds: [],
            pingReportIds: [],
          })
        ).status,
      ).toBe(201);
    ctx.clock.advance(49 * 3_600_000);
    const result = await runHandInTimer(
      {
        boss: ctx.services.boss,
        crypto: ctx.services.crypto,
        registrar: ctx.services.registrar,
        appOrigin: ctx.services.config.appOrigin,
      },
      {
        tenantId: ctx.tenantA,
        actor: { kind: 'system', job: 'found-item-hand-in-timer' },
        requestId: 'test',
        clock: ctx.clock,
        db: ctx.services.db,
      },
    );
    expect(result.notReceived).toBeGreaterThanOrEqual(2);
    const flags = await (await as(email.supervisor)).get<FlagList>('/api/supervisor/flags');
    const flag = flags.body.flags.find((f) => f.name === 'Rafiq Ahmed');
    expect(flag?.kinds).toContain('no_show_finder');
    expect(flag?.reasons.join(' ')).toMatch(/never handed in/);
    ctx.clock.reset();
  });
});
