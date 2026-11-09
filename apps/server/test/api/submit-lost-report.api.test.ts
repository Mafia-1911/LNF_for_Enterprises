// GOLDEN SLICE — API tests for "Submit a lost report" (US-01, WF-01). Copy this file's shape:
// one createTestContext per file, people via ctx.as(email), and assertions on both the response
// and the database (rows, audit events, jobs).
import type { LostReport, LostReportCreated } from '@lf/contracts';
import { parseId } from '@lf/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { submitLostReport } from '../../src/modules/items';
import { createTestClock } from '../../src/platform/clock';
import type { JobSender } from '../../src/platform/jobs';
import { createTestContext, type TestContext } from '../harness';
import { email, TEST_NOW } from '../fixtures';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

const twoHoursAgo = new Date(new Date(TEST_NOW).getTime() - 2 * 3600_000).toISOString();

function validReport(overrides: Record<string, unknown> = {}) {
  return {
    category: 'glasses',
    colour: 'grey',
    shortName: 'Calvin',
    brand: 'Calvin Klein',
    publicDescription: 'Thin metal frame in a black case.',
    privateNote: 'Scratch on the left lens; my initials RA inside the case.',
    place: { buildingCode: 'NAC', floorId: null, zoneId: null },
    timeFrom: twoHoursAgo,
    timeTo: TEST_NOW,
    ...overrides,
  };
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await ctx.owner.query<{ n: string }>(sql, params);
  return Number(rows[0]?.n ?? 0);
}

