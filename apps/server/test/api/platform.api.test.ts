// /healthz, the OpenAPI document, security headers, dev-only routes and the match job.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { MATCH_LOST_REPORT_JOB } from '../../src/modules/matching';
import { closeDatabase } from '../../src/platform/db/pool';
import { startWorkers } from '../../src/platform/jobs';
import { createServices } from '../../src/services';
import { email, TEST_NOW } from '../fixtures';
import { createTestContext, type TestContext } from '../harness';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

describe('health and API document', () => {
  it('reports database and job health', async () => {
    const res = await ctx
      .anonymous()
      .get<{ status: string; database: boolean; jobs: boolean }>('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: true, jobs: true });
  });

  it('serves the OpenAPI 3.1 document with every API route', async () => {
    const res = await ctx
      .anonymous()
      .get<{ openapi: string; paths: Record<string, unknown> }>('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/lost-reports',
        '/api/lost-reports/{id}',
        '/api/me',
        '/api/catalog',
        '/api/tenant',
      ]),
    );
  });

  it('answers unknown API paths with a JSON not-found message', async () => {
    const res = await ctx.anonymous().get<{ error: { kind: string } }>('/api/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body.error.kind).toBe('not_found');
  });

  it('reports no session for a signed-out browser', async () => {
    const res = await ctx.anonymous().get('/api/auth/get-session');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

describe('security headers and request limits', () => {
  it('sends CSP with frame-ancestors none, X-Frame-Options and a request id; no HSTS outside production', async () => {
    const res = await ctx.anonymous().get('/api/tenant');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get('strict-transport-security')).toBeNull();
  });

  it('allows CORS only for the app origin', async () => {
    const ok = await ctx
      .anonymous()
      .request('GET', '/api/tenant', undefined, { origin: 'http://nsu.test' });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://nsu.test');
    const other = await ctx
      .anonymous()
      .request('GET', '/api/tenant', undefined, { origin: 'https://evil.example' });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects form posts from another origin (CSRF)', async () => {
    const res = await ctx
      .anonymous()
      .request('POST', '/api/lost-reports', undefined, {
        origin: 'https://evil.example',
        'content-type': 'application/x-www-form-urlencoded',
      });
    expect(res.status).toBe(403);
  });

  it('rejects bodies over 1 MB with a plain message', async () => {
    const student = await ctx.as(email.student);
    const res = await student.post<{ error: { message: string } }>('/api/lost-reports', {
      publicDescription: 'x'.repeat(1_100_000),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(
      'That request is too large; shorten the text and try again.',
    );
  });
});

describe('dev tools (time travel and the dev SMS page)', () => {
  it('reads, moves and resets the server clock', async () => {
    const c = ctx.anonymous();
    expect((await c.get<{ now: string }>('/api/dev/clock')).body.now).toBe(TEST_NOW);
    const moved = await c.post<{ now: string; offsetMs: number }>('/api/dev/clock', {
      advanceMs: 3_600_000,
    });
    expect(moved.body).toEqual({ now: '2026-11-08T11:39:00.000Z', offsetMs: 3_600_000 });
    expect((await c.post<{ now: string }>('/api/dev/clock', { reset: true })).body.now).toBe(
      TEST_NOW,
    );
    expect((await c.post('/api/dev/clock', { advanceMs: -5 })).status).toBe(400);
  });

  it('lists messages the dev SMS adapter would have sent', async () => {
    await ctx.services.sms.send(
      '+8801700000001',
      'Your NSU Lost & Found code is 123456. It expires in 5 minutes.',
    );
    const res = await ctx
      .anonymous()
      .get<{ messages: { to: string; body: string }[] }>('/api/dev/sms');
    expect(res.status).toBe(200);
    expect(res.body.messages[0]).toMatchObject({ to: '+8801700000001' });
  });

  it('does not exist when dev tools are off', async () => {
    const services = createServices(
      { ...ctx.services.config, devTools: false },
      ctx.services.logger,
    );
    try {
      const app = createApp(services, { webDist: null, jobsRunning: () => true });
      const res = await app.request('/api/dev/clock', { headers: { host: 'nsu.test' } });
      expect(res.status).toBe(404);
    } finally {
      await closeDatabase(services.db);
    }
  });
});

describe('match-lost-report job', () => {
  it('is picked up by a worker after the report commits and records a match run', async () => {
    await startWorkers(
      ctx.services.boss,
      ctx.services.jobs.filter((j) => j.name === MATCH_LOST_REPORT_JOB),
    );
    const student = await ctx.as(email.student);
    const res = await student.post<{ report: { id: string } }>('/api/lost-reports', {
      category: 'wallet',
      colour: 'brown',
      shortName: 'Brown leather wallet',
      brand: null,
      publicDescription: null,
      privateNote: null,
      place: { buildingCode: 'PLZ', floorId: null, zoneId: null },
      timeFrom: '2026-11-08T08:00:00.000Z',
      timeTo: TEST_NOW,
    });
    const id = res.body.report.id;
    let runs = 0;
    for (let i = 0; i < 40 && runs === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      runs = Number(
        (
          await ctx.owner.query<{ n: string }>(
            'select count(*) n from match_runs where tenant_id = $1 and record_id = $2',
            [ctx.tenantA, id],
          )
        ).rows[0]?.n,
      );
    }
    expect(runs).toBe(1);
  });
});
