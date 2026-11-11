// Object bytes for the "database" storage driver (STORAGE_DRIVER=database): the stand-in for a bucket
// on hosts that have Postgres but no S3 (the public demo). Keys are the same as in the bucket
// ("<tenant id>/photos/<id>.webp"), so the tenant id is also stored first in the key.
import { customType, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from '../tenancy/schema';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const storedObjects = pgTable(
  'stored_objects',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    key: text('key').notNull(),
    contentType: text('content_type').notNull(),
    body: bytea('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);
