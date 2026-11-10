// Hand-in timer (WF-02, CC-03): reminder at 24 h, NOT_RECEIVED at 48 h, pinged owners told, and the
// desk can still receive a late item (NOT_RECEIVED "can be reopened"). Uses the test clock.
import type { AlertList, FoundPost, LoggedFoundItem } from '@lf/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runHandInTimer } from '../../src/modules/items';
import { DAY_MS, HOUR_MS } from '../../src/platform/clock';
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

function runTimer() {
  return runHandInTimer(
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
}

describe('hand-in timer', () => {
  it('reminds the finder at 24 h, then marks the post NOT_RECEIVED at 48 h and tells pinged owners', async () => {
    const { rows } = await ctx.owner.query<{ id: string }>(
      `select id from lost_reports where tenant_id = $1 and category = 'bag' limit 1`,
      [ctx.tenantA],
    );
    const finder = await ctx.as(email.student2);
    const post = await finder.post<FoundPost>('/api/found-items', {
      category: 'bag',
      colour: 'black',
      shortName: 'Black bag',
      brand: null,
      model: null,
      publicDescription: null,
      place: { buildingCode: 'LIB', floorId: null, zoneId: null },
      foundAt: new Date(new Date(TEST_NOW).getTime() - HOUR_MS).toISOString(),
      privateTicks: [],
      privateNote: null,
      photoIds: [],
      pingReportIds: [rows[0]?.id ?? ''],
    });
    expect(post.status).toBe(201);

    expect(await runTimer()).toEqual({ reminded: 0, notReceived: 0 });
    ctx.clock.advance(25 * HOUR_MS);
    expect(await runTimer()).toEqual({ reminded: 1, notReceived: 0 });
    expect(await runTimer()).toEqual({ reminded: 0, notReceived: 0 });
    const reminders = await finder.get<AlertList>('/api/alerts');
    expect(reminders.body.alerts.some((a) => a.kind === 'hand_in_reminder')).toBe(true);

    ctx.clock.advance(DAY_MS);
    expect(await runTimer()).toEqual({ reminded: 0, notReceived: 1 });
    const mine = await finder.get<FoundPost>(`/api/found-items/${post.body.id}`);
    expect(mine.body.state).toBe('NOT_RECEIVED');
    const owner = await ctx.as(email.student);
    const told = await owner.get<AlertList>('/api/alerts');
    expect(told.body.alerts.some((a) => a.kind === 'item_not_received')).toBe(true);

    // Brought in late: the desk reopens and receives it in one step.
    const desk = await ctx.as(email.desk);
    const late = await desk.post<LoggedFoundItem>(`/api/desk/found-items/${post.body.id}/receive`, {
      category: 'bag',
      colour: 'black',
      shortName: 'Black bag',
      brand: null,
      model: null,
      publicDescription: null,
      place: { buildingCode: 'LIB', floorId: null, zoneId: null },
      foundAt: new Date(new Date(TEST_NOW).getTime() - HOUR_MS).toISOString(),
      privateTicks: [],
      privateNote: null,
      photoIds: [],
      condition: null,
      conditionPhotoIds: [],
      binCode: 'B-07',
      idNumber: null,
    });
    expect(late.status).toBe(200);
    expect(late.body.item.state).toBe('IN_CUSTODY');
    expect(late.body.item.history.map((h) => h.event)).toEqual([
      'POST',
      'MARK_NOT_RECEIVED',
      'REOPEN',
      'RECEIVE_AT_DESK',
    ]);
  });
});
