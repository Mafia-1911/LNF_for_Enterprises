// Supervisor (phase 4a): retention and disposal (WF-05, CC-02, NF-09), the overview, policies and
// closures, staff, and the lost-report expiry timer. Two tenants; uses the test clock.
import type {
  AlertList,
  LoggedFoundItem,
  LostReportCreated,
  PolicySettings,
  RetentionItem,
  RetentionList,
  RetentionRun,
  StaffMember,
  SupervisorOverview,
} from '@lf/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runLostReportTimer } from '../../src/modules/items';
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

const hourAgo = () => new Date(new Date(TEST_NOW).getTime() - 3_600_000).toISOString();

async function logItem(category: string, shortName: string, binCode: string) {
  const desk = await ctx.as(email.desk);
  const res = await desk.post<LoggedFoundItem>('/api/desk/found-items', {
    category,
    colour: 'black',
    shortName,
    brand: null,
    model: null,
    publicDescription: null,
    place: { buildingCode: 'PLZ', floorId: null, zoneId: null },
    foundAt: hourAgo(),
    privateTicks: [],
    privateNote: null,
    photoIds: [],
    condition: null,
    conditionPhotoIds: [],
    binCode,
    idNumber: null,
  });
  expect(res.status).toBe(201);
  return res.body.item.id;
}

async function lostReport(who: string, category: string, shortName: string) {
  const owner = await ctx.as(who);
  const res = await owner.post<LostReportCreated>('/api/lost-reports', {
    category,
    colour: 'black',
    shortName,
    brand: null,
    publicDescription: null,
    privateNote: null,
    place: { buildingCode: 'PLZ', floorId: null, zoneId: null },
    timeFrom: new Date(new Date(TEST_NOW).getTime() - 5 * 3_600_000).toISOString(),
    timeTo: hourAgo(),
  });
  expect(res.status).toBe(201);
  return res.body.report.id;
}

describe('who may use the supervisor screens', () => {
  it.each([
    ['get', '/api/supervisor/overview'],
    ['get', '/api/supervisor/retention'],
    ['get', '/api/supervisor/policies'],
    ['get', '/api/supervisor/staff'],
    ['post', '/api/supervisor/retention/run'],
  ] as const)('refuses desk officers, students and signed-out people: %s %s', async (m, url) => {
    for (const who of [email.desk, email.student, email.itAdmin]) {
      const res = await (await ctx.as(who))[m](url);
      expect(res.status, who).toBe(403);
    }
    expect((await ctx.anonymous()[m](url)).status).toBe(401);
  });
});

