// Photo pipeline (plan §6.1, ADR-0007): sniff → decode with limits → rotate → resize → WebP ≤ 500 KB
// (metadata, GPS and EXIF dropped) → sha256 → storage → "unattached" row. Every photo takes this path.
import { createHash, randomUUID } from 'node:crypto';
import { DESK_ROLES } from '@lf/domain';
import sharp from 'sharp';
import { withTx } from '../../platform/db/tx';
import type { RequestCtx, Tx } from '../../platform/db/types';
import { Forbidden, NotFound, RateLimited, ValidationFailed } from '../../platform/errors';
import type { Storage } from '../../platform/storage';
import {
  countRecentUploads,
  deletePhotoRows,
  findPhoto,
  findPhotos,
  insertPhoto,
  listForRecord,
  listStaleUnattached,
  markAttached,
  setVisibilityForRecord,
  type PhotoPurpose,
  type PhotoVisibility,
} from './repo';

export type PhotosDeps = { storage: Storage };
export type { PhotoPurpose, PhotoVisibility };

export const MAX_PHOTOS_PER_RECORD = 5;
const MAX_BYTES = 500 * 1024;
const MAX_EDGE = 1600;
const UPLOADS_PER_HOUR = 60;
const UNATTACHED_DAYS = 7;

const BAD_FILE = "That file isn't a photo we can read; choose a JPEG, PNG or WebP image.";

/** JPEG, PNG or WebP by magic bytes; the declared type and the file name are ignored. */
export function sniffImage(bytes: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return 'png';
  if (
    b.length >= 12 &&
    String.fromCharCode(b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, b[3] ?? 0) === 'RIFF' &&
    String.fromCharCode(b[8] ?? 0, b[9] ?? 0, b[10] ?? 0, b[11] ?? 0) === 'WEBP'
  )
    return 'webp';
  return null;
}

/** Re-encodes to WebP within 500 KB. Exported for tests. */
export async function cleanImage(
  bytes: Uint8Array,
): Promise<{ data: Uint8Array; width: number; height: number }> {
  if (!sniffImage(bytes)) throw new ValidationFailed({ file: BAD_FILE }, BAD_FILE);
  let edge = MAX_EDGE;
  try {
    for (;;) {
      for (const quality of [80, 70, 60, 50]) {
        const { data, info } = await sharp(bytes, { limitInputPixels: 40e6, failOn: 'error' })
          .rotate()
          .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
          .webp({ quality })
          .toBuffer({ resolveWithObject: true });
        if (data.length <= MAX_BYTES || (quality === 50 && edge <= 400)) {
          return { data: new Uint8Array(data), width: info.width, height: info.height };
        }
      }
      edge = Math.round(edge * 0.75);
    }
  } catch (err) {
    if (err instanceof ValidationFailed) throw err;
    throw new ValidationFailed({ file: BAD_FILE }, BAD_FILE);
  }
}

export type UploadedPhoto = { id: string; width: number; height: number; bytes: number };

export async function uploadPhoto(
  deps: PhotosDeps,
  ctx: RequestCtx,
  bytes: Uint8Array,
): Promise<UploadedPhoto> {
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();
  const recent = await withTx(
    ctx,
    (tx) =>
      countRecentUploads(tx, tx.tenantId, actor.userId, new Date(tx.now.getTime() - 3_600_000)),
    { readOnly: true },
  );
  if (recent >= UPLOADS_PER_HOUR)
    throw new RateLimited('You have added a lot of photos this hour; wait a while and try again.');

  const clean = await cleanImage(bytes);
  const id = randomUUID();
  const storageKey = `${ctx.tenantId}/photos/${id}.webp`;
  await deps.storage.put(storageKey, clean.data, 'image/webp');
  await withTx(ctx, (tx) =>
    insertPhoto(tx, tx.tenantId, {
      id,
      ownerId: actor.userId,
      status: 'unattached',
      recordType: null,
      recordId: null,
      purpose: 'item',
      visibility: 'private',
      storageKey,
      bytes: clean.data.length,
      width: clean.width,
      height: clean.height,
      sha256: createHash('sha256').update(clean.data).digest('hex'),
      createdAt: tx.now,
      attachedAt: null,
    }),
  );
  return { id, width: clean.width, height: clean.height, bytes: clean.data.length };
}

