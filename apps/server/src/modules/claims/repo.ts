// The only file that touches the claims table. Every function takes (tx, tenantId, ...).
import type { ClaimState } from '@lf/domain';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import type { Tx } from '../../platform/db/types';
import { Conflict } from '../../platform/errors';
import { claims } from './schema';

export type ClaimRow = typeof claims.$inferSelect;
export type NewClaim = Omit<
  typeof claims.$inferInsert,
  'tenantId' | 'id' | 'state' | 'createdAt' | 'updatedAt'
>;
export type ClaimPatch = Partial<Omit<NewClaim, 'foundItemId' | 'claimantId'>>;

export const ACTIVE: ClaimState[] = ['SUBMITTED', 'MORE_INFO_REQUESTED', 'APPROVED'];

export async function insertClaim(
  tx: Tx,
  tenantId: string,
  id: string,
  state: ClaimState,
  values: NewClaim,
) {
  const [row] = await tx.db
    .insert(claims)
    .values({ ...values, tenantId, id, state, createdAt: tx.now, updatedAt: tx.now })
    .returning();
  if (!row) throw new Error('claims insert returned no row');
  return row;
}

export async function updateClaimState(
  tx: Tx,
  tenantId: string,
  id: string,
  from: ClaimState,
  to: ClaimState,
  patch: ClaimPatch = {},
): Promise<ClaimRow> {
  const [row] = await tx.db
    .update(claims)
    .set({ ...patch, state: to, updatedAt: tx.now })
    .where(and(eq(claims.tenantId, tenantId), eq(claims.id, id), eq(claims.state, from)))
    .returning();
  if (!row) throw new Conflict();
  return row;
}

export async function patchClaim(
  tx: Tx,
  tenantId: string,
  id: string,
  state: ClaimState,
  patch: ClaimPatch,
) {
  const [row] = await tx.db
    .update(claims)
    .set({ ...patch, updatedAt: tx.now })
    .where(and(eq(claims.tenantId, tenantId), eq(claims.id, id), eq(claims.state, state)))
    .returning();
  if (!row) throw new Conflict();
  return row;
}

export async function findClaim(tx: Tx, tenantId: string, id: string): Promise<ClaimRow | null> {
  const [row] = await tx.db
    .select()
    .from(claims)
    .where(and(eq(claims.tenantId, tenantId), eq(claims.id, id)))
    .limit(1);
  return row ?? null;
}

export async function listByClaimant(tx: Tx, tenantId: string, claimantId: string) {
  return tx.db
    .select()
    .from(claims)
    .where(and(eq(claims.tenantId, tenantId), eq(claims.claimantId, claimantId)))
    .orderBy(desc(claims.createdAt))
    .limit(100);
}

export async function listForItem(tx: Tx, tenantId: string, foundItemId: string) {
  return tx.db
    .select()
    .from(claims)
    .where(and(eq(claims.tenantId, tenantId), eq(claims.foundItemId, foundItemId)))
    .orderBy(asc(claims.createdAt));
}

export async function countActiveByClaimant(tx: Tx, tenantId: string, claimantId: string) {
  const [row] = await tx.db
    .select({ n: count() })
    .from(claims)
    .where(
      and(
        eq(claims.tenantId, tenantId),
        eq(claims.claimantId, claimantId),
        inArray(claims.state, ACTIVE),
      ),
    );
  return row?.n ?? 0;
}

/** Rejections with at least one failed answer since `since` (CC-15). */
export async function listRecentRejections(
  tx: Tx,
  tenantId: string,
  claimantId: string,
  since: Date,
) {
  return tx.db
    .select()
    .from(claims)
    .where(
      and(
        eq(claims.tenantId, tenantId),
        eq(claims.claimantId, claimantId),
        eq(claims.state, 'REJECTED'),
        isNotNull(claims.decidedAt),
        gte(claims.decidedAt, since),
      ),
    );
}

export async function listByState(tx: Tx, tenantId: string, states: ClaimState[]) {
  return tx.db
    .select()
    .from(claims)
    .where(and(eq(claims.tenantId, tenantId), inArray(claims.state, states)))
    .orderBy(asc(claims.reviewDueAt))
    .limit(500);
}

export async function listApprovedDueReminder(tx: Tx, tenantId: string, before: Date) {
  return tx.db
    .select()
    .from(claims)
    .where(
      and(
        eq(claims.tenantId, tenantId),
        eq(claims.state, 'APPROVED'),
        isNull(claims.reminderSentAt),
        lte(claims.pickupEndsAt, before),
      ),
    );
}

export async function listApprovedPastWindow(tx: Tx, tenantId: string, now: Date) {
  return tx.db
    .select()
    .from(claims)
    .where(
      and(
        eq(claims.tenantId, tenantId),
        eq(claims.state, 'APPROVED'),
        lte(claims.pickupEndsAt, now),
      ),
    );
}

export async function countFailedFor(tx: Tx, tenantId: string, claimantIds: string[]) {
  if (claimantIds.length === 0) return new Map<string, number>();
  const rows = await tx.db
    .select({ id: claims.claimantId, n: count() })
    .from(claims)
    .where(
      and(
        eq(claims.tenantId, tenantId),
        inArray(claims.claimantId, claimantIds),
        eq(claims.state, 'REJECTED'),
      ),
    )
    .groupBy(claims.claimantId);
  return new Map(rows.map((r) => [r.id, r.n]));
}
