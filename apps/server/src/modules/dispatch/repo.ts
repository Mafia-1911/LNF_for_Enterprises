// The only file that touches the dispatches table.
import { and, count, eq, gte } from 'drizzle-orm';
import type { Tx } from '../../platform/db/types';
import { dispatches } from './schema';

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
