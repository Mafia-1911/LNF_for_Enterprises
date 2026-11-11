// Dispatch (DSP) records: one per handover (WF-04 step 7, FR-16). Locked 24 h after creation; later
// corrections are amendments with a reason (FR-17, phase 4).
import { boolean, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../platform/auth/schema';
import { tenants } from '../../platform/tenancy/schema';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const dispatches = pgTable(
  'dispatches',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    /** DSP-YYMM-NNNNX (ADR-0012). */
    id: text('id').notNull(),
    foundItemId: text('found_item_id').notNull(),
    claimId: text('claim_id').notNull(),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id),
    /** Name as shown at handover, kept even if the account changes later. */
    recipientName: text('recipient_name').notNull(),
    /** Last 4 characters of the physical ID the officer checked. */
    idLast4: text('id_last4').notNull(),
    photoMatch: boolean('photo_match').notNull(),
    /** device_unlocked | serial_matched | cash_recounted | supervisor_approved (CC-07, CC-08, CC-10). */
    secondCheck: text('second_check'),
    officerId: uuid('officer_id')
      .notNull()
      .references(() => users.id),
    createdAt: ts('created_at').notNull(),
    locksAt: ts('locks_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index('dispatches_item_idx').on(t.tenantId, t.foundItemId),
    index('dispatches_created_idx').on(t.tenantId, t.createdAt),
  ],
);
