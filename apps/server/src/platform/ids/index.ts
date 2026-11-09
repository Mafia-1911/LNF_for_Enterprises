// Allocates record IDs inside a transaction (ADR-0012). The counter row is locked by the upsert, so
// two transactions never get the same sequence; a rolled-back transaction leaves no gap-free promise
// (IDs are never reused, gaps are fine).
import { dhakaYearMonth, formatId, MAX_SEQ, type RecordType } from '@lf/domain';
import { sql } from 'drizzle-orm';
import { Conflict } from '../errors';
import type { Tx } from '../db/types';
import { idCounters } from './schema';

export async function nextId(tx: Tx, type: RecordType): Promise<string> {
  const { year, month } = dhakaYearMonth(tx.now);
  const yymm = `${String(year).padStart(2, '0')}${String(month).padStart(2, '0')}`;
  const [row] = await tx.db
    .insert(idCounters)
    .values({ tenantId: tx.tenantId, type, yymm, lastSeq: 1 })
    .onConflictDoUpdate({
      target: [idCounters.tenantId, idCounters.type, idCounters.yymm],
      set: { lastSeq: sql`${idCounters.lastSeq} + 1` },
    })
    .returning({ seq: idCounters.lastSeq });
  const seq = row?.seq ?? 0;
  if (seq > MAX_SEQ) {
    throw new Conflict(
      `This month's ${type} numbers are used up; ask IT to extend the ID range before adding more.`,
    );
  }
  return formatId({ type, year, month, seq });
}