/**
 * Attaches the caller's unattached photos to a record (inside the record's transaction). Fails with
 * a field error when a photo is missing, someone else's, already used, or there are too many.
 */
export async function attachPhotos(
  tx: Tx,
  ids: readonly string[],
  record: {
    recordType: 'lost_report' | 'found_item';
    recordId: string;
    purpose: PhotoPurpose;
    visibility: PhotoVisibility;
  },
  field = 'photoIds',
): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  if (unique.length > MAX_PHOTOS_PER_RECORD)
    throw new ValidationFailed({ [field]: 'Add up to 5 photos.' });
  const actor = tx.actor;
  const rows = await findPhotos(tx, tx.tenantId, unique);
  const usable = rows.filter(
    (r) => r.status === 'unattached' && actor.kind === 'user' && r.ownerId === actor.userId,
  );
  if (usable.length !== unique.length)
    throw new ValidationFailed({
      [field]: "One of the photos isn't available any more; remove it and add it again.",
    });
  await markAttached(tx, tx.tenantId, unique, record);
}

/** Changes who may see a record's photos, e.g. public once a found item is at the desk. */
export function setRecordPhotoVisibility(
  tx: Tx,
  recordType: 'lost_report' | 'found_item',
  recordId: string,
  purpose: PhotoPurpose,
  visibility: PhotoVisibility,
) {
  return setVisibilityForRecord(tx, tx.tenantId, recordType, recordId, purpose, visibility);
}

export type RecordPhoto = { id: string; purpose: PhotoPurpose; visibility: PhotoVisibility };

/** Photo ids per record, oldest first. */
export async function photosForRecords(
  tx: Tx,
  recordType: 'lost_report' | 'found_item',
  recordIds: string[],
): Promise<Map<string, RecordPhoto[]>> {
  const rows = await listForRecord(tx, tx.tenantId, recordType, recordIds);
  const out = new Map<string, RecordPhoto[]>();
  for (const r of rows) {
    if (!r.recordId) continue;
    const list = out.get(r.recordId) ?? [];
    list.push({
      id: r.id,
      purpose: r.purpose as PhotoPurpose,
      visibility: r.visibility as PhotoVisibility,
    });
    out.set(r.recordId, list);
  }
  return out;
}

function canView(ctx: RequestCtx, row: { ownerId: string; visibility: string }): boolean {
  const actor = ctx.actor;
  if (actor.kind !== 'user') return false;
  if (DESK_ROLES.includes(actor.role)) return true;
  if (row.ownerId === actor.userId) return true;
  return row.visibility === 'public' && actor.role !== 'visitor';
}

/** The clean WebP bytes, if the caller may see this photo. Anyone else gets "not found". */
export async function readPhoto(
  deps: PhotosDeps,
  ctx: RequestCtx,
  id: string,
): Promise<Uint8Array> {
  const row = await withTx(ctx, (tx) => findPhoto(tx, tx.tenantId, id), { readOnly: true });
  if (!row || !canView(ctx, row)) throw new NotFound("We couldn't find that photo.");
  const bytes = await deps.storage.get(row.storageKey);
  if (!bytes) throw new NotFound("We couldn't find that photo.");
  return bytes;
}

/** Daily: deletes photos nobody attached within 7 days (plan §6.1). Returns how many went. */
export async function cleanUpUnattached(deps: PhotosDeps, ctx: RequestCtx): Promise<number> {
  const stale = await withTx(
    ctx,
    (tx) =>
      listStaleUnattached(
        tx,
        tx.tenantId,
        new Date(tx.now.getTime() - UNATTACHED_DAYS * 86_400_000),
      ),
    { readOnly: true },
  );
  for (const p of stale) await deps.storage.delete(p.storageKey);
  await withTx(ctx, (tx) =>
    deletePhotoRows(
      tx,
      tx.tenantId,
      stale.map((p) => p.id),
    ),
  );
  return stale.length;
}
