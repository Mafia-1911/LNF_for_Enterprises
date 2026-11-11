// identity owns who may do what in each tenant. People (users) are Better-Auth's table in
// platform/auth; their role per tenant is here.
import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../platform/auth/schema';
import { tenants } from '../../platform/tenancy/schema';

export const roleAssignments = pgTable(
  'role_assignments',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** student | visitor | desk_officer | supervisor | it_admin */
    role: text('role').notNull(),
    /** Shown under the name in the header, e.g. "BSc Computer Science" or "Desk officer". */
    title: text('title'),
    grantedBy: uuid('granted_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.userId] }),
    index('role_assignments_tenant_role_idx').on(t.tenantId, t.role),
  ],
);

/**
 * Staff added by a supervisor before they have signed in (Figma 39:27640). On their first single
 * sign-on the role is applied and the invite removed.
 */
export const staffInvites = pgTable(
  'staff_invites',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    /** Lower-case university email. */
    email: text('email').notNull(),
    name: text('name').notNull(),
    /** desk_officer | supervisor */
    role: text('role').notNull(),
    grantedBy: uuid('granted_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.email] })],
);

/** Accounts flagged for a supervisor's review, e.g. a wrong recipient after a dispute (CC-14). */
export const accountFlags = pgTable(
  'account_flags',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** wrong_recipient */
    kind: text('kind').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index('account_flags_user_idx').on(t.tenantId, t.userId),
  ],
);

/**
 * "Review done — clear" on the Flags page. A flag shows again only when new evidence arrives after
 * the clear (another no-show, another failed verification). Clearing a paused claimant lifts the
 * pause (CC-15 "pending review").
 */
export const flagClears = pgTable(
  'flag_clears',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** no_show_finder | failed_verifications | wrong_recipient */
    kind: text('kind').notNull(),
    clearedAt: timestamp('cleared_at', { withTimezone: true }).notNull(),
    clearedBy: uuid('cleared_by').references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.userId, t.kind] })],
);
