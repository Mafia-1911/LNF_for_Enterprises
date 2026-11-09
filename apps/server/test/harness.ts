// API test harness (plan §5.3):
//  - a fresh database per test file, cloned from the template built in global-setup.ts
//  - the real app (createApp + createServices) with a test clock and in-memory email
//  - a client per person and host; every tenant-A response is checked by expectNoLeak
//  - every request's route is recorded for `pnpm check:routes`
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { expect } from 'vitest';
import { createApp } from '../src/app';
import { createTestClock, type AdjustableClock } from '../src/platform/clock';
import { parseConfig } from '../src/platform/config';
import { closeDatabase } from '../src/platform/db/pool';
import { ensureQueues } from '../src/platform/jobs';
import { createLogger } from '../src/platform/logger';
import { createServices, type Services } from '../src/services';
import { appUrl, ownerUrl, TEMPLATE_DB, testEnv } from './env';
import { HOST_A, HOST_B, ORIGIN, TENANT_B, TENANT_B_MARKER, TEST_NOW } from './fixtures';

export const COVERAGE_DIR = path.join(import.meta.dirname, '../.route-coverage');

export type ApiResponse<T = unknown> = { status: number; body: T; text: string; headers: Headers };

/**
 * Fails if anything that belongs only to tenant B appears in a response given to tenant A:
 * tenant B's id, its people's ids and emails, its place ids and the marker text on its report.
 * (Names, building codes and LST IDs overlap on purpose, so they are not markers.)
 */
export function expectNoLeak(text: string, markers: readonly string[]): void {
  for (const marker of markers) {
    expect(text, `tenant B data leaked into a tenant A response: ${marker}`).not.toContain(marker);
  }
}

export type TestContext = Awaited<ReturnType<typeof createTestContext>>;

export async function createTestContext() {
  const dbName = `lf_test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const admin = new pg.Client({ connectionString: ownerUrl('postgres') });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName} TEMPLATE ${TEMPLATE_DB} OWNER lf_owner`);
  await admin.query(`GRANT CONNECT ON DATABASE ${dbName} TO lf_app`);
  await admin.end();

  const clock: AdjustableClock = createTestClock(TEST_NOW);
  const config = parseConfig(testEnv(dbName));
  const services: Services = createServices(
    config,
    createLogger({ level: config.logLevel, pretty: false }),
    { clock },
  );
  await services.boss.start();
  await ensureQueues(services.boss, services.jobs);

  const routesHit = new Set<string>();
  const app = createApp(services, {
    webDist: null,
    jobsRunning: () => true,
    observe: ({ method, route }) => routesHit.add(`${method} ${route}`),
  });

  /** Owner connection to this file's database, for assertions about rows, jobs and privileges. */
  const owner = new pg.Pool({ connectionString: ownerUrl(dbName), max: 2 });
  /** App-role connection, for checking what the app itself may and may not do. */
  const appRole = new pg.Pool({ connectionString: appUrl(dbName), max: 2 });

  const tenantIds = await owner.query<{ slug: string; id: string }>('select slug, id from tenants');
  const tenantA = tenantIds.rows.find((r) => r.slug === 'nsu')?.id ?? '';
  const tenantB = tenantIds.rows.find((r) => r.slug === TENANT_B.slug)?.id ?? '';
  const markerRows = await owner.query<{ v: string }>(
    `select $1::text as v
     union all select u.id::text from users u join role_assignments r on r.user_id = u.id where r.tenant_id = $2
     union all select u.email from users u join role_assignments r on r.user_id = u.id where r.tenant_id = $2
     union all select id::text from buildings where tenant_id = $2
     union all select id::text from floors where tenant_id = $2
     union all select id::text from zones where tenant_id = $2`,
    [tenantB, tenantB],
  );
  const markersB = [...markerRows.rows.map((r) => r.v), TENANT_B_MARKER, TENANT_B.name];

  /** A person (or nobody) talking to one host. Keeps the session cookie between requests. */
  function client(opts: { host?: string } = {}) {
    const host = opts.host ?? HOST_A;
    const jar = new Map<string, string>();

    async function request<T = unknown>(
      method: string,
      url: string,
      body?: unknown,
      headers: Record<string, string> = {},
    ): Promise<ApiResponse<T>> {
      const h: Record<string, string> = { host, origin: ORIGIN, ...headers };
      if (jar.size) h['cookie'] = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      if (body !== undefined) h['content-type'] = 'application/json';
      const res = await app.request(url, {
        method,
        headers: h,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      for (const cookie of res.headers.getSetCookie()) {
        const [pair = ''] = cookie.split(';');
        const eq = pair.indexOf('=');
        const name = pair.slice(0, eq);
        const value = pair.slice(eq + 1);
        if (/max-age=0/i.test(cookie) || value === '') jar.delete(name);
        else jar.set(name, value);
      }
      const text = await res.text();
      if (host === HOST_A) expectNoLeak(text, markersB);
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        // Not JSON (for example a redirect); keep the text.
      }
      return { status: res.status, body: parsed as T, text, headers: res.headers };
    }

    return {
      host,
      get: <T = unknown>(url: string) => request<T>('GET', url),
      post: <T = unknown>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
      put: <T = unknown>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
      request,
      /** Dev-only "sign in as" (the same endpoint the prototype toolbar uses). */
      async signInAs(email: string) {
        const res = await request('POST', '/api/auth/dev/sign-in-as', { email });
        expect(res.status, `sign in as ${email}`).toBe(200);
        return this;
      },
    };
  }

  return {
    dbName,
    services,
    app,
    clock,
    owner,
    appRole,
    tenantA,
    tenantB,
    markersB,
    client,
    as: (email: string, host = HOST_A) => client({ host }).signInAs(email),
    anonymous: (host = HOST_A) => client({ host }),
    hosts: { A: HOST_A, B: HOST_B },
    async close() {
      mkdirSync(COVERAGE_DIR, { recursive: true });
      writeFileSync(
        path.join(COVERAGE_DIR, `${dbName}.json`),
        JSON.stringify([...routesHit].sort(), null, 2),
      );
      await services.boss.stop({ graceful: false, close: true });
      await closeDatabase(services.db);
      await owner.end();
      await appRole.end();
      const dropper = new pg.Client({ connectionString: ownerUrl('postgres') });
      await dropper.connect();
      await dropper.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await dropper.end();
    },
  };
}
