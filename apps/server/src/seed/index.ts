// Idempotent seed (scripts/seed.ts and `pnpm dev`): tenants, catalog, people, holidays and the
// practice-mode dataset. Connects as the app role, like the running app.
import { randomUUID } from 'node:crypto';
import type {
  CreateFoundPostParsed,
  CreateLostReportParsed,
  LogFoundItemParsed,
} from '@lf/contracts';
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
import {
  binSuggestion,
  countFoundItems,
  listMyLostReports,
  logFoundItem,
  postFoundItem,
  submitLostReport,
  type ItemsDeps,
} from '../modules/items';
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
    photoIds: [],
  },
  {
    category: 'bottle',
    colour: 'green',
    shortName: 'Green metal water bottle',
    brand: null,
    publicDescription: 'Dented near the bottom.',
    privateNote: null,
    place: { buildingCode: 'GYM', floorId: null, zoneId: null },
    photoIds: [],
  },
  {
    category: 'keys',
    colour: 'silver',
    shortName: 'Car keys with Toyota fob',
    brand: 'Toyota',
    publicDescription: null,
    privateNote: 'Blue rubber ring on the key.',
    place: { buildingCode: null, floorId: null, zoneId: null },
    photoIds: [],
  },
];

type SampleFound = Omit<
  LogFoundItemParsed,
  'foundAt' | 'binCode' | 'place' | 'photoIds' | 'conditionPhotoIds'
> & {
  building: string;
  daysAgo: number;
};

const blank: Omit<SampleFound, 'category' | 'colour' | 'shortName' | 'building' | 'daysAgo'> = {
  brand: null,
  model: null,
  publicDescription: null,
  privateTicks: [],
  privateNote: null,
  condition: null,
  idNumber: null,
};

/** Items at the desk, named as in the Figma gallery and "Find an item" screens. */
export const SAMPLE_FOUND: SampleFound[] = [
  {
    ...blank,
    category: 'bag',
    colour: 'black',
    shortName: 'Black backpack with yellow logo',
    brand: 'Herschel',
    building: 'LIB',
    daysAgo: 4,
    condition: 'Good. Light dust on base.',
    privateTicks: ['contents_listed', 'name_tag'],
  },
  {
    ...blank,
    category: 'phone',
    colour: 'black',
    shortName: 'Black Samsung phone',
    brand: 'Samsung',
    building: 'NAC',
    daysAgo: 3,
    privateTicks: ['lock_screen'],
  },
  {
    ...blank,
    category: 'headphones',
    colour: 'black',
    shortName: 'Black over-ear headphones',
    brand: 'Sony',
    building: 'SAC',
    daysAgo: 3,
  },
  {
    ...blank,
    category: 'laptop',
    colour: 'silver',
    shortName: 'Silver MacBook',
    brand: 'Apple',
    building: 'LIB',
    daysAgo: 5,
    privateTicks: ['stickers_engraving'],
  },
  {
    ...blank,
    category: 'umbrella',
    colour: 'black',
    shortName: 'Black umbrella',
    building: 'PLZ',
    daysAgo: 8,
  },
  {
    ...blank,
    category: 'bottle',
    colour: 'green',
    shortName: 'Green metal water bottle',
    building: 'GYM',
    daysAgo: 3,
  },
  {
    ...blank,
    category: 'clothing',
    colour: 'blue',
    shortName: 'Blue denim jacket',
    building: 'NAC',
    daysAgo: 55,
  },
  {
    ...blank,
    category: 'glasses',
    colour: 'gold',
    shortName: 'Gold aviator sunglasses',
    building: 'AUD',
    daysAgo: 3,
  },
  {
    ...blank,
    category: 'calculator',
    colour: 'black',
    shortName: 'Casio scientific calculator',
    brand: 'Casio',
    building: 'SAC',
    daysAgo: 14,
  },
  {
    ...blank,
    category: 'books_notes',
    colour: 'green',
    shortName: 'Green hardcover notebook',
    building: 'SAC',
    daysAgo: 10,
  },
  {
    ...blank,
    category: 'watch',
    colour: 'brown',
    shortName: 'Analog wristwatch, brown strap',
    building: 'GYM',
    daysAgo: 7,
  },
  {
    ...blank,
    category: 'wallet',
    colour: 'brown',
    shortName: 'Brown leather wallet',
    building: 'PLZ',
    daysAgo: 4,
    privateTicks: ['cards_inside'],
  },
  {
    ...blank,
    category: 'bank_card',
    colour: 'blue',
    shortName: 'Bank debit card',
    building: 'ADM',
    daysAgo: 5,
    idNumber: '4111 2222 3333 4821',
  },
  {
    ...blank,
    category: 'clothing',
    colour: 'grey',
    shortName: 'Grey hoodie',
    building: 'SAC',
    daysAgo: 42,
  },
];

