// In-app alerts (FR-09). Each row is one message to one person; emails are sent by a job.
import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../platform/auth/schema';
import { tenants } from '../../platform/tenancy/schema';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const alerts = pgTable(
  'alerts',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    link: text('link'),
    createdAt: ts('created_at').notNull(),
    readAt: ts('read_at'),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index('alerts_user_idx').on(t.tenantId, t.userId, t.createdAt),
  ],
);
