// The only file that touches the photos table.
import { and, asc, count, eq, gte, inArray, lt } from 'drizzle-orm';
import type { Tx } from '../../platform/db/types';
import { photos } from './schema';

export type PhotoRow = typeof photos.$inferSelect;
export type PhotoVisibility = 'private' | 'public' | 'staff';
export type PhotoPurpose = 'item' | 'condition';

export async function insertPhoto(tx: Tx, tenantId: string, row: Omit<PhotoRow, 'tenantId'>) {
  await tx.db.insert(photos).values({ ...row, tenantId });
}

export async function findPhoto(tx: Tx, tenantId: string, id: string): Promise<PhotoRow | null> {
  const [row] = await tx.db
    .select()
    .from(photos)
    .where(and(eq(photos.tenantId, tenantId), eq(photos.id, id)))
    .limit(1);
  return row ?? null;
}

export async function findPhotos(tx: Tx, tenantId: string, ids: string[]): Promise<PhotoRow[]> {
  if (ids.length === 0) return [];
  return tx.db
    .select()
    .from(photos)
    .where(and(eq(photos.tenantId, tenantId), inArray(photos.id, ids)));
}

export async function countRecentUploads(
  tx: Tx,
  tenantId: string,
  ownerId: string,
  since: Date,
): Promise<number> {
  const [row] = await tx.db
    .select({ n: count() })
    .from(photos)
    .where(
      and(eq(photos.tenantId, tenantId), eq(photos.ownerId, ownerId), gte(photos.createdAt, since)),
    );
  return row?.n ?? 0;
}

export async function markAttached(
  tx: Tx,
  tenantId: string,
  ids: string[],
  record: {
    recordType: string;
    recordId: string;
    purpose: PhotoPurpose;
    visibility: PhotoVisibility;
  },
) {
  if (ids.length === 0) return;
  await tx.db
    .update(photos)
    .set({ ...record, status: 'attached', attachedAt: tx.now })
    .where(
      and(eq(photos.tenantId, tenantId), inArray(photos.id, ids), eq(photos.status, 'unattached')),
    );
}

export async function setVisibilityForRecord(
  tx: Tx,
  tenantId: string,
  recordType: string,
  recordId: string,
  purpose: PhotoPurpose,
  visibility: PhotoVisibility,
) {
  await tx.db
    .update(photos)
    .set({ visibility })
    .where(
      and(
        eq(photos.tenantId, tenantId),
        eq(photos.recordType, recordType),
        eq(photos.recordId, recordId),
        eq(photos.purpose, purpose),
      ),
    );
}

export async function listForRecord(
  tx: Tx,
  tenantId: string,
  recordType: string,
  recordIds: string[],
): Promise<PhotoRow[]> {
  if (recordIds.length === 0) return [];
  return tx.db
    .select()
    .from(photos)
    .where(
      and(
        eq(photos.tenantId, tenantId),
        eq(photos.recordType, recordType),
        inArray(photos.recordId, recordIds),
      ),
    )
    .orderBy(asc(photos.createdAt), asc(photos.id));
}

export async function listStaleUnattached(
  tx: Tx,
  tenantId: string,
  before: Date,
): Promise<PhotoRow[]> {
  return tx.db
    .select()
    .from(photos)
    .where(
      and(
        eq(photos.tenantId, tenantId),
        eq(photos.status, 'unattached'),
        lt(photos.createdAt, before),
      ),
    )
    .limit(500);
}

export async function deletePhotoRows(tx: Tx, tenantId: string, ids: string[]) {
  if (ids.length === 0) return;
  await tx.db.delete(photos).where(and(eq(photos.tenantId, tenantId), inArray(photos.id, ids)));
}