/** A student post still waiting to be handed in (shows under "Items to shelve"). */
export const SAMPLE_POST: Omit<CreateFoundPostParsed, 'foundAt'> = {
  category: 'bottle',
  colour: 'black',
  shortName: 'Black steel tumbler',
  brand: null,
  model: null,
  publicDescription: 'Steel tumbler with a black lid.',
  place: { buildingCode: 'NAC', floorId: null, zoneId: null },
  privateTicks: [],
  privateNote: null,
  photoIds: [],
  pingReportIds: [],
};

/** Desk-logged sample items plus one student post, for tenants that have no found items yet. */
async function seedSampleFoundItems(
  deps: ItemsDeps,
  base: Omit<RequestCtx, 'actor'>,
  members: Map<string, string>,
): Promise<number> {
  if ((await countFoundItems({ ...base, actor: { kind: 'system', job: 'seed' } })) > 0) return 0;
  const deskId = members.get('nusrat.jahan@northsouth.edu');
  const studentId = members.get('rafiq.ahmed@northsouth.edu');
  if (!deskId || !studentId) throw new Error('Seed people missing.');
  const desk: RequestCtx = {
    ...base,
    actor: { kind: 'user', userId: deskId, role: 'desk_officer', name: 'Nusrat Jahan' },
  };
  const now = base.clock.now().getTime();
  for (const item of SAMPLE_FOUND) {
    const { building, daysAgo, ...fields } = item;
    const binCode = (await binSuggestion(desk, fields.category)).suggested;
    await logFoundItem(deps, desk, {
      ...fields,
      place: { buildingCode: building, floorId: null, zoneId: null },
      foundAt: new Date(now - daysAgo * 86_400_000 - 2 * 3_600_000).toISOString(),
      binCode,
      photoIds: [],
      conditionPhotoIds: [],
    });
  }
  const student: RequestCtx = {
    ...base,
    actor: { kind: 'user', userId: studentId, role: 'student', name: 'Rafiq Ahmed' },
  };
  await postFoundItem(deps, student, {
    ...SAMPLE_POST,
    foundAt: new Date(now - 20 * 3_600_000).toISOString(),
  });
  return SAMPLE_FOUND.length + 1;
}

export async function runSeed(): Promise<string> {
  loadDotEnv();
  const config = parseConfig(process.env);
  const logger = createLogger({ level: 'warn', pretty: false });
  const services = createServices({ ...config, devTools: false }, logger, {
    clock: createOffsetClock(),
  });
  const deps: ItemsDeps = {
    boss: services.boss,
    crypto: services.crypto,
    registrar: services.registrar,
    appOrigin: config.appOrigin,
  };
  try {
    // A deployed copy (e.g. the public demo) is reached on APP_ORIGIN's host, so the main tenant
    // answers there too.
    const host = new URL(config.appOrigin).hostname;
    const main = await seedTenant(services.db, services.clock, {
      ...NSU_TENANT,
      hostnames: [...new Set([...NSU_TENANT.hostnames, host])],
    });
    const practice = await seedTenant(services.db, services.clock, NSU_PRACTICE_TENANT);
    await services.boss.start();
    await ensureQueues(services.boss, services.jobs);
    let created = 0;
    for (const t of [main, practice]) {
      created += await seedSampleFoundItems(
        deps,
        { tenantId: t.tenantId, requestId: 'seed-samples', clock: services.clock, db: services.db },
        t.members,
      );
    }

    const studentId = practice.members.get('rafiq.ahmed@northsouth.edu');
    if (!studentId) throw new Error('Practice student missing from seed.');
    const studentCtx: RequestCtx = {
      tenantId: practice.tenantId,
      actor: { kind: 'user', userId: studentId, role: 'student', name: 'Rafiq Ahmed' },
      requestId: 'seed-practice',
      clock: services.clock,
      db: services.db,
    };
    let reports = 0;
    if ((await listMyLostReports(studentCtx)).length === 0) {
      const to = services.clock.now();
      const from = new Date(to.getTime() - 3 * 60 * 60 * 1000);
      for (const r of PRACTICE_REPORTS) {
        await submitLostReport(deps, studentCtx, {
          ...r,
          timeFrom: from.toISOString(),
          timeTo: to.toISOString(),
        });
        reports += 1;
      }
    }
    await services.boss.stop({ graceful: false, close: true });
    const extras = [
      created ? `${created} sample found items` : '',
      reports ? `${reports} practice reports` : '',
    ]
      .filter(Boolean)
      .join(', ');
    return `2 tenants, ${NSU_MEMBERS.length} people each${extras ? `, ${extras}` : ''}`;
  } finally {
    await closeDatabase(services.db);
  }
}