describe('retention and disposal', () => {
  it('gives look-alikes 30 days, sends a last-chance alert, expires, and records the decision', async () => {
    const sup = await ctx.as(email.supervisor);
    const umbrella = await logItem('umbrella', 'Black umbrella', 'B-01');
    const bag = await logItem('bag', 'Black backpack', 'B-02');
    await lostReport(email.student2, 'umbrella', 'Black umbrella');

    const before = await sup.get<RetentionList>('/api/supervisor/retention');
    expect(before.status).toBe(200);
    expect(before.body.policy).toEqual({ days: 60, lookAlikeDays: 30 });

    // 24 days in: the umbrella ends within 7 days → last-chance alert to the similar report's owner.
    ctx.clock.advance(24 * DAY_MS);
    const run1 = await sup.post<RetentionRun>('/api/supervisor/retention/run');
    expect(run1.status).toBe(200);
    expect(run1.body.lastChanceAlerts).toBeGreaterThanOrEqual(1);
    const alerts = await (await ctx.as(email.student2)).get<AlertList>('/api/alerts');
    expect(alerts.body.alerts.some((a) => a.kind === 'last_chance')).toBe(true);
    const again = await sup.post<RetentionRun>('/api/supervisor/retention/run');
    expect(again.body.lastChanceAlerts).toBe(0);

    // Day 31: the umbrella expires, the bag (60 days) does not.
    ctx.clock.advance(7 * DAY_MS);
    const run2 = await sup.post<RetentionRun>('/api/supervisor/retention/run');
    expect(run2.body.expired).toBeGreaterThanOrEqual(1);
    const list = await sup.get<RetentionList>('/api/supervisor/retention');
    const row = list.body.awaiting.find((i) => i.id === umbrella);
    expect(row).toMatchObject({ state: 'EXPIRED', lookAlike: true });
    expect(list.body.awaiting.some((i) => i.id === bag)).toBe(false);

    // A note is required, then the decision is recorded and listed.
    const noNote = await sup.post('/api/supervisor/retention/decide', {
      ids: [umbrella],
      decision: 'donate',
      note: '',
    });
    expect(noNote.status).toBe(400);
    const decided = await sup.post<{ decided: number }>('/api/supervisor/retention/decide', {
      ids: [umbrella],
      decision: 'donate',
      note: 'Given to the NSU charity club',
    });
    expect(decided.body).toEqual({ decided: 1 });
    const after = await sup.get<RetentionList>('/api/supervisor/retention');
    expect(after.body.decided.find((i) => i.id === umbrella)).toMatchObject({
      state: 'DONATED',
      decision: 'donate',
      note: 'Given to the NSU charity club',
    });
    const twice = await sup.post('/api/supervisor/retention/decide', {
      ids: [umbrella],
      decision: 'dispose',
      note: 'Again',
    });
    expect(twice.status).toBe(409);
    const audit = await ctx.owner.query<{ actor_kind: string; event: string }>(
      `select actor_kind, event from audit_events where record_id = $1 order by id`,
      [umbrella],
    );
    expect(audit.rows.map((r) => r.event)).toEqual(['LOG_INTAKE', 'EXPIRE', 'DONATE']);
    expect(audit.rows[1]?.actor_kind).toBe('system:found-item-retention');
    ctx.clock.reset();
  });

  it('keeps an expired item 30 more days from today', async () => {
    const sup = await ctx.as(email.supervisor);
    const bottle = await logItem('bottle', 'Black bottle', 'B-03');
    ctx.clock.advance(45 * DAY_MS);
    await sup.post('/api/supervisor/retention/run');
    const kept = await sup.post<RetentionItem>(`/api/supervisor/retention/${bottle}/keep`);
    expect(kept.status).toBe(200);
    expect(kept.body.state).toBe('IN_CUSTODY');
    const ends = new Date(kept.body.endsAt ?? 0).getTime();
    expect(ends).toBeGreaterThan(ctx.clock.now().getTime() + 29 * DAY_MS);
    const run = await sup.post<RetentionRun>('/api/supervisor/retention/run');
    expect(run.body.expired).toBe(0);
    expect((await sup.post('/api/supervisor/retention/FND-0000-0000A/keep')).status).toBe(404);
    ctx.clock.reset();
  });
});

describe('policies and closures', () => {
  it('saves policies, rejects bad values, and pauses retention during a closure', async () => {
    const sup = await ctx.as(email.supervisor);
    const current = await sup.get<PolicySettings>('/api/supervisor/policies');
    expect(current.body.policies).toMatchObject({ retentionDays: 60, activeClaimCap: 3 });

    const bad = await sup.put('/api/supervisor/policies', {
      ...current.body.policies,
      lookAlikeRetentionDays: 90,
    });
    expect(bad.status).toBe(400);
    const saved = await sup.put<PolicySettings>('/api/supervisor/policies', {
      ...current.body.policies,
      retentionDays: 45,
    });
    expect(saved.body.policies.retentionDays).toBe(45);

    const item = await logItem('laptop', 'Black laptop', 'S-01');
    const endsOf = async () =>
      (await sup.get<RetentionList>('/api/supervisor/retention')).body.ending.find(
        (i) => i.id === item,
      )?.endsAt;
    ctx.clock.advance(40 * DAY_MS);
    const plain = await endsOf();
    expect(plain).toBeDefined();
    const added = await sup.post<PolicySettings>('/api/supervisor/closures', {
      name: 'Durga Puja closure',
      from: '2026-11-20',
      to: '2026-11-24',
    });
    expect(added.status).toBe(201);
    const closure = added.body.closures.find((c) => c.name === 'Durga Puja closure');
    expect(closure).toBeDefined();
    const paused = await endsOf();
    expect(new Date(paused ?? 0).getTime() - new Date(plain ?? 0).getTime()).toBe(5 * DAY_MS);

    const overlap = await sup.post('/api/supervisor/closures', {
      name: 'Overlap',
      from: '2026-11-24',
      to: '2026-11-25',
    });
    expect(overlap.status).toBe(400);
    const backwards = await sup.post('/api/supervisor/closures', {
      name: 'Backwards',
      from: '2026-12-02',
      to: '2026-12-01',
    });
    expect(backwards.status).toBe(400);

    const removed = await sup.request<PolicySettings>(
      'DELETE',
      `/api/supervisor/closures/${closure?.id ?? ''}`,
    );
    expect(removed.status).toBe(200);
    expect(await endsOf()).toBe(plain);
    const gone = await sup.request('DELETE', `/api/supervisor/closures/${closure?.id ?? ''}`);
    expect(gone.status).toBe(404);

    await sup.put('/api/supervisor/policies', current.body.policies);
    ctx.clock.reset();
  });
});

