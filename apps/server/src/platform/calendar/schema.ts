// Holidays, official closures and semester breaks. Working days are Sunday–Thursday minus these.
import { date, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth/schema';
import { tenants } from '../tenancy/schema';

export const holidays = pgTable(
  'holidays',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    /** Dhaka calendar date, YYYY-MM-DD. */
    date: date('date', { mode: 'string' }).notNull(),
    name: text('name').notNull(),
    /** public_holiday | closure | semester_break */
    kind: text('kind').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.date] })],
);

/**
 * Official closures and semester breaks set by a supervisor (Policies, Figma 39:26930). The office
 * is closed on these dates (no working days) and the retention countdown pauses (NF-09).
 */
export const closures = pgTable(
  'closures',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id').notNull(),
    name: text('name').notNull(),
    /** Dhaka calendar dates, YYYY-MM-DD, both included. */
    fromDate: date('from_date', { mode: 'string' }).notNull(),
    toDate: date('to_date', { mode: 'string' }).notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] })],
);
