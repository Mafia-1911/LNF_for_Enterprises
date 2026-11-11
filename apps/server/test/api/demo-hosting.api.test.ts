// The pieces the public demo on Vercel relies on (docs/deploy-vercel.md): photos stored in Postgres
// (STORAGE_DRIVER=database), and queued jobs and timers run by drainJobs/sendDueSchedules instead
// of long-running pg-boss workers. Two tenants.
import type { LostReportCreated } from '@lf/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drainJobs, sendDueSchedules } from '../../src/platform/jobs';
import { createDatabaseStorage } from '../../src/platform/storage';
import { createTestContext, type TestContext } from '../harness';
import { email, TEST_NOW } from '../fixtures';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

describe('database storage driver', () => {
  it('keeps each tenant’s objects apart and reads back exactly what was written', async () => {
    const storage = createDatabaseStorage(ctx.services.db);
    const keyA = `${ctx.tenantA}/photos/demo.webp`;
    const keyB = `${ctx.tenantB}/photos/demo.webp`;
    await storage.put(keyA, new Uint8Array([1, 2, 3]), 'image/webp');
    await storage.put(keyB, new Uint8Array([9]), 'image/webp');
    expect(await storage.get(keyA)).toEqual(new Uint8Array([1, 2, 3]));
    await storage.put(keyA, new Uint8Array([4, 5]), 'image/webp');
    expect(await storage.get(keyA)).toEqual(new Uint8Array([4, 5]));
    expect(await storage.get(keyB)).toEqual(new Uint8Array([9]));

    const rows = await ctx.owner.query<{ tenant_id: string }>(
      'select tenant_id from stored_objects where key = $1',
      [keyA],
    );
    expect(rows.rows).toEqual([{ tenant_id: ctx.tenantA }]);

    await storage.delete(keyA);
    expect(await storage.get(keyA)).toBeNull();
    expect(await storage.get(keyB)).toEqual(new Uint8Array([9]));
    expect(await storage.healthCheck()).toBe(true);
    await expect(storage.put('photos/no-tenant.webp', new Uint8Array([1]), 'x')).rejects.toThrow(
      /start with a tenant id/,
    );
  });
});

describe('serverless job runner', () => {
  it('runs the jobs a request queued, so matching works without workers', async () => {
    const student = await ctx.as(email.student);
    const res = await student.post<LostReportCreated>('/api/lost-reports', {
      category: 'wallet',
      colour: 'brown',
      shortName: 'Brown wallet',
      brand: null,
      publicDescription: null,
      privateNote: null,
      place: { buildingCode: 'LIB', floorId: null, zoneId: null },
      timeFrom: new Date(new Date(TEST_NOW).getTime() - 5 * 3_600_000).toISOString(),
      timeTo: new Date(new Date(TEST_NOW).getTime() - 3 * 3_600_000).toISOString(),
    });
    expect(res.status).toBe(201);
    const state = async () =>
      (
        await ctx.owner.query<{ state: string }>(
          `select state from pgboss.job where name = 'match-lost-report' and data->>'reportId' = $1`,
          [res.body.report.id],
        )
      ).rows.map((r) => r.state);
    expect(await state()).toEqual(['created']);

    const ran = await drainJobs(ctx.services.boss, ctx.services.jobs, {
      budgetMs: 20_000,
      now: () => ctx.clock.now().getTime() + performance.now(),
      logger: ctx.services.logger,
    });
    expect(ran).toBeGreaterThanOrEqual(1);
    expect(await state()).toEqual(['completed']);
  });

  it('queues each timer once per period however often it is asked', async () => {
    const scheduled = ctx.services.jobs.filter((j) => j.cron).map((j) => j.name);
    expect(scheduled.length).toBeGreaterThan(0);
    const count = async () =>
      Number(
        (
          await ctx.owner.query<{ n: string }>(
            `select count(*) n from pgboss.job where name = any($1) and singleton_key = 'schedule'`,
            [scheduled],
          )
        ).rows[0]?.n,
      );
    await sendDueSchedules(ctx.services.boss, ctx.services.jobs);
    expect(await count()).toBe(scheduled.length);
    await sendDueSchedules(ctx.services.boss, ctx.services.jobs);
    expect(await count()).toBe(scheduled.length);
  });
});
