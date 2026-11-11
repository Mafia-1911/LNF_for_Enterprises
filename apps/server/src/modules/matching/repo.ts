// The only file that touches matching tables.
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Tx } from '../../platform/db/types';
import { matchResults, matchRuns } from './schema';

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

export type MatchResultRow = typeof matchResults.$inferSelect;

/** Inserts or refreshes a scored pair; keeps when it was first alerted. */
export async function upsertMatchResult(
  tx: Tx,
  tenantId: string,
  r: { lostReportId: string; foundItemId: string; score: number; reasons: string[] },
): Promise<MatchResultRow> {
  const [row] = await tx.db
    .insert(matchResults)
    .values({ ...r, tenantId, createdAt: tx.now })
    .onConflictDoUpdate({
      target: [matchResults.tenantId, matchResults.lostReportId, matchResults.foundItemId],
      set: { score: r.score, reasons: r.reasons },
    })
    .returning();
  if (!row) throw new Error('match_results upsert returned no row');
  return row;
}

export async function markAlerted(
  tx: Tx,
  tenantId: string,
  lostReportId: string,
  foundItemId: string,
) {
  await tx.db
    .update(matchResults)
    .set({ alertedAt: tx.now })
    .where(
      and(
        eq(matchResults.tenantId, tenantId),
        eq(matchResults.lostReportId, lostReportId),
        eq(matchResults.foundItemId, foundItemId),
        isNull(matchResults.alertedAt),
      ),
    );
}

export async function listResultsForReport(
  tx: Tx,
  tenantId: string,
  lostReportId: string,
): Promise<MatchResultRow[]> {
  return tx.db
    .select()
    .from(matchResults)
    .where(and(eq(matchResults.tenantId, tenantId), eq(matchResults.lostReportId, lostReportId)))
    .orderBy(desc(matchResults.score))
    .limit(20);
}

export async function listResultsForItems(
  tx: Tx,
  tenantId: string,
  foundItemIds: string[],
): Promise<MatchResultRow[]> {
  if (foundItemIds.length === 0) return [];
  return tx.db
    .select()
    .from(matchResults)
    .where(
      and(eq(matchResults.tenantId, tenantId), inArray(matchResults.foundItemId, foundItemIds)),
    );
}
