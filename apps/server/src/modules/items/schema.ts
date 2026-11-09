// GOLDEN SLICE — copy this module's shape for new modules (AGENTS.md "Copy this slice").
//
// items owns lost reports (and, from phase 1, found items) plus their private details.
// Rules for every table: tenant_id first in the primary key and in every index that serves a query.
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../../platform/auth/schema';
import { tenants } from '../../platform/tenancy/schema';
import { floors, zones } from '../catalog/schema';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const lostReports = pgTable(
  'lost_reports',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    /** LST-YYMM-NNNNX, unique per tenant (ADR-0012). */
    id: text('id').notNull(),
    /** The person who lost the item. */
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    /** Who typed it in: the owner, or a desk officer for a walk-in (US-10). */
    filedBy: uuid('filed_by')
      .notNull()
      .references(() => users.id),
    /** packages/domain lostReportMachine. Only transition() changes it. */
    state: text('state').notNull(),
    category: text('category').notNull(),
    colour: text('colour'),
    brand: text('brand'),
    shortName: text('short_name'),
    publicDescription: text('public_description'),
    /** null = "Not sure". */
    buildingCode: text('building_code'),
    floorId: uuid('floor_id').references(() => floors.id),
    zoneId: uuid('zone_id').references(() => zones.id),
    timeFrom: ts('time_from').notNull(),
    timeTo: ts('time_to').notNull(),
    expiresAt: ts('expires_at').notNull(),
    renewCount: integer('renew_count').notNull().default(0),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index('lost_reports_owner_idx').on(t.tenantId, t.ownerId, t.createdAt),
    index('lost_reports_open_idx').on(t.tenantId, t.state, t.category),
    index('lost_reports_expiry_idx').on(t.tenantId, t.state, t.expiresAt),
  ],
);

/**
 * Details only the owner would know (FR-06, NF-03). The note is AES-256-GCM encrypted with the
 * key version recorded; it is shown only to desk staff during claim review and never logged.
 */
export const privateDetails = pgTable(
  'private_details',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    /** lost_report | found_item */
    recordType: text('record_type').notNull(),
    recordId: text('record_id').notNull(),
    /** Tick-box answers, e.g. ["has_case", "cracked_screen"]. */
    ticks: jsonb('ticks').$type<string[]>().notNull().default([]),
    noteCiphertext: text('note_ciphertext'),
    keyVersion: integer('key_version'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.recordType, t.recordId] })],
);
