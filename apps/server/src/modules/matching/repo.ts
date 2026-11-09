// The only file that touches matching tables.
import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../platform/db/types';
import { matchRuns } from './schema';

export async function insertMatchRun(
  tx: Tx,
  tenantId: string,
  run: { recordType: string; recordId: string; candidates: number },
): Promise<void> {
  await tx.db.insert(matchRuns).values({ tenantId, ...run, ranAt: tx.now });
}

export async function countMatchRuns(
  tx: Tx,
  tenantId: string,
  recordType: string,
  recordId: string,
): Promise<number> {
  const rows = await tx.db
    .select({ id: matchRuns.id })
    .from(matchRuns)
    .where(
      and(
        eq(matchRuns.tenantId, tenantId),
        eq(matchRuns.recordType, recordType),
        eq(matchRuns.recordId, recordId),
      ),
    );
  return rows.length;
}
