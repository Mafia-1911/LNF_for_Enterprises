// Photos (plan §6.1, ADR-0007). Only re-encoded WebP files reach storage; raw uploads are never kept.
// A photo starts "unattached" and is attached to a lost report or found item when that is saved.
import { bigint, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../platform/auth/schema';
import { tenants } from '../../platform/tenancy/schema';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const photos = pgTable(
  'photos',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    id: uuid('id').notNull(),
    /** Who uploaded it. */
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    /** unattached | attached */
    status: text('status').notNull(),
    /** lost_report | found_item | claim | dispatch, once attached. */
    recordType: text('record_type'),
    recordId: text('record_id'),
    /** item | condition (damage at intake, CC-13) | proof (claim receipt) | signature (handover). */
    purpose: text('purpose').notNull(),
    /** private (uploader + desk) | public (signed-in students and staff) | staff (desk only). */
    visibility: text('visibility').notNull(),
    storageKey: text('storage_key').notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull(),
    width: bigint('width', { mode: 'number' }).notNull(),
    height: bigint('height', { mode: 'number' }).notNull(),
    /** sha256 of the clean WebP. */
    sha256: text('sha256').notNull(),
    createdAt: ts('created_at').notNull(),
    attachedAt: ts('attached_at'),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index('photos_record_idx').on(t.tenantId, t.recordType, t.recordId),
    index('photos_unattached_idx').on(t.tenantId, t.status, t.createdAt),
  ],
);
