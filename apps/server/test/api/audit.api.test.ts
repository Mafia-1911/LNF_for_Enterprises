// Insert-only audit log with membership checkpoints (FR-14, plan §5.4, ADR-0006).
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AUDIT_CHECKPOINT_JOB,
  createCheckpoint,
  NO_TENANT,
  verifyAuditChain,
} from '../../src/modules/audit';
import type { RequestCtx } from '../../src/platform/db/types';
import { superUrl } from '../env';
import { email } from '../fixtures';
import { createTestContext, type TestContext } from '../harness';

let ctx: TestContext;
let system: RequestCtx;
beforeAll(async () => {
  ctx = await createTestContext();
  system = {
    tenantId: NO_TENANT,
    actor: { kind: 'system', job: 'test' },
    requestId: 'test',
    clock: ctx.clock,
    db: ctx.services.db,
  };
});
afterAll(async () => {
  await ctx.close();
});

async function seededReportId(tenantId: string): Promise<string> {
  return (
    (
      await ctx.owner.query<{ id: string }>(
        'select id from lost_reports where tenant_id = $1 order by created_at limit 1',
        [tenantId],
      )
    ).rows[0]?.id ?? ''
  );
}

describe('GET /api/audit/{recordType}/{recordId}', () => {
  it("shows a supervisor the record's trail, only from their own university", async () => {
    const id = await seededReportId(ctx.tenantA);
    // Tenant B has a report with the very same ID; its events must not appear.
    expect(await seededReportId(ctx.tenantB)).toBe(id);
    const res = await (
      await ctx.as(email.supervisor)
    ).get<{ events: { event: string; toState: string }[] }>(`/api/audit/lost_report/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.events.map((e) => [e.event, e.toState])).toEqual([['SUBMIT', 'OPEN']]);
  });

  it('is for supervisors only', async () => {
    const id = await seededReportId(ctx.tenantA);
    expect((await (await ctx.as(email.desk)).get(`/api/audit/lost_report/${id}`)).status).toBe(403);
    expect((await ctx.anonymous().get(`/api/audit/lost_report/${id}`)).status).toBe(401);
  });

  it('validates the record type', async () => {
    expect((await (await ctx.as(email.supervisor)).get('/api/audit/spaceship/1')).status).toBe(400);
  });
});

describe('audit tables are insert-only', () => {
  it.each(['audit_events', 'audit_checkpoints', 'audit_checkpoint_events'])(
    'the app role may not UPDATE, DELETE or TRUNCATE %s',
    async (table) => {
      for (const sql of [
        `update ${table} set ${table === 'audit_checkpoint_events' ? 'checkpoint_id = checkpoint_id' : 'id = id'}`,
        `delete from ${table}`,
        `truncate ${table}`,
      ]) {
        await expect(ctx.appRole.query(sql)).rejects.toMatchObject({ code: '42501' });
      }
    },
  );

  it('triggers stop even the owner from changing or removing events', async () => {
    await expect(ctx.owner.query(`update audit_events set note = 'edited'`)).rejects.toThrow(
      'UPDATE on audit_events is not allowed: this table is insert-only',
    );
    await expect(ctx.owner.query('delete from audit_events')).rejects.toThrow(
      'DELETE on audit_events is not allowed',
    );
    await expect(ctx.owner.query('truncate audit_events cascade')).rejects.toThrow(
      'TRUNCATE on audit_events is not allowed',
    );
  });
});

describe('checkpoints', () => {
  it('cover every event exactly once and chain to the previous checkpoint', async () => {
    const first = await createCheckpoint(system);
    expect(first?.eventCount).toBeGreaterThan(0);
    expect(await createCheckpoint(system)).toBeNull(); // nothing new

    await (
      await ctx.as(email.student)
    ).post('/api/lost-reports', {
      category: 'umbrella',
      colour: 'black',
      shortName: null,
      brand: null,
      publicDescription: null,
      privateNote: null,
      place: { buildingCode: null, floorId: null, zoneId: null },
      timeFrom: '2026-11-08T09:00:00.000Z',
      timeTo: '2026-11-08T10:00:00.000Z',
    });
    const second = await createCheckpoint(system);
    expect(second?.eventCount).toBe(1);

    const orphans = await ctx.owner.query(
      'select e.id from audit_events e left join audit_checkpoint_events m on m.event_id = e.id where m.event_id is null',
    );
    expect(orphans.rows).toEqual([]);
    expect(await verifyAuditChain(system)).toMatchObject({ ok: true });
  });

  it('puts an event that commits late into the next checkpoint instead of missing it', async () => {
    const late = new pg.Client({ connectionString: superUrl(ctx.dbName) });
    await late.connect();
    try {
      await late.query('begin');
      // Takes an id now but commits after a later event (out-of-order commit).
      await late.query(
        `insert into audit_events (tenant_id, record_type, record_id, actor_kind, event, at) values ($1, 'lost_report', 'LATE', 'system:test', 'NOTE', now())`,
        [ctx.tenantA],
      );
      await ctx.owner.query(
        `insert into audit_events (tenant_id, record_type, record_id, actor_kind, event, at) values ($1, 'lost_report', 'EARLY', 'system:test', 'NOTE', now())`,
        [ctx.tenantA],
      );
      expect((await createCheckpoint(system))?.eventCount).toBe(1); // only EARLY is visible
      await late.query('commit');
    } finally {
      await late.end();
    }
    expect((await createCheckpoint(system))?.eventCount).toBe(1); // LATE lands here
    const covered = await ctx.owner.query<{ record_id: string; n: string }>(
      `select e.record_id, count(m.checkpoint_id) n from audit_events e join audit_checkpoint_events m on m.event_id = e.id
       where e.record_id in ('LATE', 'EARLY') group by e.record_id order by e.record_id`,
    );
    expect(covered.rows).toEqual([
      { record_id: 'EARLY', n: '1' },
      { record_id: 'LATE', n: '1' },
    ]);
    expect(await verifyAuditChain(system)).toMatchObject({ ok: true });
  });

  it('runs as the hourly job', async () => {
    await ctx.owner.query(
      `insert into audit_events (tenant_id, record_type, record_id, actor_kind, event, at) values ($1, 'policy', 'job-test', 'system:test', 'NOTE', now())`,
      [ctx.tenantA],
    );
    const job = ctx.services.jobs.find((j) => j.name === AUDIT_CHECKPOINT_JOB);
    expect(job?.cron).toBe('0 * * * *');
    await job?.handler([{ id: 'test-job', name: 'audit-checkpoint', data: {} } as never]);
    const { rows } = await ctx.owner.query(
      `select 1 from audit_checkpoint_events m join audit_events e on e.id = m.event_id where e.record_id = 'job-test'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('lets verify-audit catch a DBA who edits an event behind the triggers', async () => {
    const dba = new pg.Client({ connectionString: superUrl(ctx.dbName) });
    await dba.connect();
    try {
      await dba.query('alter table audit_events disable trigger audit_events_insert_only');
      await dba.query(
        `update audit_events set note = 'rewritten history' where id = (select min(id) from audit_events)`,
      );
      await dba.query('alter table audit_events enable trigger audit_events_insert_only');
    } finally {
      await dba.end();
    }
    const result = await verifyAuditChain(system);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.problems[0]).toMatch(/^Checkpoint \d+ hash does not match its events\.$/);
  });
});
