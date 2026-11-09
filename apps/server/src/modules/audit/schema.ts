// Insert-only audit tables (plan §5.4, ADR-0006). Triggers in the audit migration reject UPDATE,
// DELETE and TRUNCATE, and the app role only has INSERT and SELECT.
import {
  bigint,
  bigserial,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from '../../platform/tenancy/schema';

export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    recordType: text('record_type').notNull(),
    recordId: text('record_id').notNull(),
    /** null for system actors (jobs, timers). Not a foreign key: users can be erased, events can't. */
    actorId: uuid('actor_id'),
    /** "user" or "system:<job>" */
    actorKind: text('actor_kind').notNull(),
    event: text('event').notNull(),
    fromState: text('from_state'),
    toState: text('to_state'),
    note: text('note'),
    at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => [index('audit_events_record_idx').on(t.tenantId, t.recordType, t.recordId, t.id)],
);

export const auditCheckpoints = pgTable('audit_checkpoints', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  prevHash: text('prev_hash').notNull(),
  hash: text('hash').notNull(),
  eventCount: integer('event_count').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
});

/** Which events each checkpoint covered. Late commits land in the next checkpoint. */
export const auditCheckpointEvents = pgTable(
  'audit_checkpoint_events',
  {
    eventId: bigint('event_id', { mode: 'number' })
      .primaryKey()
      .references(() => auditEvents.id),
    checkpointId: bigint('checkpoint_id', { mode: 'number' })
      .notNull()
      .references(() => auditCheckpoints.id),
  },
  (t) => [index('audit_checkpoint_events_checkpoint_idx').on(t.checkpointId)],
);
