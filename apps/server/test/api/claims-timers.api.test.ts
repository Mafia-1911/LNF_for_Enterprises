// Pickup window (WF-04, CC-11): one reminder a day before, then the claim lapses and the item goes
// back on the shelf; the owner may re-request once. Uses the test clock.
import type { AlertList, Claim, ClaimStart, DeskItemClaims, LoggedFoundItem } from '@lf/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runPickupTimer } from '../../src/modules/claims';
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

const timer = () =>
  runPickupTimer(
    {
      boss: ctx.services.boss,
      crypto: ctx.services.crypto,
      appOrigin: ctx.services.config.appOrigin,
    },
    {
      tenantId: ctx.tenantA,
      actor: { kind: 'system', job: 'pickup-window-timer' },
      requestId: 'test',
      clock: ctx.clock,
      db: ctx.services.db,
    },
  );

describe('pickup window', () => {
  it('reminds, lapses, returns the item to the shelf, and allows one re-request', async () => {
    const desk = await ctx.as(email.desk);
    const logged = await desk.post<LoggedFoundItem>('/api/desk/found-items', {
      category: 'umbrella',
      colour: 'black',
      shortName: 'Black umbrella',
      brand: null,
      model: null,
      publicDescription: null,
      place: { buildingCode: 'PLZ', floorId: null, zoneId: null },
      foundAt: new Date(new Date(TEST_NOW).getTime() - 3_600_000).toISOString(),
      privateTicks: ['marks'],
      privateNote: null,
      photoIds: [],
      condition: null,
      conditionPhotoIds: [],
      binCode: 'B-01',
      idNumber: null,
    });
    const itemId = logged.body.item.id;
    const student = await ctx.as(email.student);
    const start = await student.get<ClaimStart>(`/api/found-items/${itemId}/claim`);
    const c = await student.post<Claim>(`/api/found-items/${itemId}/claims`, {
      answers: start.body.questions.map((q) => ({ key: q.key, answer: 'A bent spoke' })),
    });
    const side = await desk.get<DeskItemClaims>(`/api/desk/found-items/${itemId}/claims`);
    const verdicts = Object.fromEntries(
      (side.body.claims[0]?.answers ?? []).map((a) => [a.key, 'pass']),
    );
    await desk.post(`/api/desk/claims/${c.body.id}/review`, {
      verdicts,
      decision: 'approve',
      note: null,
    });
    const approved = await student.get<Claim>(`/api/claims/${c.body.id}`);
    // Sunday 8 Nov → 3 working days → Wednesday 11 Nov, 17:00 Dhaka.
    expect(approved.body.pickupEndsAt).toBe('2026-11-11T11:00:00.000Z');

    expect(await timer()).toEqual({ reminded: 0, lapsed: 0 });
    ctx.clock.advance(2 * DAY_MS + 3_600_000);
    expect(await timer()).toEqual({ reminded: 1, lapsed: 0 });
    expect(await timer()).toEqual({ reminded: 0, lapsed: 0 });
    ctx.clock.advance(DAY_MS);
    expect(await timer()).toEqual({ reminded: 0, lapsed: 1 });

    const lapsed = await student.get<Claim>(`/api/claims/${c.body.id}`);
    expect(lapsed.body).toMatchObject({ state: 'LAPSED', pickupCode: null, canReRequest: true });
    const alerts = await student.get<AlertList>('/api/alerts');
    expect(alerts.body.alerts.map((a) => a.title)).toEqual(
      expect.arrayContaining(['Your pickup window closes soon', 'Your pickup window closed']),
    );
    const item = await ctx.owner.query<{ state: string }>(
      'select state from found_items where tenant_id = $1 and id = $2',
      [ctx.tenantA, itemId],
    );
    expect(item.rows[0]?.state).toBe('IN_CUSTODY');

    const again = await student.post<Claim>(`/api/claims/${c.body.id}/re-request`, {});
    expect(again.body.state).toBe('SUBMITTED');
    expect(again.body.canReRequest).toBe(false);
  });
});
