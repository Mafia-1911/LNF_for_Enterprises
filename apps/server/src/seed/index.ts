// Idempotent seed (scripts/seed.ts and `pnpm dev`): tenants, catalog, people, holidays and the
// practice-mode dataset. Connects as the app role, like the running app.
import { randomUUID } from 'node:crypto';
import type { CreateLostReportParsed } from '@lf/contracts';
import { insertHolidayIfMissing } from '../platform/calendar';
import { createOffsetClock } from '../platform/clock';
import { loadDotEnv, parseConfig } from '../platform/config';
import { closeDatabase } from '../platform/db/pool';
import { withTx } from '../platform/db/tx';
import type { DatabaseHandle, RequestCtx } from '../platform/db/types';
import { ensureQueues } from '../platform/jobs';
import { createLogger } from '../platform/logger';
import { upsertTenant } from '../platform/tenancy';
import { seedCatalog } from '../modules/catalog';
import { seedMember, type MemberSeed } from '../modules/identity';
import { listMyLostReports, submitLostReport } from '../modules/items';
import { createServices } from '../services';
import { NSU_CATALOG, NSU_HOLIDAYS, NSU_MEMBERS, NSU_PRACTICE_TENANT, NSU_TENANT } from './data';

type SeedTenant = typeof NSU_TENANT;

export async function seedTenant(
  db: DatabaseHandle,
  clock: RequestCtx['clock'],
  tenant: SeedTenant,
  people: readonly MemberSeed[] = NSU_MEMBERS,
): Promise<{ tenantId: string; members: Map<string, string> }> {
  const tenantId = await upsertTenant(db, tenant);
  const ctx: RequestCtx = {
    tenantId,
    actor: { kind: 'system', job: 'seed' },
    requestId: 'seed',
    clock,
    db,
  };
  const members = new Map<string, string>();
  await withTx(ctx, async (tx) => {
    await seedCatalog(tx, NSU_CATALOG);
    for (const m of people) members.set(m.email, await seedMember(tx, m, randomUUID));
    for (const h of NSU_HOLIDAYS) await insertHolidayIfMissing(tx, h);
  });
  return { tenantId, members };
}

/** Sample lost reports for practice mode, filed through the real service (audit + jobs included). */
export const PRACTICE_REPORTS: Omit<CreateLostReportParsed, 'timeFrom' | 'timeTo'>[] = [
  {
    category: 'bag',
    colour: 'black',
    shortName: 'Black backpack with yellow logo',
    brand: 'Herschel',
    publicDescription: 'Laptop sleeve inside, keychain on the zip.',
    privateNote: 'Name tag inside the front pocket.',
    place: { buildingCode: 'LIB', floorId: null, zoneId: null },
  },
  {
    category: 'bottle',
    colour: 'green',
    shortName: 'Green metal water bottle',
    brand: null,
    publicDescription: 'Dented near the bottom.',
    privateNote: null,
    place: { buildingCode: 'GYM', floorId: null, zoneId: null },
  },
  {
    category: 'keys',
    colour: 'silver',
    shortName: 'Car keys with Toyota fob',
    brand: 'Toyota',
    publicDescription: null,
    privateNote: 'Blue rubber ring on the key.',
    place: { buildingCode: null, floorId: null, zoneId: null },
  },
];

export async function runSeed(): Promise<string> {
  loadDotEnv();
  const config = parseConfig(process.env);
  const logger = createLogger({ level: 'warn', pretty: false });
  const services = createServices({ ...config, devTools: false }, logger, {
    clock: createOffsetClock(),
  });
  try {
    await seedTenant(services.db, services.clock, NSU_TENANT);
    const practice = await seedTenant(services.db, services.clock, NSU_PRACTICE_TENANT);

    const studentId = practice.members.get('rafiq.ahmed@northsouth.edu');
    if (!studentId) throw new Error('Practice student missing from seed.');
    const studentCtx: RequestCtx = {
      tenantId: practice.tenantId,
      actor: { kind: 'user', userId: studentId, role: 'student', name: 'Rafiq Ahmed' },
      requestId: 'seed-practice',
      clock: services.clock,
      db: services.db,
    };
    let created = 0;
    if ((await listMyLostReports(studentCtx)).length === 0) {
      await services.boss.start();
      await ensureQueues(services.boss, services.jobs);
      const to = services.clock.now();
      const from = new Date(to.getTime() - 3 * 60 * 60 * 1000);
      for (const r of PRACTICE_REPORTS) {
        await submitLostReport({ boss: services.boss, crypto: services.crypto }, studentCtx, {
          ...r,
          timeFrom: from.toISOString(),
          timeTo: to.toISOString(),
        });
        created += 1;
      }
      await services.boss.stop({ graceful: false, close: true });
    }
    return `2 tenants, ${NSU_MEMBERS.length} people each${created ? `, ${created} practice reports` : ''}`;
  } finally {
    await closeDatabase(services.db);
  }
}
