// The only file that touches audit tables. No update or delete functions exist, on purpose.
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../../platform/db/types';
import { auditCheckpointEvents, auditCheckpoints, auditEvents } from './schema';

export type AuditEventInsert = {
  recordType: string;
  recordId: string;
  actorId: string | null;
  actorKind: string;
  event: string;
  fromState: string | null;
  toState: string | null;
  note: string | null;
  at: Date;
};

export type AuditEventRow = typeof auditEvents.$inferSelect;
export type CheckpointRow = typeof auditCheckpoints.$inferSelect;

export async function insertAuditEvent(
  tx: Tx,
  tenantId: string,
  event: AuditEventInsert,
): Promise<void> {
  await tx.db.insert(auditEvents).values({ tenantId, ...event });
}

export async function listRecordEvents(
  tx: Tx,
  tenantId: string,
  recordType: string,
  recordId: string,
): Promise<AuditEventRow[]> {
  return tx.db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.tenantId, tenantId),
        eq(auditEvents.recordType, recordType),
        eq(auditEvents.recordId, recordId),
      ),
    )
    .orderBy(asc(auditEvents.id));
}

/** The newest events in a tenant, optionally only for some record types (overview feed). */
export async function listLatestEvents(
  tx: Tx,
  tenantId: string,
  limit: number,
  recordTypes: string[] | null,
): Promise<AuditEventRow[]> {
  return tx.db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.tenantId, tenantId),
        recordTypes ? inArray(auditEvents.recordType, recordTypes) : undefined,
      ),
    )
    .orderBy(desc(auditEvents.id))
    .limit(limit);
}

/** Every event of some records of one type, oldest first. */
export async function listEventsFor(
  tx: Tx,
  tenantId: string,
  recordType: string,
  recordIds: string[],
): Promise<AuditEventRow[]> {
  if (recordIds.length === 0) return [];
  return tx.db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.tenantId, tenantId),
        eq(auditEvents.recordType, recordType),
        inArray(auditEvents.recordId, recordIds),
      ),
    )
    .orderBy(asc(auditEvents.id));
}

// ── Checkpoints: cross-tenant by design (one hash chain over the whole log) ─────────────────────

/** Serialises checkpoint runs: two jobs can't build checkpoints at the same time. */
export async function lockCheckpoints(tx: Tx): Promise<void> {
  await tx.db.execute(sql`select pg_advisory_xact_lock(hashtext('audit-checkpoint'))`);
}

export async function listUncheckpointedEvents(tx: Tx, limit: number): Promise<AuditEventRow[]> {
  return tx.db
    .select({ event: auditEvents })
    .from(auditEvents)
    .leftJoin(auditCheckpointEvents, eq(auditCheckpointEvents.eventId, auditEvents.id))
    .where(isNull(auditCheckpointEvents.eventId))
    .orderBy(asc(auditEvents.id))
    .limit(limit)
    .then((rows) => rows.map((r) => r.event));
}

export async function latestCheckpoint(tx: Tx): Promise<CheckpointRow | null> {
  const [row] = await tx.db
    .select()
    .from(auditCheckpoints)
    .orderBy(desc(auditCheckpoints.id))
    .limit(1);
  return row ?? null;
}

export async function insertCheckpoint(
  tx: Tx,
  data: { prevHash: string; hash: string; eventIds: number[]; createdAt: Date },
): Promise<CheckpointRow> {
  const [checkpoint] = await tx.db
    .insert(auditCheckpoints)
    .values({
      prevHash: data.prevHash,
      hash: data.hash,
      eventCount: data.eventIds.length,
      createdAt: data.createdAt,
    })
    .returning();
  if (!checkpoint) throw new Error('Checkpoint insert returned no row.');
  await tx.db
    .insert(auditCheckpointEvents)
    .values(data.eventIds.map((eventId) => ({ eventId, checkpointId: checkpoint.id })));
  return checkpoint;
}

export async function listCheckpoints(tx: Tx): Promise<CheckpointRow[]> {
  return tx.db.select().from(auditCheckpoints).orderBy(asc(auditCheckpoints.id));
}

export async function listCheckpointEvents(tx: Tx, checkpointId: number): Promise<AuditEventRow[]> {
  return tx.db
    .select({ event: auditEvents })
    .from(auditCheckpointEvents)
    .innerJoin(auditEvents, eq(auditEvents.id, auditCheckpointEvents.eventId))
    .where(eq(auditCheckpointEvents.checkpointId, checkpointId))
    .orderBy(asc(auditEvents.id))
    .then((rows) => rows.map((r) => r.event));
}