describe('POST /api/lost-reports', () => {
  it('creates an OPEN report with an LST ID, an audit event and a match job, all in one transaction', async () => {
    const student = await ctx.as(email.student);
    const res = await student.post<LostReportCreated>('/api/lost-reports', validReport());

    expect(res.status).toBe(201);
    const { report } = res.body;
    expect(report.id).toMatch(/^LST-2611-\d{4}[A-Z]$/);
    expect(parseId(report.id)).not.toBeNull();
    expect(report.state).toBe('OPEN');
    expect(report.place).toEqual({
      buildingCode: 'NAC',
      buildingName: 'North Academic Building',
      floorName: null,
      zoneName: null,
    });
    // Open for 30 days from "now" (the test clock).
    expect(report.expiresAt).toBe('2026-12-08T10:39:00.000Z');
    expect(report.hasPrivateDetails).toBe(true);
    expect(res.body.similarInCustody).toEqual([]);

    expect(
      await count('select count(*) n from lost_reports where tenant_id = $1 and id = $2', [
        ctx.tenantA,
        report.id,
      ]),
    ).toBe(1);
    const audit = await ctx.owner.query(
      'select event, from_state, to_state, actor_kind from audit_events where record_id = $1 and tenant_id = $2',
      [report.id, ctx.tenantA],
    );
    expect(audit.rows).toEqual([
      { event: 'SUBMIT', from_state: null, to_state: 'OPEN', actor_kind: 'user' },
    ]);
    const jobs = await ctx.owner.query(
      `select data from pgboss.job where name = 'match-lost-report' and data->>'reportId' = $1`,
      [report.id],
    );
    expect(jobs.rows).toEqual([{ data: { tenantId: ctx.tenantA, reportId: report.id } }]);
  });

  it('stores private details encrypted and never returns or logs them', async () => {
    const student = await ctx.as(email.student);
    const res = await student.post<LostReportCreated>(
      '/api/lost-reports',
      validReport({ privateNote: 'PIN-hint-7731 sticker' }),
    );
    expect(res.text).not.toContain('PIN-hint-7731');

    const { rows } = await ctx.owner.query<{ note_ciphertext: string; key_version: number }>(
      'select note_ciphertext, key_version from private_details where tenant_id = $1 and record_id = $2',
      [ctx.tenantA, res.body.report.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.note_ciphertext).not.toContain('PIN-hint');
    expect(rows[0]?.key_version).toBe(1);
    const decrypted = ctx.services.crypto.decrypt(
      { ciphertext: rows[0]?.note_ciphertext ?? '', keyVersion: rows[0]?.key_version ?? 0 },
      `${ctx.tenantA}:lost_report:${res.body.report.id}`,
    );
    expect(decrypted).toBe('PIN-hint-7731 sticker');

    const read = await student.get<LostReport>(`/api/lost-reports/${res.body.report.id}`);
    expect(read.text).not.toContain('PIN-hint');
  });

  it('accepts a report with no photos, no colour and "Not sure" for the place', async () => {
    const student = await ctx.as(email.student);
    const res = await student.post<LostReportCreated>(
      '/api/lost-reports',
      validReport({
        colour: null,
        brand: '',
        shortName: '',
        publicDescription: '',
        privateNote: '',
        place: { buildingCode: null, floorId: null, zoneId: null },
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.report).toMatchObject({
      colour: null,
      brand: null,
      shortName: null,
      hasPrivateDetails: false,
    });
    expect(res.body.report.place.buildingCode).toBeNull();
  });

  it('accepts building › floor › zone from the catalog', async () => {
    const student = await ctx.as(email.student);
    const catalog = await student.get<{
      buildings: {
        code: string;
        floors: { id: string; name: string; zones: { id: string; name: string }[] }[];
      }[];
    }>('/api/catalog');
    const lib = catalog.body.buildings.find((b) => b.code === 'LIB');
    const floor = lib?.floors.find((f) => f.name === '2nd floor');
    const zone = floor?.zones.find((z) => z.name === 'Reading hall');
    const res = await student.post<LostReportCreated>(
      '/api/lost-reports',
      validReport({ place: { buildingCode: 'LIB', floorId: floor?.id, zoneId: zone?.id } }),
    );
    expect(res.status).toBe(201);
    expect(res.body.report.place).toEqual({
      buildingCode: 'LIB',
      buildingName: 'Library',
      floorName: '2nd floor',
      zoneName: 'Reading hall',
    });
  });

  it.each([
    ['no category', { category: undefined }, 'category'],
    ['a desk-only category', { category: 'weapon' }, 'category'],
    ['an unknown colour', { colour: 'teal' }, 'colour'],
    ['"To" before "From"', { timeFrom: TEST_NOW, timeTo: twoHoursAgo }, 'timeTo'],
    [
      'a zone without a floor',
      {
        place: {
          buildingCode: 'NAC',
          floorId: null,
          zoneId: '00000000-0000-4000-8000-000000000000',
        },
      },
      'place.zoneId',
    ],
    [
      'a floor without a building',
      {
        place: {
          buildingCode: null,
          floorId: '00000000-0000-4000-8000-000000000000',
          zoneId: null,
        },
      },
      'place.floorId',
    ],
    ['a short name over 60 characters', { shortName: 'x'.repeat(61) }, 'shortName'],
    ['a time without an offset', { timeTo: '2026-11-08 16:39' }, 'timeTo'],
  ])('rejects %s with a one-sentence message', async (_label, overrides, field) => {
    const student = await ctx.as(email.student);
    const res = await student.post<{
      error: { kind: string; message: string; fields: Record<string, string> };
    }>('/api/lost-reports', validReport(overrides));
    expect(res.status).toBe(400);
    expect(res.body.error.kind).toBe('validation');
    expect(res.body.error.message).toMatch(/^[A-Z][^.]*\.$/);
    expect(Object.keys(res.body.error.fields)).toContain(field);
  });

  it('rejects times in the future or more than a year ago (checked against the server clock)', async () => {
    const student = await ctx.as(email.student);
    const future = await student.post<{ error: { fields: Record<string, string> } }>(
      '/api/lost-reports',
      validReport({ timeTo: '2026-11-09T10:39:00.000Z' }),
    );
    expect(future.status).toBe(400);
    expect(future.body.error.fields['timeTo']).toContain('future');
    const old = await student.post<{ error: { fields: Record<string, string> } }>(
      '/api/lost-reports',
      validReport({ timeFrom: '2025-01-01T00:00:00.000Z' }),
    );
    expect(old.status).toBe(400);
    expect(old.body.error.fields['timeFrom']).toContain('more than a year ago');
  });

  it("rejects a floor from another building or another university's catalog", async () => {
    const student = await ctx.as(email.student);
    const otherTenantFloor = (
      await ctx.owner.query<{ id: string }>('select id from floors where tenant_id = $1 limit 1', [
        ctx.tenantB,
      ])
    ).rows[0]?.id;
    const res = await student.post<{ error: { fields: Record<string, string> } }>(
      '/api/lost-reports',
      validReport({ place: { buildingCode: 'NAC', floorId: otherTenantFloor, zoneId: null } }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.fields['place.buildingCode']).toContain("isn't on the campus list");
  });

  it('numbers reports per tenant and month (IDs overlap across tenants by design)', async () => {
    const studentB = await ctx.as('rafiq.ahmed@other.test', ctx.hosts.B);
    const res = await studentB.post<LostReportCreated>('/api/lost-reports', validReport());
    expect(res.status).toBe(201);
    // Tenant B had one seeded report, so this is its second.
    expect(res.body.report.id.slice(0, 13)).toBe('LST-2611-0002');
  });

  it('allocates IDs in the Dhaka month (17:59 UTC on 31 Oct is still October; 18:00 is November)', async () => {
    const userId =
      (
        await ctx.owner.query<{ id: string }>('select id from users where email = $1', [
          email.student2,
        ])
      ).rows[0]?.id ?? '';
    const ids: string[] = [];
    for (const at of ['2026-10-31T17:59:00.000Z', '2026-10-31T18:00:00.000Z']) {
      const created = await submitLostReport(
        { boss: ctx.services.boss, crypto: ctx.services.crypto },
        {
          tenantId: ctx.tenantA,
          actor: { kind: 'user', userId, role: 'student', name: 'Sadia Rahman' },
          requestId: 'test',
          clock: createTestClock(at),
          db: ctx.services.db,
        },
        {
          ...validReport(),
          timeFrom: new Date(new Date(at).getTime() - 3600_000).toISOString(),
          timeTo: at,
        } as never,
      );
      ids.push(created.report.id);
    }
    expect(ids[0]).toMatch(/^LST-2610-0001/);
    expect(ids[1]).toMatch(/^LST-2611-/);
  });
});

describe('transactions: report and job commit or roll back together (plan §3.3)', () => {
  it('leaves no report, no audit event and no job when an error is thrown after boss.send', async () => {
    const userId =
      (
        await ctx.owner.query<{ id: string }>('select id from users where email = $1', [
          email.student2,
        ])
      ).rows[0]?.id ?? '';
    const reportsBefore = await count('select count(*) n from lost_reports where tenant_id = $1', [
      ctx.tenantA,
    ]);
    const jobsBefore = await count(
      `select count(*) n from pgboss.job where name = 'match-lost-report'`,
    );
    const auditBefore = await count('select count(*) n from audit_events where tenant_id = $1', [
      ctx.tenantA,
    ]);

    const failingBoss: JobSender = {
      send: async (name, data, options) => {
        const id = await ctx.services.boss.send(name, data, options);
        throw new Error(`Simulated failure after queueing job ${String(id)}`);
      },
    };

    await expect(
      submitLostReport(
        { boss: failingBoss, crypto: ctx.services.crypto },
        {
          tenantId: ctx.tenantA,
          actor: { kind: 'user', userId, role: 'student', name: 'Sadia Rahman' },
          requestId: 'test',
          clock: ctx.clock,
          db: ctx.services.db,
        },
        validReport() as never,
      ),
    ).rejects.toThrow('Simulated failure after queueing job');

    expect(
      await count('select count(*) n from lost_reports where tenant_id = $1', [ctx.tenantA]),
    ).toBe(reportsBefore);
    expect(await count(`select count(*) n from pgboss.job where name = 'match-lost-report'`)).toBe(
      jobsBefore,
    );
    expect(
      await count('select count(*) n from audit_events where tenant_id = $1', [ctx.tenantA]),
    ).toBe(auditBefore);
  });

  it('leaves exactly one report and one job when it succeeds', async () => {
    const student = await ctx.as(email.student2);
    const reportsBefore = await count('select count(*) n from lost_reports where tenant_id = $1', [
      ctx.tenantA,
    ]);
    const jobsBefore = await count(
      `select count(*) n from pgboss.job where name = 'match-lost-report'`,
    );
    const res = await student.post<LostReportCreated>('/api/lost-reports', validReport());
    expect(res.status).toBe(201);
    expect(
      await count('select count(*) n from lost_reports where tenant_id = $1', [ctx.tenantA]),
    ).toBe(reportsBefore + 1);
    expect(await count(`select count(*) n from pgboss.job where name = 'match-lost-report'`)).toBe(
      jobsBefore + 1,
    );
  });
});

describe('GET /api/lost-reports and /api/lost-reports/{id}', () => {
  let reportId = '';
  beforeAll(async () => {
    const student = await ctx.as(email.student);
    reportId = (await student.post<LostReportCreated>('/api/lost-reports', validReport())).body
      .report.id;
  });

  it('lets the owner read it, typed in any case and without dashes', async () => {
    const student = await ctx.as(email.student);
    const res = await student.get<LostReport>(
      `/api/lost-reports/${reportId.replaceAll('-', '').toLowerCase()}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(reportId);
  });

  it('lets desk staff read it', async () => {
    expect((await (await ctx.as(email.desk)).get(`/api/lost-reports/${reportId}`)).status).toBe(
      200,
    );
    expect(
      (await (await ctx.as(email.supervisor)).get(`/api/lost-reports/${reportId}`)).status,
    ).toBe(200);
  });

  it('hides it from another student and from the IT admin', async () => {
    expect((await (await ctx.as(email.student2)).get(`/api/lost-reports/${reportId}`)).status).toBe(
      404,
    );
    expect((await (await ctx.as(email.itAdmin)).get(`/api/lost-reports/${reportId}`)).status).toBe(
      403,
    );
  });

  it('answers an invalid ID with a plain not-found message', async () => {
    const res = await (
      await ctx.as(email.student)
    ).get<{ error: { message: string } }>('/api/lost-reports/LST-2611-0001A');
    expect([404]).toContain(res.status);
    expect(res.body.error.message).toMatch(/report ID|find that report/);
  });

  it("lists only the signed-in person's own reports", async () => {
    const mine = await (
      await ctx.as(email.student)
    ).get<{ reports: LostReport[] }>('/api/lost-reports');
    expect(mine.status).toBe(200);
    expect(mine.body.reports.length).toBeGreaterThan(0);
    const owners = await ctx.owner.query<{ n: string }>(
      `select count(distinct owner_id) n from lost_reports where tenant_id = $1 and id = any($2)`,
      [ctx.tenantA, mine.body.reports.map((r) => r.id)],
    );
    expect(owners.rows[0]?.n).toBe('1');
  });
});