describe('staff', () => {
  it('adds an invite and an existing member, removes access, and refuses removing yourself', async () => {
    const sup = await ctx.as(email.supervisor);
    const list = await sup.get<{ staff: StaffMember[] }>('/api/supervisor/staff');
    expect(list.body.staff.find((s) => s.you)?.email).toBe(email.supervisor);

    const invited = await sup.post<{ staff: StaffMember[] }>('/api/supervisor/staff', {
      name: 'Imran Chowdhury',
      email: 'imran.chowdhury@northsouth.edu',
      role: 'desk_officer',
    });
    expect(invited.status).toBe(201);
    expect(
      invited.body.staff.find((s) => s.email === 'imran.chowdhury@northsouth.edu'),
    ).toMatchObject({ status: 'invited', userId: null });
    const wrongDomain = await sup.post('/api/supervisor/staff', {
      name: 'Someone Else',
      email: 'someone@other.test',
      role: 'desk_officer',
    });
    expect(wrongDomain.status).toBe(400);

    const promoted = await sup.post<{ staff: StaffMember[] }>('/api/supervisor/staff', {
      name: 'Sadia Rahman',
      email: email.student2,
      role: 'desk_officer',
    });
    expect(promoted.body.staff.find((s) => s.email === email.student2)?.status).toBe('active');
    const asDesk = await (await ctx.as(email.student2)).get('/api/desk/today');
    expect(asDesk.status).toBe(200);

    const removed = await sup.post<{ staff: StaffMember[] }>('/api/supervisor/staff/remove', {
      email: email.student2,
    });
    expect(removed.body.staff.some((s) => s.email === email.student2)).toBe(false);
    expect((await (await ctx.as(email.student2)).get('/api/desk/today')).status).toBe(403);
    await sup.post('/api/supervisor/staff/remove', { email: 'imran.chowdhury@northsouth.edu' });

    const self = await sup.post('/api/supervisor/staff/remove', { email: email.supervisor });
    expect(self.status).toBe(400);
    const nobody = await sup.post('/api/supervisor/staff/remove', { email: email.student });
    expect(nobody.status).toBe(404);
  });
});

describe('overview', () => {
  it('shows counts, latest activity and Today', async () => {
    await logItem('keys', 'Black keys', 'A-01');
    const res = await (
      await ctx.as(email.supervisor)
    ).get<SupervisorOverview>('/api/supervisor/overview');
    expect(res.status).toBe(200);
    expect(res.body.counts.inCustody).toBeGreaterThanOrEqual(1);
    expect(res.body.activity[0]).toMatchObject({ label: 'Logged at desk', actor: 'Nusrat Jahan' });
    expect(res.body.today).toHaveProperty('toShelve');
  });
});

describe('lost report expiry', () => {
  it('reminds 2 days before and then expires the report', async () => {
    const id = await lostReport(email.student, 'jewellery', 'Silver ring');
    const timer = () =>
      runLostReportTimer(
        {
          boss: ctx.services.boss,
          appOrigin: ctx.services.config.appOrigin,
        },
        {
          tenantId: ctx.tenantA,
          actor: { kind: 'system', job: 'lost-report-expiry-timer' },
          requestId: 'test',
          clock: ctx.clock,
          db: ctx.services.db,
        },
      );
    ctx.clock.advance(28 * DAY_MS + 3_600_000);
    const first = await timer();
    expect(first.reminded).toBeGreaterThanOrEqual(1);
    expect((await timer()).reminded).toBe(0);
    ctx.clock.advance(2 * DAY_MS);
    expect((await timer()).expired).toBeGreaterThanOrEqual(1);
    const rows = await ctx.owner.query<{ state: string }>(
      `select state from lost_reports where id = $1 and tenant_id = $2`,
      [id, ctx.tenantA],
    );
    expect(rows.rows[0]?.state).toBe('EXPIRED');
    const alerts = await (await ctx.as(email.student)).get<AlertList>('/api/alerts');
    expect(alerts.body.alerts.map((a) => a.kind)).toEqual(
      expect.arrayContaining(['report_expiring', 'report_expired']),
    );
    ctx.clock.reset();
  });
});
