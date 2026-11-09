// Matching (FR-07). Phase 0.5 only records that a match run happened; scoring arrives in phase 3.
import { bigint, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
