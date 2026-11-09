// GOLDEN SLICE — the only file that touches items tables (plan §3.2 rule 3).
// Every function takes (tx, tenantId, ...) and uses tenantId in every where, insert and join (§5.3).
import { and, desc, eq } from 'drizzle-orm';
import type { LostReportState } from '@lf/domain';
import type { Tx } from '../../platform/db/types';
import { Conflict } from '../../platform/errors';
import { lostReports, privateDetails } from './schema';

export type LostReportRow = typeof lostReports.$inferSelect;

/** What the service provides when a report is created; the rest comes from the transition. */
export type NewLostReport = Omit<
  typeof lostReports.$inferInsert,
  'tenantId' | 'id' | 'state' | 'renewCount' | 'createdAt' | 'updatedAt'
>;

export async function insertLostReport(
  tx: Tx,
  tenantId: string,
  id: string,
  state: LostReportState,
  values: NewLostReport,
): Promise<LostReportRow> {
  const [row] = await tx.db
    .insert(lostReports)
    .values({ ...values, tenantId, id, state, createdAt: tx.now, updatedAt: tx.now })
    .returning();
  if (!row) throw new Error('lost_reports insert returned no row');
  return row;
}

/** Moves a report from `from` to `to`. Fails with Conflict if someone else changed it first. */
export async function updateLostReportState(
  tx: Tx,
  tenantId: string,
  id: string,
  from: LostReportState,
  to: LostReportState,
  patch: Partial<Pick<LostReportRow, 'expiresAt' | 'renewCount'>> = {},
): Promise<LostReportRow> {
  const [row] = await tx.db
    .update(lostReports)
    .set({ ...patch, state: to, updatedAt: tx.now })
    .where(
      and(eq(lostReports.tenantId, tenantId), eq(lostReports.id, id), eq(lostReports.state, from)),
    )
    .returning();
  if (!row) throw new Conflict();
  return row;
}

export async function findLostReport(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<LostReportRow | null> {
  const [row] = await tx.db
    .select()
    .from(lostReports)
    .where(and(eq(lostReports.tenantId, tenantId), eq(lostReports.id, id)))
    .limit(1);
  return row ?? null;
}

export async function listLostReportsByOwner(
  tx: Tx,
  tenantId: string,
  ownerId: string,
): Promise<LostReportRow[]> {
  return tx.db
    .select()
    .from(lostReports)
    .where(and(eq(lostReports.tenantId, tenantId), eq(lostReports.ownerId, ownerId)))
    .orderBy(desc(lostReports.createdAt))
    .limit(100);
}

export async function insertPrivateDetails(
  tx: Tx,
  tenantId: string,
  data: {
    recordType: 'lost_report' | 'found_item';
    recordId: string;
    ticks: string[];
    noteCiphertext: string | null;
    keyVersion: number | null;
  },
): Promise<void> {
  await tx.db.insert(privateDetails).values({ ...data, tenantId, createdAt: tx.now });
}

export async function hasPrivateDetails(
  tx: Tx,
  tenantId: string,
  recordType: 'lost_report' | 'found_item',
  recordId: string,
): Promise<boolean> {
  const rows = await tx.db
    .select({ recordId: privateDetails.recordId })
    .from(privateDetails)
    .where(
      and(
        eq(privateDetails.tenantId, tenantId),
        eq(privateDetails.recordType, recordType),
        eq(privateDetails.recordId, recordId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
