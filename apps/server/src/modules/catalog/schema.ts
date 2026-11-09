// Catalog: places, desks, bins, categories, colours and tenant policies (FR-04).
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../../platform/auth/schema';
import { tenants } from '../../platform/tenancy/schema';

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id);

export const buildings = pgTable(
  'buildings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    /** Short code shown on cards and labels, e.g. NAC. */
    code: text('code').notNull(),
    name: text('name').notNull(),
    sort: bigint('sort', { mode: 'number' }).notNull().default(0),
  },
  (t) => [unique('buildings_tenant_code_uq').on(t.tenantId, t.code)],
);

export const floors = pgTable(
  'floors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id),
    name: text('name').notNull(),
    sort: bigint('sort', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    index('floors_tenant_building_idx').on(t.tenantId, t.buildingId),
    unique('floors_building_name_uq').on(t.buildingId, t.name),
  ],
);

export const zones = pgTable(
  'zones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    floorId: uuid('floor_id')
      .notNull()
      .references(() => floors.id),
    name: text('name').notNull(),
    sort: bigint('sort', { mode: 'number' }).notNull().default(0),
  },
  (t) => [
    index('zones_tenant_floor_idx').on(t.tenantId, t.floorId),
    unique('zones_floor_name_uq').on(t.floorId, t.name),
  ],
);

/** The Lost & Found desk(s). All found items go to one office (A1). */
export const desks = pgTable(
  'desks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id),
    /** Shown to students, e.g. "Admin Building, Ground floor, Security Room". */
    location: text('location').notNull(),
    hours: text('hours').notNull(),
  },
  (t) => [unique('desks_tenant_code_uq').on(t.tenantId, t.code)],
);

export const bins = pgTable(
  'bins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: tenantId(),
    deskId: uuid('desk_id')
      .notNull()
      .references(() => desks.id),
    code: text('code').notNull(),
    label: text('label').notNull(),
  },
  (t) => [unique('bins_tenant_code_uq').on(t.tenantId, t.code)],
);

export const categories = pgTable(
  'categories',
  {
    tenantId: tenantId(),
    code: text('code').notNull(),
    label: text('label').notNull(),
    sensitive: boolean('sensitive').notNull(),
    restricted: boolean('restricted').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    sort: bigint('sort', { mode: 'number' }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.code] })],
);

export const colours = pgTable(
  'colours',
  {
    tenantId: tenantId(),
    code: text('code').notNull(),
    label: text('label').notNull(),
    swatch: text('swatch').notNull(),
    sort: bigint('sort', { mode: 'number' }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.code] })],
);

/** Tenant settings, one JSON value per key, e.g. "appearance" (ADR-0010). Changes are audited. */
export const policies = pgTable(
  'policies',
  {
    tenantId: tenantId(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);
