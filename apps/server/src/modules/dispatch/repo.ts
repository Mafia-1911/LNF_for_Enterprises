// The only file that touches the dispatch tables (dispatches, amendments, disputes).
import type { DisputeState } from '@lf/domain';
import { and, asc, count, desc, eq, gte, inArray, lte, max } from 'drizzle-orm';
import type { Tx } from '../../platform/db/types';
import { Conflict } from '../../platform/errors';
import { dispatchAmendments, dispatches, disputes } from './schema';

export type DispatchRow = typeof dispatches.$inferSelect;

export async function insertDispatch(
  tx: Tx,
  tenantId: string,
  row: Omit<DispatchRow, 'tenantId' | 'createdAt' | 'locksAt'>,
): Promise<DispatchRow> {
  const [saved] = await tx.db
    .insert(dispatches)
    .values({
      ...row,
      tenantId,
      createdAt: tx.now,
      locksAt: new Date(tx.now.getTime() + 24 * 3_600_000),
    })
    .returning();
  if (!saved) throw new Error('dispatches insert returned no row');
  return saved;
}

export async function findDispatch(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<DispatchRow | null> {
  const [row] = await tx.db
    .select()
    .from(dispatches)
    .where(and(eq(dispatches.tenantId, tenantId), eq(dispatches.id, id)))
    .limit(1);
  return row ?? null;
}

/** Handovers since a time (supervisor overview: returned in the last 30 days). */
export async function countDispatchesSince(tx: Tx, tenantId: string, since: Date): Promise<number> {
  const [row] = await tx.db
    .select({ n: count() })
    .from(dispatches)
    .where(and(eq(dispatches.tenantId, tenantId), gte(dispatches.createdAt, since)));
  return row?.n ?? 0;
}

// ── Directory (FR-16) ────────────────────────────────────────────────────────────────────────────

export async function listDispatches(
  tx: Tx,
  tenantId: string,
  range: { from: Date | null; to: Date | null },
): Promise<DispatchRow[]> {
  return tx.db
    .select()
    .from(dispatches)
    .where(
      and(
        eq(dispatches.tenantId, tenantId),
        range.from ? gte(dispatches.createdAt, range.from) : undefined,
        range.to ? lte(dispatches.createdAt, range.to) : undefined,
      ),
    )
    .orderBy(desc(dispatches.createdAt))
    .limit(1000);
}

export async function findDispatchesFor(
  tx: Tx,
  tenantId: string,
  by: { claimId?: string; foundItemId?: string },
): Promise<DispatchRow[]> {
  return tx.db
    .select()
    .from(dispatches)
    .where(
      and(
        eq(dispatches.tenantId, tenantId),
        by.claimId ? eq(dispatches.claimId, by.claimId) : undefined,
        by.foundItemId ? eq(dispatches.foundItemId, by.foundItemId) : undefined,
      ),
    )
    .orderBy(desc(dispatches.createdAt));
}

// ── Amendments (FR-17) ───────────────────────────────────────────────────────────────────────────

export type AmendmentRow = typeof dispatchAmendments.$inferSelect;

export function listAmendments(tx: Tx, tenantId: string, dispatchId: string) {
  return tx.db
    .select()
    .from(dispatchAmendments)
    .where(
      and(eq(dispatchAmendments.tenantId, tenantId), eq(dispatchAmendments.dispatchId, dispatchId)),
    )
    .orderBy(asc(dispatchAmendments.seq));
}

export async function countAmendments(
  tx: Tx,
  tenantId: string,
  ids: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await tx.db
    .select({ id: dispatchAmendments.dispatchId, n: count() })
    .from(dispatchAmendments)
    .where(
      and(eq(dispatchAmendments.tenantId, tenantId), inArray(dispatchAmendments.dispatchId, ids)),
    )
    .groupBy(dispatchAmendments.dispatchId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

export async function insertAmendment(
  tx: Tx,
  tenantId: string,
  data: { dispatchId: string; reason: string; byId: string },
): Promise<void> {
  const [last] = await tx.db
    .select({ seq: max(dispatchAmendments.seq) })
    .from(dispatchAmendments)
    .where(
      and(
        eq(dispatchAmendments.tenantId, tenantId),
        eq(dispatchAmendments.dispatchId, data.dispatchId),
      ),
    );
  await tx.db
    .insert(dispatchAmendments)
    .values({ tenantId, ...data, seq: (last?.seq ?? 0) + 1, createdAt: tx.now });
}

// ── Disputes (WF-06) ─────────────────────────────────────────────────────────────────────────────

export type DisputeRow = typeof disputes.$inferSelect;
export type NewDispute = Omit<DisputeRow, 'tenantId' | 'id' | 'state' | 'createdAt' | 'updatedAt'>;

export async function insertDispute(
  tx: Tx,
  tenantId: string,
  id: string,
  state: DisputeState,
  values: NewDispute,
): Promise<DisputeRow> {
  const [row] = await tx.db
    .insert(disputes)
    .values({ ...values, tenantId, id, state, createdAt: tx.now, updatedAt: tx.now })
    .returning();
  if (!row) throw new Error('disputes insert returned no row');
  return row;
}

/** Moves a dispute from `from` to `to`; Conflict if someone changed it first. */
export async function updateDisputeState(
  tx: Tx,
  tenantId: string,
  id: string,
  from: DisputeState,
  to: DisputeState,
  patch: Partial<Pick<DisputeRow, 'outcome'>> = {},
): Promise<DisputeRow> {
  const [row] = await tx.db
    .update(disputes)
    .set({ ...patch, state: to, updatedAt: tx.now })
    .where(and(eq(disputes.tenantId, tenantId), eq(disputes.id, id), eq(disputes.state, from)))
    .returning();
  if (!row) throw new Conflict();
  return row;
}

export async function findDispute(tx: Tx, tenantId: string, id: string) {
  const [row] = await tx.db
    .select()
    .from(disputes)
    .where(and(eq(disputes.tenantId, tenantId), eq(disputes.id, id)))
    .limit(1);
  return row ?? null;
}

export function listDisputes(
  tx: Tx,
  tenantId: string,
  by: { claimId?: string; dispatchIds?: string[]; raisedBy?: string } = {},
) {
  if (by.dispatchIds?.length === 0) return Promise.resolve([] as DisputeRow[]);
  return tx.db
    .select()
    .from(disputes)
    .where(
      and(
        eq(disputes.tenantId, tenantId),
        by.claimId ? eq(disputes.claimId, by.claimId) : undefined,
        by.dispatchIds ? inArray(disputes.dispatchId, by.dispatchIds) : undefined,
        by.raisedBy ? eq(disputes.raisedBy, by.raisedBy) : undefined,
      ),
    )
    .orderBy(desc(disputes.createdAt))
    .limit(500);
}
