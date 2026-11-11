// Matching (FR-07): every run is recorded; every scored pair keeps its score and plain reasons, and
// when its owner was alerted (US-04), so nobody is alerted twice for the same pair.
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
import { tenants } from '../../platform/tenancy/schema';

export const matchRuns = pgTable(
  'match_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    recordType: text('record_type').notNull(),
    recordId: text('record_id').notNull(),
    candidates: bigint('candidates', { mode: 'number' }).notNull(),
    ranAt: timestamp('ran_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('match_runs_record_idx').on(t.tenantId, t.recordType, t.recordId)],
);

export const matchResults = pgTable(
  'match_results',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    lostReportId: text('lost_report_id').notNull(),
    foundItemId: text('found_item_id').notNull(),
    score: bigint('score', { mode: 'number' }).notNull(),
    /** Reason codes from packages/domain/src/matching.ts, e.g. ["same_colour", "same_building"]. */
    reasons: jsonb('reasons').$type<string[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    alertedAt: timestamp('alerted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.lostReportId, t.foundItemId] }),
    index('match_results_found_idx').on(t.tenantId, t.foundItemId),
  ],
);
