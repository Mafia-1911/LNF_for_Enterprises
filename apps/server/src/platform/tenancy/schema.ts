// Tenants (universities). Owned by platform because every module references them (ADR-0011).
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  /** University email domain, e.g. northsouth.edu. SSO and email OTP only accept this domain. */
  emailDomain: text('email_domain').notNull(),
  /** Host names that resolve to this tenant (ADR-0005), e.g. {localhost, 127.0.0.1}. */
  hostnames: text('hostnames').array().notNull(),
  /** Practice tenants hold sample data for training; the UI shows a practice banner. */
  isPractice: boolean('is_practice').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TenantRow = typeof tenants.$inferSelect;
