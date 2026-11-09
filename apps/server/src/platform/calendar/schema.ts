// Holidays, official closures and semester breaks. Working days are Sunday–Thursday minus these.
import { date, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
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
