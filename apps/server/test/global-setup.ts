// Once per `vitest --project api` run: build a template database (migrations + two seeded tenants).
// Each test file then clones it (harness.ts), so tests never need to clean insert-only audit tables.
import { rmSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { createLogger } from '../src/platform/logger';
import { parseConfig } from '../src/platform/config';
import { runMigrations } from '../src/platform/db/migrate';
import { closeDatabase } from '../src/platform/db/pool';
import { createTestClock } from '../src/platform/clock';
import { seedTenant, PRACTICE_REPORTS } from '../src/seed';
import { createServices } from '../src/services';
import { ensureQueues } from '../src/platform/jobs';
import { submitLostReport } from '../src/modules/items';
import { MEMBERS_A, MEMBERS_B, TENANT_A, TENANT_B, TENANT_B_MARKER, TEST_NOW } from './fixtures';
import { ownerUrl, TEMPLATE_DB, testEnv } from './env';

export default async function setup(): Promise<void> {
  // Route coverage is rebuilt from scratch on every run (scripts/check-route-coverage.ts).
  rmSync(path.join(import.meta.dirname, '../.route-coverage'), { recursive: true, force: true });

  const admin = new pg.Client({ connectionString: ownerUrl('postgres') });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(
      'API tests need the local Postgres; start it with: docker compose -f infra/docker-compose.dev.yml up -d',
      { cause: err },
    );
  }
  await admin.query(`DROP DATABASE IF EXISTS ${TEMPLATE_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEMPLATE_DB} OWNER lf_owner`);
  await admin.query(`GRANT CONNECT ON DATABASE ${TEMPLATE_DB} TO lf_app`);
  await admin.end();

  await runMigrations(ownerUrl(TEMPLATE_DB), path.join(import.meta.dirname, '../migrations'));

  const clock = createTestClock(TEST_NOW);
  const services = createServices(
    parseConfig(testEnv(TEMPLATE_DB)),
    createLogger({ level: 'silent', pretty: false }),
    { clock },
  );
  try {
    const a = await seedTenant(services.db, clock, TENANT_A, MEMBERS_A);
    const b = await seedTenant(services.db, clock, TENANT_B, MEMBERS_B);
    await services.boss.start();
    await ensureQueues(services.boss, services.jobs);
    // One report per tenant: both get the same ID (LST-2611-0001…). Tenant B's carries the marker.
    const [first] = PRACTICE_REPORTS;
    if (!first) throw new Error('No practice report to seed');
    const from = new Date(new Date(TEST_NOW).getTime() - 2 * 60 * 60 * 1000).toISOString();
    for (const [tenant, members, marker] of [
      [a, MEMBERS_A, 'Seeded in tenant A'],
      [b, MEMBERS_B, TENANT_B_MARKER],
    ] as const) {
      const studentEmail = members[0]?.email ?? '';
      const userId = tenant.members.get(studentEmail) ?? '';
      await submitLostReport(
        { boss: services.boss, crypto: services.crypto },
        {
          tenantId: tenant.tenantId,
          actor: { kind: 'user', userId, role: 'student', name: 'Rafiq Ahmed' },
          requestId: 'seed',
          clock,
          db: services.db,
        },
        {
          ...first,
          publicDescription: marker,
          privateNote: `${marker} private`,
          timeFrom: from,
          timeTo: TEST_NOW,
        },
      );
    }
  } finally {
    await services.boss.stop({ graceful: false, close: true });
    await closeDatabase(services.db);
  }
}
