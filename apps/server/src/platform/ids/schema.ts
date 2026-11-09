// Per-tenant, per-type, per-month sequence counters for record IDs (ADR-0012).
import { integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { tenants } from '../tenancy/schema';

export const idCounters = pgTable(
  'id_counters',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    type: text('type').notNull(),
    /** Dhaka year-month, e.g. "2611". */
    yymm: text('yymm').notNull(),
    lastSeq: integer('last_seq').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.type, t.yymm] })],
);
