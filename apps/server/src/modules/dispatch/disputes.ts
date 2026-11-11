// Disputes (WF-06, CC-01, CC-14, US-07, Figma 39:23422). A losing claimant disputes within 7 days,
// or an owner reports a wrong handover. The supervisor sees the DSP record and its audit trail, adds
// notes, and resolves it (upheld or rejected), optionally flagging the wrong recipient. Nothing is
// edited: notes and the outcome are appended to the dispute's audit trail.
import { randomUUID } from 'node:crypto';
import type { Dispute, RaiseDispute, ResolveDispute } from '@lf/contracts';
import { disputeMachine, type DisputeState } from '@lf/domain';
import { withTx } from '../../platform/db/tx';
import type { RequestCtx, Tx } from '../../platform/db/types';
import { Conflict, Forbidden, NotFound } from '../../platform/errors';
import { bindTransition, recordAuditEvent } from '../audit';
import { disputableClaim } from '../claims';
import { flagAccount, listStaff, memberNames } from '../identity';
import { foundItemsFor, itemTitle } from '../items';
import { notify, type NotificationsDeps } from '../notifications';
import { historyOf } from './history';
import {
  findDispatch,
  findDispatchesFor,
  findDispute,
  insertDispute,
  listDisputes,
  updateDisputeState,
  type DisputeRow,
  type NewDispute,
} from './repo';

const NOT_FOUND = "We couldn't find that dispute; reload the list.";

type DisputeRecord = { id: string; state: DisputeState | null };
type DisputeChange = { values?: NewDispute; patch?: Partial<Pick<DisputeRow, 'outcome'>> };

export const disputeTransition = bindTransition({
  recordType: 'dispute',
  machine: disputeMachine,
  create: (tx, record: DisputeRecord, to, data: DisputeChange) => {
    if (!data.values) throw new Error('Raising a dispute needs values.');
    return insertDispute(tx, tx.tenantId, record.id, to, data.values);
  },
  update: (tx, record: DisputeRecord, to, data: DisputeChange) => {
    if (record.state === null) throw new Error('Updating needs the current state.');
    return updateDisputeState(tx, tx.tenantId, record.id, record.state, to, data.patch);
  },
});

const LABELS: Record<string, string> = {
  RAISE: 'Dispute raised',
  NOTE_ADDED: 'Note',
  RESOLVE: 'Resolved',
  ACCOUNT_FLAGGED: 'Account flagged',
};

/** Disputes with item titles, who raised them, and (for supervisors) their history. */
export async function disputeViews(
  tx: Tx,
  rows: DisputeRow[],
  withHistory = true,
): Promise<Dispute[]> {
  const items = new Map(
    (await foundItemsFor(tx, [...new Set(rows.map((r) => r.foundItemId))])).map((i) => [i.id, i]),
  );
  const names = await memberNames(
    tx,
    rows.map((r) => r.raisedBy),
  );
  const out: Dispute[] = [];
  for (const r of rows) {
    const item = items.get(r.foundItemId);
    out.push({
      id: r.id,
      state: r.state as DisputeState,
      kind: r.kind === 'wrong_handover' ? 'wrong_handover' : 'second_claimant',
      foundItemId: r.foundItemId,
      itemTitle: item ? itemTitle(item) : r.foundItemId,
      claimId: r.claimId,
      dispatchId: r.dispatchId,
      raisedBy: names.get(r.raisedBy) ?? 'Unknown',
      statement: r.statement,
      outcome: r.outcome === 'upheld' || r.outcome === 'rejected' ? r.outcome : null,
      createdAt: r.createdAt.toISOString(),
      history: withHistory ? await historyOf(tx, 'dispute', r.id, LABELS) : [],
    });
  }
  return out;
}

async function notifySupervisors(deps: NotificationsDeps, tx: Tx, title: string, body: string) {
  for (const s of await listStaff(tx))
    if (s.role === 'supervisor' && s.userId)
      await notify(deps, tx, {
        userId: s.userId,
        kind: 'general',
        title,
        body,
        link: '/supervisor/disputes',
      });
}

// ── Owner ────────────────────────────────────────────────────────────────────────────────────────

