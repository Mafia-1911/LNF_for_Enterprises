// GOLDEN SLICE — copy this module's shape for new modules (AGENTS.md "Copy this slice").
//
// items owns lost reports and found items plus their private details and finder pings.
// Rules for every table: tenant_id first in the primary key and in every index that serves a query.
import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
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
    renewCount: bigint('renew_count', { mode: 'number' }).notNull().default(0),
    /** When the "your report expires in 2 days" alert went out; cleared on renew. */
    expiryReminderSentAt: ts('expiry_reminder_sent_at'),
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
    keyVersion: bigint('key_version', { mode: 'number' }),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.recordType, t.recordId] })],
);

/**
 * Found items (SRS lifecycles.found_item). Posted by a finder (REPORTED_BY_FINDER, WF-02) or logged
 * at the desk (IN_CUSTODY, WF-03). Only transition() changes `state`.
 */
export const foundItems = pgTable(
  'found_items',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    /** FND-YYMM-NNNNX (ADR-0012). */
    id: text('id').notNull(),
    state: text('state').notNull(),
    category: text('category').notNull(),
    colour: text('colour'),
    brand: text('brand'),
    model: text('model'),
    shortName: text('short_name'),
    publicDescription: text('public_description'),
    buildingCode: text('building_code'),
    floorId: uuid('floor_id').references(() => floors.id),
    zoneId: uuid('zone_id').references(() => zones.id),
    foundAt: ts('found_at').notNull(),
    /** finder (student post) | desk (walk-in intake). */
    source: text('source').notNull(),
    finderId: uuid('finder_id').references(() => users.id),
    /** The officer who logged or received it. */
    loggedBy: uuid('logged_by').references(() => users.id),
    binCode: text('bin_code'),
    /** Damage noted at intake (CC-13). */
    condition: text('condition'),
    handInDeadline: ts('hand_in_deadline'),
    reminderSentAt: ts('reminder_sent_at'),
    receivedAt: ts('received_at'),
    retentionEndsAt: ts('retention_ends_at'),
    /** Days added by "Keep longer" (WF-05). Retention is recomputed from intake, policy and pauses. */
    retentionExtraDays: bigint('retention_extra_days', { mode: 'number' }).notNull().default(0),
    /** When owners of similar reports got the last-chance alert (WF-05, 7 days before expiry). */
    lastChanceSentAt: ts('last_chance_sent_at'),
    /** University ID or card number, AES-256-GCM (CC-06). Only the last 4 are ever shown. */
    idNumberCiphertext: text('id_number_ciphertext'),
    idNumberLast4: text('id_number_last4'),
    keyVersion: bigint('key_version', { mode: 'number' }),
    /** When the owner was emailed directly (ID card fast lane, NF-02). */
    ownerEmailedAt: ts('owner_emailed_at'),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
    /** Lower-case words for search (pg_trgm index). Never includes private details. */
    searchText: text('search_text').generatedAlwaysAs(
      sql`lower(coalesce(short_name, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(model, '') || ' ' || coalesce(colour, '') || ' ' || category || ' ' || coalesce(public_description, ''))`,
    ),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index('found_items_state_idx').on(t.tenantId, t.state, t.category),
    index('found_items_finder_idx').on(t.tenantId, t.finderId, t.createdAt),
    index('found_items_deadline_idx').on(t.tenantId, t.state, t.handInDeadline),
    // Trigram index for word search. GIN can't lead with tenant_id (no btree_gin); queries still
    // filter by tenant_id through found_items_state_idx.
    index('found_items_search_idx').using('gin', t.searchText.op('gin_trgm_ops')),
  ],
);

/** "This might be theirs" (NF-01): a finder pointed their post at someone's open lost report. */
export const foundItemPings = pgTable(
  'found_item_pings',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    foundItemId: text('found_item_id').notNull(),
    lostReportId: text('lost_report_id').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.foundItemId, t.lostReportId] }),
    index('found_item_pings_lost_idx').on(t.tenantId, t.lostReportId),
  ],
);
