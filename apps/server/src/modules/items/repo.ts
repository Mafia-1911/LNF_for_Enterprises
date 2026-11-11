// GOLDEN SLICE — the only file that touches items tables (plan §3.2 rule 3).
// Every function takes (tx, tenantId, ...) and uses tenantId in every where, insert and join (§5.3).
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  sql,
} from 'drizzle-orm';
import type { FoundItemState, LostReportState } from '@lf/domain';
import type { Tx } from '../../platform/db/types';
import { Conflict } from '../../platform/errors';
import { foundItemPings, foundItems, lostReports, privateDetails, reservedIds } from './schema';

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

export type LostReportPatch = Partial<
  Pick<LostReportRow, 'expiresAt' | 'renewCount' | 'expiryReminderSentAt'>
>;

/** Moves a report from `from` to `to`. Fails with Conflict if someone else changed it first. */
export async function updateLostReportState(
  tx: Tx,
  tenantId: string,
  id: string,
  from: LostReportState,
  to: LostReportState,
  patch: LostReportPatch = {},
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

export async function findPrivateDetails(
  tx: Tx,
  tenantId: string,
  recordType: 'lost_report' | 'found_item',
  recordId: string,
) {
  const [row] = await tx.db
    .select()
    .from(privateDetails)
    .where(
      and(
        eq(privateDetails.tenantId, tenantId),
        eq(privateDetails.recordType, recordType),
        eq(privateDetails.recordId, recordId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertPrivateDetails(
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
  await tx.db
    .insert(privateDetails)
    .values({ ...data, tenantId, createdAt: tx.now })
    .onConflictDoUpdate({
      target: [privateDetails.tenantId, privateDetails.recordType, privateDetails.recordId],
      set: { ticks: data.ticks, noteCiphertext: data.noteCiphertext, keyVersion: data.keyVersion },
    });
}

/** Open lost reports in one category, for the finder's "Someone lost this?" panel. */
export async function listOpenLostReports(
  tx: Tx,
  tenantId: string,
  category: string,
  excludeOwner: string | null,
): Promise<LostReportRow[]> {
  return tx.db
    .select()
    .from(lostReports)
    .where(
      and(
        eq(lostReports.tenantId, tenantId),
        eq(lostReports.category, category),
        inArray(lostReports.state, ['OPEN', 'POSSIBLE_MATCH']),
        excludeOwner ? ne(lostReports.ownerId, excludeOwner) : undefined,
      ),
    )
    .orderBy(desc(lostReports.createdAt))
    .limit(300);
}

export async function findLostReports(
  tx: Tx,
  tenantId: string,
  ids: string[],
): Promise<LostReportRow[]> {
  if (ids.length === 0) return [];
  return tx.db
    .select()
    .from(lostReports)
    .where(and(eq(lostReports.tenantId, tenantId), inArray(lostReports.id, ids)));
}

// ── Found items ─────────────────────────────────────────────────────────────────────────────────

export type FoundItemRow = typeof foundItems.$inferSelect;

/** What the service provides when a found item is created; the rest comes from the transition. */
export type NewFoundItem = Omit<
  typeof foundItems.$inferInsert,
  'tenantId' | 'id' | 'state' | 'createdAt' | 'updatedAt' | 'searchText'
>;

export type FoundItemPatch = Partial<
  Omit<NewFoundItem, 'source' | 'finderId'> & { finderId: string | null }
>;

export async function insertFoundItem(
  tx: Tx,
  tenantId: string,
  id: string,
  state: FoundItemState,
  values: NewFoundItem,
): Promise<FoundItemRow> {
  const [row] = await tx.db
    .insert(foundItems)
    .values({ ...values, tenantId, id, state, createdAt: tx.now, updatedAt: tx.now })
    .returning();
  if (!row) throw new Error('found_items insert returned no row');
  return row;
}

/** Moves an item from `from` to `to` (optionally changing fields). Conflict if it moved meanwhile. */
export async function updateFoundItemState(
  tx: Tx,
  tenantId: string,
  id: string,
  from: FoundItemState,
  to: FoundItemState,
  patch: FoundItemPatch = {},
): Promise<FoundItemRow> {
  const [row] = await tx.db
    .update(foundItems)
    .set({ ...patch, state: to, updatedAt: tx.now })
    .where(
      and(eq(foundItems.tenantId, tenantId), eq(foundItems.id, id), eq(foundItems.state, from)),
    )
    .returning();
  if (!row) throw new Conflict();
  return row;
}

/** Changes fields without a state change (corrections, reminders). Guarded by the current state. */
export async function patchFoundItem(
  tx: Tx,
  tenantId: string,
  id: string,
  state: FoundItemState,
  patch: FoundItemPatch,
): Promise<FoundItemRow> {
  const [row] = await tx.db
    .update(foundItems)
    .set({ ...patch, updatedAt: tx.now })
    .where(
      and(eq(foundItems.tenantId, tenantId), eq(foundItems.id, id), eq(foundItems.state, state)),
    )
    .returning();
  if (!row) throw new Conflict();
  return row;
}

export async function findFoundItem(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<FoundItemRow | null> {
  const [row] = await tx.db
    .select()
    .from(foundItems)
    .where(and(eq(foundItems.tenantId, tenantId), eq(foundItems.id, id)))
    .limit(1);
  return row ?? null;
}

export async function listFoundItemsByFinder(
  tx: Tx,
  tenantId: string,
  finderId: string,
): Promise<FoundItemRow[]> {
  return tx.db
    .select()
    .from(foundItems)
    .where(and(eq(foundItems.tenantId, tenantId), eq(foundItems.finderId, finderId)))
    .orderBy(desc(foundItems.createdAt))
    .limit(100);
}

/** Every word must appear in the search text (ILIKE, served by the trigram index). */
function wordsFilter(q: string | undefined) {
  const words = (q ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[%_\\]/g, ''))
    .filter((w) => w.length > 0)
    .slice(0, 6);
  return words.length === 0
    ? undefined
    : and(...words.map((w) => ilike(foundItems.searchText, `%${w}%`)));
}

export async function searchFoundItems(
  tx: Tx,
  tenantId: string,
  filter: {
    states: readonly FoundItemState[];
    q?: string | undefined;
    category?: string | undefined;
    excludeCategories?: readonly string[];
    building?: string | undefined;
    since?: Date | undefined;
    limit?: number;
  },
): Promise<FoundItemRow[]> {
  return tx.db
    .select()
    .from(foundItems)
    .where(
      and(
        eq(foundItems.tenantId, tenantId),
        inArray(foundItems.state, [...filter.states]),
        filter.category ? eq(foundItems.category, filter.category) : undefined,
        filter.excludeCategories && filter.excludeCategories.length > 0
          ? sql`${foundItems.category} not in (${sql.join(
              filter.excludeCategories.map((c) => sql`${c}`),
              sql`, `,
            )})`
          : undefined,
        filter.building ? eq(foundItems.buildingCode, filter.building) : undefined,
        filter.since ? gte(foundItems.foundAt, filter.since) : undefined,
        wordsFilter(filter.q),
      ),
    )
    .orderBy(desc(foundItems.foundAt), desc(foundItems.id))
    .limit(filter.limit ?? 100);
}

/** Found items in custody that a new lost report might match (CC-05). */
export async function listCustodyItems(
  tx: Tx,
  tenantId: string,
  category: string,
): Promise<FoundItemRow[]> {
  return tx.db
    .select()
    .from(foundItems)
    .where(
      and(
        eq(foundItems.tenantId, tenantId),
        eq(foundItems.category, category),
        inArray(foundItems.state, ['IN_CUSTODY', 'CLAIM_PENDING']),
      ),
    )
    .orderBy(desc(foundItems.foundAt))
    .limit(300);
}

/** Student posts past `remindBefore` that have had no reminder yet (CC-03, 24 h). */
export async function listPostsDueReminder(tx: Tx, tenantId: string, createdBefore: Date) {
  return tx.db
    .select()
    .from(foundItems)
    .where(
      and(
        eq(foundItems.tenantId, tenantId),
        eq(foundItems.state, 'REPORTED_BY_FINDER'),
        isNull(foundItems.reminderSentAt),
        lte(foundItems.createdAt, createdBefore),
      ),
    )
    .limit(200);
}

/** Student posts whose hand-in deadline has passed (CC-03, 48 h). */
export async function listPostsPastDeadline(tx: Tx, tenantId: string, now: Date) {
  return tx.db
    .select()
    .from(foundItems)
    .where(
      and(
        eq(foundItems.tenantId, tenantId),
        eq(foundItems.state, 'REPORTED_BY_FINDER'),
        isNotNull(foundItems.handInDeadline),
        lte(foundItems.handInDeadline, now),
      ),
    )
    .limit(200);
}

export async function listExpiringSoon(tx: Tx, tenantId: string, until: Date) {
  return tx.db
    .select()
    .from(foundItems)
    .where(
      and(
        eq(foundItems.tenantId, tenantId),
        eq(foundItems.state, 'IN_CUSTODY'),
        isNotNull(foundItems.retentionEndsAt),
        lte(foundItems.retentionEndsAt, until),
      ),
    )
    .orderBy(asc(foundItems.retentionEndsAt))
    .limit(50);
}

export async function listAwaitingHandIn(tx: Tx, tenantId: string) {
  return tx.db
    .select()
    .from(foundItems)
    .where(and(eq(foundItems.tenantId, tenantId), eq(foundItems.state, 'REPORTED_BY_FINDER')))
    .orderBy(asc(foundItems.handInDeadline))
    .limit(50);
}

/** Items per bin among those on the shelves (for the bin suggestion). */
export async function countItemsPerBin(tx: Tx, tenantId: string): Promise<Map<string, number>> {
  const rows = await tx.db
    .select({ bin: foundItems.binCode, n: count() })
    .from(foundItems)
    .where(
      and(
        eq(foundItems.tenantId, tenantId),
        isNotNull(foundItems.binCode),
        inArray(foundItems.state, ['IN_CUSTODY', 'CLAIM_PENDING', 'READY_FOR_PICKUP', 'EXPIRED']),
      ),
    )
    .groupBy(foundItems.binCode);
  return new Map(rows.filter((r) => r.bin !== null).map((r) => [r.bin as string, r.n]));
}

// ── Pings ───────────────────────────────────────────────────────────────────────────────────────

export async function insertPings(
  tx: Tx,
  tenantId: string,
  foundItemId: string,
  lostReportIds: string[],
): Promise<void> {
  if (lostReportIds.length === 0) return;
  await tx.db
    .insert(foundItemPings)
    .values(
      lostReportIds.map((lostReportId) => ({
        tenantId,
        foundItemId,
        lostReportId,
        createdAt: tx.now,
      })),
    )
    .onConflictDoNothing();
}

export async function listPingedReports(
  tx: Tx,
  tenantId: string,
  foundItemId: string,
): Promise<string[]> {
  const rows = await tx.db
    .select({ id: foundItemPings.lostReportId })
    .from(foundItemPings)
    .where(and(eq(foundItemPings.tenantId, tenantId), eq(foundItemPings.foundItemId, foundItemId)));
  return rows.map((r) => r.id);
}

export async function countPings(
  tx: Tx,
  tenantId: string,
  foundItemIds: string[],
): Promise<Map<string, number>> {
  if (foundItemIds.length === 0) return new Map();
  const rows = await tx.db
    .select({ id: foundItemPings.foundItemId, n: count() })
    .from(foundItemPings)
    .where(
      and(eq(foundItemPings.tenantId, tenantId), inArray(foundItemPings.foundItemId, foundItemIds)),
    )
    .groupBy(foundItemPings.foundItemId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

export async function countAllFoundItems(tx: Tx, tenantId: string): Promise<number> {
  const [row] = await tx.db
    .select({ n: count() })
    .from(foundItems)
    .where(eq(foundItems.tenantId, tenantId));
  return row?.n ?? 0;
}

export async function findFoundItems(
  tx: Tx,
  tenantId: string,
  ids: string[],
): Promise<FoundItemRow[]> {
  if (ids.length === 0) return [];
  return tx.db
    .select()
    .from(foundItems)
    .where(and(eq(foundItems.tenantId, tenantId), inArray(foundItems.id, ids)));
}

// ── Timers: retention (WF-05) and lost-report expiry ─────────────────────────────────────────────

/** Found items in the given states (retention run, supervisor lists). Oldest change first. */
export async function listFoundItemsByState(
  tx: Tx,
  tenantId: string,
  states: FoundItemState[],
  updatedSince: Date | null = null,
): Promise<FoundItemRow[]> {
  return tx.db
    .select()
    .from(foundItems)
    .where(
      and(
        eq(foundItems.tenantId, tenantId),
        inArray(foundItems.state, states),
        updatedSince ? gte(foundItems.updatedAt, updatedSince) : undefined,
      ),
    )
    .orderBy(asc(foundItems.updatedAt))
    .limit(5000);
}

/** OPEN reports that expire on or before `until`, soonest first. */
export async function listOpenReportsExpiringBy(
  tx: Tx,
  tenantId: string,
  until: Date,
): Promise<LostReportRow[]> {
  return tx.db
    .select()
    .from(lostReports)
    .where(
      and(
        eq(lostReports.tenantId, tenantId),
        eq(lostReports.state, 'OPEN'),
        lte(lostReports.expiresAt, until),
      ),
    )
    .orderBy(asc(lostReports.expiresAt))
    .limit(1000);
}

/** Changes non-state fields of a report, guarded on its current state. */
export async function patchLostReport(
  tx: Tx,
  tenantId: string,
  id: string,
  state: LostReportState,
  patch: LostReportPatch,
): Promise<LostReportRow> {
  const [row] = await tx.db
    .update(lostReports)
    .set({ ...patch, updatedAt: tx.now })
    .where(
      and(eq(lostReports.tenantId, tenantId), eq(lostReports.id, id), eq(lostReports.state, state)),
    )
    .returning();
  if (!row) throw new Conflict();
  return row;
}

// ── Outage label sheets (NF-04) ──────────────────────────────────────────────────────────────────

export async function insertReservedIds(
  tx: Tx,
  tenantId: string,
  ids: string[],
  reservedBy: string | null,
): Promise<void> {
  if (ids.length === 0) return;
  await tx.db
    .insert(reservedIds)
    .values(ids.map((id) => ({ tenantId, id, reservedBy, reservedAt: tx.now })));
}

export function listUnusedReserved(tx: Tx, tenantId: string) {
  return tx.db
    .select()
    .from(reservedIds)
    .where(and(eq(reservedIds.tenantId, tenantId), isNull(reservedIds.usedAt)))
    .orderBy(asc(reservedIds.reservedAt), asc(reservedIds.id))
    .limit(200);
}

export async function findReservedId(tx: Tx, tenantId: string, id: string) {
  const [row] = await tx.db
    .select()
    .from(reservedIds)
    .where(and(eq(reservedIds.tenantId, tenantId), eq(reservedIds.id, id)))
    .limit(1);
  return row ?? null;
}

/** Marks a reserved ID used; Conflict if someone used it first. */
export async function markReservedUsed(tx: Tx, tenantId: string, id: string): Promise<void> {
  const rows = await tx.db
    .update(reservedIds)
    .set({ usedAt: tx.now })
    .where(
      and(eq(reservedIds.tenantId, tenantId), eq(reservedIds.id, id), isNull(reservedIds.usedAt)),
    )
    .returning({ id: reservedIds.id });
  if (rows.length === 0) throw new Conflict('That outage label was already entered; check the ID.');
}

// ── Reports (NF-07) ──────────────────────────────────────────────────────────────────────────────

export function listLostReportsSince(tx: Tx, tenantId: string, since: Date) {
  return tx.db
    .select()
    .from(lostReports)
    .where(and(eq(lostReports.tenantId, tenantId), gte(lostReports.createdAt, since)))
    .limit(20000);
}

export function listFoundItemsSince(tx: Tx, tenantId: string, since: Date) {
  return tx.db
    .select()
    .from(foundItems)
    .where(and(eq(foundItems.tenantId, tenantId), gte(foundItems.foundAt, since)))
    .limit(20000);
}

/** Active records of one category found in a time window (CC-04 duplicate check). */
export function listFoundInWindow(
  tx: Tx,
  tenantId: string,
  category: string,
  from: Date,
  to: Date,
): Promise<FoundItemRow[]> {
  return tx.db
    .select()
    .from(foundItems)
    .where(
      and(
        eq(foundItems.tenantId, tenantId),
        eq(foundItems.category, category),
        inArray(foundItems.state, ['REPORTED_BY_FINDER', 'IN_CUSTODY']),
        gte(foundItems.foundAt, from),
        lte(foundItems.foundAt, to),
      ),
    )
    .limit(50);
}
