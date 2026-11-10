// The only file that touches the alerts table.
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { users } from '../../platform/auth/schema';
import type { Tx } from '../../platform/db/types';
import { alerts } from './schema';

export type AlertRow = typeof alerts.$inferSelect;

export async function insertAlert(tx: Tx, tenantId: string, row: Omit<AlertRow, 'tenantId'>) {
  await tx.db.insert(alerts).values({ ...row, tenantId });
}

export async function listAlertsFor(tx: Tx, tenantId: string, userId: string, limit = 50) {
  return tx.db
    .select()
    .from(alerts)
    .where(and(eq(alerts.tenantId, tenantId), eq(alerts.userId, userId)))
    .orderBy(desc(alerts.createdAt), desc(alerts.id))
    .limit(limit);
}

export async function countUnread(tx: Tx, tenantId: string, userId: string): Promise<number> {
  const [row] = await tx.db
    .select({ n: count() })
    .from(alerts)
    .where(and(eq(alerts.tenantId, tenantId), eq(alerts.userId, userId), isNull(alerts.readAt)));
  return row?.n ?? 0;
}

export async function markAlertsRead(
  tx: Tx,
  tenantId: string,
  userId: string,
  ids: string[] | undefined,
) {
  const scope = and(
    eq(alerts.tenantId, tenantId),
    eq(alerts.userId, userId),
    isNull(alerts.readAt),
    ids ? inArray(alerts.id, ids) : undefined,
  );
  await tx.db.update(alerts).set({ readAt: tx.now }).where(scope);
}

/** The address to email a member at (users are global; the alert row carries the tenant). */
export async function emailOf(tx: Tx, userId: string): Promise<string | null> {
  const [row] = await tx.db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.email ?? null;
}