/** "Dispute" on a closed or collected claim (the claimant only). */
export async function raiseDispute(
  deps: NotificationsDeps,
  ctx: RequestCtx,
  claimId: string,
  input: RaiseDispute,
): Promise<{ dispute: Omit<Dispute, 'history'> | null }> {
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();
  return withTx(ctx, async (tx) => {
    const found = await disputableClaim(tx, claimId, actor.userId);
    if (!found)
      throw new NotFound(
        "This claim can't be disputed any more; ask the Lost & Found office in person.",
      );
    const existing = await listDisputes(tx, tx.tenantId, { claimId, raisedBy: actor.userId });
    if (existing.some((d) => d.state === 'OPEN'))
      throw new Conflict(
        'You already raised a dispute on this claim; the supervisor will contact you.',
      );
    const [dispatch] =
      found.kind === 'wrong_handover'
        ? await findDispatchesFor(tx, tx.tenantId, { claimId })
        : await findDispatchesFor(tx, tx.tenantId, { foundItemId: found.row.foundItemId });
    const id = randomUUID();
    const row = await disputeTransition(
      tx,
      { id, state: null },
      'RAISE',
      {
        values: {
          kind: found.kind,
          foundItemId: found.row.foundItemId,
          claimId,
          dispatchId: dispatch?.id ?? null,
          raisedBy: actor.userId,
          statement: input.statement,
          outcome: null,
        },
      },
      input.statement,
    );
    await notifySupervisors(
      deps,
      tx,
      'New dispute to review',
      `${actor.name} disputes ${found.row.foundItemId}${dispatch ? ` (${dispatch.id})` : ''}. Open Disputes to review it.`,
    );
    const [view] = await disputeViews(tx, [row], false);
    if (!view) throw new Error('dispute view missing');
    const { history: _history, ...rest } = view;
    return { dispute: rest };
  });
}

/** The claimant's own dispute on a claim, if any. */
export function myDispute(
  ctx: RequestCtx,
  claimId: string,
): Promise<{ dispute: Omit<Dispute, 'history'> | null }> {
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();
  return withTx(
    ctx,
    async (tx) => {
      const rows = await listDisputes(tx, tx.tenantId, { claimId, raisedBy: actor.userId });
      const [view] = await disputeViews(tx, rows.slice(0, 1), false);
      if (!view) return { dispute: null };
      const { history: _history, ...rest } = view;
      return { dispute: rest };
    },
    { readOnly: true },
  );
}

// ── Supervisor ───────────────────────────────────────────────────────────────────────────────────

export function listAllDisputes(ctx: RequestCtx): Promise<{ disputes: Dispute[] }> {
  return withTx(
    ctx,
    async (tx) => {
      const rows = await listDisputes(tx, tx.tenantId);
      rows.sort((a, b) => (a.state === b.state ? 0 : a.state === 'OPEN' ? -1 : 1));
      return { disputes: await disputeViews(tx, rows) };
    },
    { readOnly: true },
  );
}

/** Open disputes (overview badge and "Needs your decision"). */
export async function openDisputes(tx: Tx): Promise<Dispute[]> {
  const rows = (await listDisputes(tx, tx.tenantId)).filter((d) => d.state === 'OPEN');
  return disputeViews(tx, rows, false);
}

async function load(tx: Tx, id: string): Promise<DisputeRow> {
  const row = await findDispute(tx, tx.tenantId, id);
  if (!row) throw new NotFound(NOT_FOUND);
  return row;
}

async function one(tx: Tx, id: string): Promise<Dispute> {
  const [view] = await disputeViews(tx, [await load(tx, id)]);
  if (!view) throw new NotFound(NOT_FOUND);
  return view;
}

export function getDispute(ctx: RequestCtx, id: string): Promise<Dispute> {
  return withTx(ctx, (tx) => one(tx, id), { readOnly: true });
}

export function addDisputeNote(ctx: RequestCtx, id: string, note: string): Promise<Dispute> {
  return withTx(ctx, async (tx) => {
    await load(tx, id);
    await recordAuditEvent(tx, { recordType: 'dispute', recordId: id, event: 'NOTE_ADDED', note });
    return one(tx, id);
  });
}

export function resolveDispute(
  deps: NotificationsDeps,
  ctx: RequestCtx,
  id: string,
  input: ResolveDispute,
): Promise<Dispute> {
  return withTx(ctx, async (tx) => {
    const row = await load(tx, id);
    if (row.state !== 'OPEN')
      throw new Conflict('This dispute is already resolved; reload the page.');
    await disputeTransition(
      tx,
      { id, state: 'OPEN' },
      'RESOLVE',
      { patch: { outcome: input.outcome } },
      `${input.outcome === 'upheld' ? 'Upheld' : 'Rejected'}: ${input.note}`,
    );
    if (input.flagRecipient && row.dispatchId) {
      const dispatch = await findDispatch(tx, tx.tenantId, row.dispatchId);
      if (dispatch) {
        await flagAccount(
          tx,
          dispatch.recipientId,
          'wrong_recipient',
          `Received ${row.foundItemId} (${dispatch.id}); dispute upheld`,
        );
        await recordAuditEvent(tx, {
          recordType: 'dispute',
          recordId: id,
          event: 'ACCOUNT_FLAGGED',
          note: `${dispatch.recipientName} flagged for review`,
        });
      }
    }
    await notify(deps, tx, {
      userId: row.raisedBy,
      kind: 'claim_update',
      title: 'Your dispute was reviewed',
      body:
        input.outcome === 'upheld'
          ? `The supervisor agreed with you about ${row.foundItemId} and will contact you about next steps.`
          : `The supervisor reviewed ${row.foundItemId} and kept the original decision. Ask the office if you have new proof.`,
      link: row.claimId ? `/claims/${row.claimId}` : '/activity',
    });
    return one(tx, id);
  });
}
