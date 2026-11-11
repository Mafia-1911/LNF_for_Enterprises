// Phase 4c: outage label sheets (NF-04, CC-17), the paper register import (WF-07, NF-05) and the
// loss hotspot report (NF-07). Two tenants; uses the test clock.
import type { DeskFoundItem, HotspotReport, LoggedFoundItem, OutageSheet } from '@lf/contracts';
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

const hoursAgo = (h: number) =>
  new Date(new Date(TEST_NOW).getTime() - h * 3_600_000).toISOString();

const intake = (overrides: Record<string, unknown>) => ({
  category: 'bottle',
  colour: 'blue',
  shortName: 'Blue bottle',
  brand: null,
  model: null,
  publicDescription: null,
  place: { buildingCode: 'LIB', floorId: null, zoneId: null },
  foundAt: hoursAgo(3),
  privateTicks: [],
  privateNote: null,
  photoIds: [],
  condition: null,
  conditionPhotoIds: [],
  binCode: 'B-01',
  idNumber: null,
  ...overrides,
});

describe('outage label sheets', () => {
  it('reserves IDs, enters a paper-tagged item under its ID with the original time', async () => {
    const desk = await ctx.as(email.desk);
    expect((await desk.get<OutageSheet>('/api/desk/outage-sheet')).body.labels).toEqual([]);
    const sheet = await desk.post<OutageSheet>('/api/desk/outage-sheet', { count: 3 });
    expect(sheet.status).toBe(201);
    expect(sheet.body.labels).toHaveLength(3);
    const [first] = sheet.body.labels;
    expect(first?.id).toMatch(/^FND-2611-\d{4}[A-Z]$/);
    expect(first?.qrDataUri.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect((await desk.post('/api/desk/outage-sheet', { count: 0 })).status).toBe(400);

    const future = await desk.post('/api/desk/found-items', {
      ...intake({
        reservedId: first?.id,
        intakeAt: new Date(Date.parse(TEST_NOW) + 3_600_000).toISOString(),
      }),
    });
    expect(future.status).toBe(400);

    // Reserved "now" in test time; tagged 10 minutes later, entered after the outage.
    ctx.clock.advance(2 * 3_600_000);
    const taggedAt = new Date(Date.parse(TEST_NOW) + 10 * 60_000).toISOString();
    const logged = await desk.post<LoggedFoundItem>('/api/desk/found-items', {
      ...intake({ reservedId: first?.id.toLowerCase(), intakeAt: taggedAt }),
    });
    expect(logged.status).toBe(201);
    expect(logged.body.item.id).toBe(first?.id);
    expect(logged.body.label.date).toBe(taggedAt);
    const again = await desk.post('/api/desk/found-items', {
      ...intake({ reservedId: first?.id, intakeAt: taggedAt }),
    });
    expect(again.status).toBe(400);
    expect((await desk.get<OutageSheet>('/api/desk/outage-sheet')).body.labels).toHaveLength(2);
    ctx.clock.reset();

    expect((await (await ctx.as(email.student)).get('/api/desk/outage-sheet')).status).toBe(403);
  });
});

describe('paper register import', () => {
  it('imports logbook rows as migrated items in custody from their logbook date', async () => {
    const sup = await ctx.as(email.supervisor);
    const bad = await sup.post<{ error: { fields: Record<string, string> } }>(
      '/api/supervisor/register/import',
      {
        rows: [
          {
            date: '2026-10-01',
            shortName: 'Blue bottle',
            category: 'not-a-category',
            colour: null,
            buildingCode: null,
            binCode: null,
            note: null,
          },
        ],
      },
    );
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields)).toContain('rows.0.category');

    const res = await sup.post<{ ids: string[] }>('/api/supervisor/register/import', {
      rows: [
        {
          date: '2026-10-01',
          shortName: 'Blue bottle',
          category: 'bottle',
          colour: 'blue',
          buildingCode: 'LIB',
          binCode: 'A-01',
          note: 'Logbook p. 12, left by the reading hall',
        },
        {
          date: '2026-11-02',
          shortName: 'Black umbrella',
          category: 'umbrella',
          colour: 'black',
          buildingCode: null,
          binCode: null,
          note: null,
        },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.ids).toHaveLength(2);
    const item = await (
      await ctx.as(email.desk)
    ).get<DeskFoundItem>(`/api/desk/found-items/${res.body.ids[0] ?? ''}`);
    expect(item.body).toMatchObject({ state: 'IN_CUSTODY' });
    expect(item.body.sourceLabel).toMatch(/^Migrated from the paper register/);
    expect(item.body.foundAt).toBe('2026-10-01T06:00:00.000Z');
    expect(
      (await (await ctx.as(email.desk)).post('/api/supervisor/register/import', { rows: [] }))
        .status,
    ).toBe(403);
    expect((await sup.post('/api/supervisor/register/import', { rows: [] })).status).toBe(400);
  });
});

describe('loss hotspots', () => {
  it('counts records by building, floor, hour and category', async () => {
    const sup = await ctx.as(email.supervisor);
    await (await ctx.as(email.desk)).post('/api/desk/found-items', intake({}));
    const res = await sup.get<HotspotReport>('/api/supervisor/reports/hotspots?days=30');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.byHour).toHaveLength(24);
    expect(res.body.byBuilding.map((b) => b.label)).toContain('Library');
    expect(res.body.byCategory.map((c) => c.label)).toContain('Bottle');
    expect((await sup.get('/api/supervisor/reports/hotspots?days=7')).status).toBe(400);
    expect((await (await ctx.as(email.desk)).get('/api/supervisor/reports/hotspots')).status).toBe(
      403,
    );
  });
});
