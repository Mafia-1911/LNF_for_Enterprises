// Dispatch directory (FR-16, FR-17, FR-18, US-07, Figma 39:22656): every handover, searchable by
// DSP ID, FND ID, claimant name or the last 4 of their ID, with date and category filters; CSV
// export; a record page with the item's audit trail, amendments and disputes. Records lock 24 h
// after creation; corrections are added as amendments with a reason, never edits.
import type { AddAmendment, DispatchListQuery, DispatchRecord, DispatchRow } from '@lf/contracts';
import { categoryByCode, normaliseId } from '@lf/domain';
import { withTx } from '../../platform/db/tx';
import type { RequestCtx, Tx } from '../../platform/db/types';
import { Forbidden, NotFound } from '../../platform/errors';
import { recordAuditEvent } from '../audit';
import { memberNames } from '../identity';
import { foundItemsFor, itemTitle } from '../items';
import { disputeViews } from './disputes';
import { historyOf } from './history';
import {
  countAmendments,
  findDispatch,
  insertAmendment,
  listAmendments,
  listDispatches,
  listDisputes,
  type DispatchRow as Row,
} from './repo';
import { dispatchView } from './service';

const NOT_FOUND = "We couldn't find that handover record; check the DSP ID.";

const dayStart = (d: string) => new Date(`${d}T00:00:00+06:00`);
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999+06:00`);

async function rows(tx: Tx, query: DispatchListQuery): Promise<DispatchRow[]> {
  const all = await listDispatches(tx, tx.tenantId, {
    from: query.from ? dayStart(query.from) : null,
    to: query.to ? dayEnd(query.to) : null,
  });
  const items = new Map(
    (await foundItemsFor(tx, [...new Set(all.map((r) => r.foundItemId))])).map((i) => [i.id, i]),
  );
  const amendments = await countAmendments(
    tx,
    tx.tenantId,
    all.map((r) => r.id),
  );
  const disputed = new Set(
    (await listDisputes(tx, tx.tenantId, { dispatchIds: all.map((r) => r.id) }))
      .filter((d) => d.state === 'OPEN')
      .map((d) => d.dispatchId),
  );
  const q = query.q?.toLowerCase() ?? '';
  const id = query.q ? normaliseId(query.q) : null;
  return all
    .filter((r) => {
      const item = items.get(r.foundItemId);
      if (query.category && item?.category !== query.category) return false;
      if (!q) return true;
      return (
        r.id === id ||
        r.foundItemId === id ||
        r.recipientName.toLowerCase().includes(q) ||
        r.idLast4.toLowerCase() === q.slice(-4) ||
        (item ? itemTitle(item).toLowerCase().includes(q) : false)
      );
    })
    .map((r) => {
      const item = items.get(r.foundItemId);
      return {
        id: r.id,
        foundItemId: r.foundItemId,
        itemTitle: item ? itemTitle(item) : r.foundItemId,
        category: item?.category ?? 'other',
        claimantName: r.recipientName,
        idMasked: `••••${r.idLast4}`,
        createdAt: r.createdAt.toISOString(),
        locked: r.locksAt <= tx.now,
        disputed: disputed.has(r.id),
        amendments: amendments.get(r.id) ?? 0,
      };
    });
}

export function listDirectory(
  ctx: RequestCtx,
  query: DispatchListQuery,
): Promise<{ dispatches: DispatchRow[] }> {
  return withTx(ctx, async (tx) => ({ dispatches: await rows(tx, query) }), { readOnly: true });
}

/** Quotes a CSV cell and defuses spreadsheet formulas (=, +, -, @ at the start). */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

const dhaka = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', hour12: false });

/** FR-18: the same rows as the directory, as CSV for audits. */
export async function directoryCsv(ctx: RequestCtx, query: DispatchListQuery): Promise<string> {
  const list = await listDirectory(ctx, query);
  const header = [
    'DSP ID',
    'FND ID',
    'Item',
    'Category',
    'Claimant',
    'ID checked',
    'Handed over (Dhaka)',
    'Status',
    'Amendments',
  ];
  const lines = list.dispatches.map((r) =>
    [
      r.id,
      r.foundItemId,
      r.itemTitle,
      categoryByCode(r.category)?.label ?? r.category,
      r.claimantName,
      r.idMasked,
      dhaka(r.createdAt),
      r.disputed ? 'Dispute' : r.locked ? 'Locked' : 'Editable',
      String(r.amendments),
    ]
      .map(cell)
      .join(','),
  );
  return [header.map(cell).join(','), ...lines].join('\r\n') + '\r\n';
}

async function recordOf(tx: Tx, row: Row): Promise<DispatchRecord> {
  const amendments = await listAmendments(tx, tx.tenantId, row.id);
  const names = await memberNames(
    tx,
    amendments.map((a) => a.byId),
  );
  const disputes = await listDisputes(tx, tx.tenantId, { dispatchIds: [row.id] });
  return {
    dispatch: await dispatchView(tx, row),
    locked: row.locksAt <= tx.now,
    history: await historyOf(tx, 'found_item', row.foundItemId),
    amendments: amendments.map((a) => ({
      seq: a.seq,
      reason: a.reason,
      by: names.get(a.byId) ?? 'Staff',
      at: a.createdAt.toISOString(),
    })),
    disputes: await disputeViews(tx, disputes),
  };
}

export function getDispatchRecord(ctx: RequestCtx, id: string): Promise<DispatchRecord> {
  return withTx(
    ctx,
    async (tx) => {
      const row = await findDispatch(tx, tx.tenantId, id);
      if (!row) throw new NotFound(NOT_FOUND);
      return recordOf(tx, row);
    },
    { readOnly: true },
  );
}

/** FR-17: a correction with a reason. The record itself never changes. */
export function addAmendment(
  ctx: RequestCtx,
  id: string,
  input: AddAmendment,
): Promise<DispatchRecord> {
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();
  return withTx(ctx, async (tx) => {
    const row = await findDispatch(tx, tx.tenantId, id);
    if (!row) throw new NotFound(NOT_FOUND);
    await insertAmendment(tx, tx.tenantId, {
      dispatchId: id,
      reason: input.reason,
      byId: actor.userId,
    });
    await recordAuditEvent(tx, {
      recordType: 'dispatch',
      recordId: id,
      event: row.locksAt <= tx.now ? 'AMENDED' : 'CORRECTED',
      note: input.reason,
    });
    return recordOf(tx, row);
  });
}
