// transition(), audit events, checkpoints and the verifier (plan §3.4 rule 1, §5.4, ADR-0006/0011).
import { createHash } from 'node:crypto';
import { step, type Machine, type TransitionActor } from '@lf/domain';
import { withTx } from '../../platform/db/tx';
import type { RequestCtx, Tx } from '../../platform/db/types';
import { Forbidden, InvalidTransition } from '../../platform/errors';
import {
  insertAuditEvent,
  insertCheckpoint,
  latestCheckpoint,
  listCheckpointEvents,
  listCheckpoints,
  listRecordEvents,
  listUncheckpointedEvents,
  lockCheckpoints,
  type AuditEventRow,
} from './repo';

function actorFields(tx: Tx): {
  actorId: string | null;
  actorKind: string;
  transitionActor: TransitionActor;
} {
  return tx.actor.kind === 'user'
    ? {
        actorId: tx.actor.userId,
        actorKind: 'user',
        transitionActor: { kind: 'user', role: tx.actor.role },
      }
    : { actorId: null, actorKind: `system:${tx.actor.job}`, transitionActor: { kind: 'system' } };
}

// ── transition() ─────────────────────────────────────────────────────────────────────────────────

/** A record that moves through a lifecycle. `state: null` means it is being created. */
export type StatefulRecord<S extends string> = { id: string; state: S | null };

export type TransitionSpec<
  S extends string,
  E extends string,
  R extends StatefulRecord<S>,
  D,
  Out,
> = {
  recordType: string;
  machine: Machine<S, E>;
  /** Inserts a new record in state `to` (called when record.state is null). */
  create: (tx: Tx, record: R, to: S, data: D) => Promise<Out>;
  /** Moves an existing record from record.state to `to`. Must guard on the current state. */
  update: (tx: Tx, record: R, to: S, data: D) => Promise<Out>;
};

/**
 * Binds a lifecycle to its record type once per module, e.g.
 *   export const lostReportTransition = bindTransition({ recordType: 'lost_report', machine, create, update });
 * The returned transition(tx, record, event, data) checks the event and the actor's role against
 * the machine, writes the row through the module's repo and inserts the audit event, all on `tx`.
 */
export function bindTransition<
  S extends string,
  E extends string,
  R extends StatefulRecord<S>,
  D,
  Out,
>(spec: TransitionSpec<S, E, R, D, Out>) {
  return async function transition(
    tx: Tx,
    record: R,
    event: E,
    data: D,
    note: string | null = null,
  ): Promise<Out> {
    const { actorId, actorKind, transitionActor } = actorFields(tx);
    const result = step(spec.machine, record.state, event, transitionActor);
    if (!result.ok && result.reason === 'forbidden') throw new Forbidden();
    if (!result.ok) throw new InvalidTransition();
    const saved =
      record.state === null
        ? await spec.create(tx, record, result.to, data)
        : await spec.update(tx, record, result.to, data);
    await insertAuditEvent(tx, tx.tenantId, {
      recordType: spec.recordType,
      recordId: record.id,
      actorId,
      actorKind,
      event,
      fromState: record.state,
      toState: result.to,
      note,
      at: tx.now,
    });
    return saved;
  };
}

/** Audits a change that is not a lifecycle step (for example a policy change). */
export async function recordAuditEvent(
  tx: Tx,
  event: { recordType: string; recordId: string; event: string; note: string | null },
): Promise<void> {
  const { actorId, actorKind } = actorFields(tx);
  await insertAuditEvent(tx, tx.tenantId, {
    ...event,
    actorId,
    actorKind,
    fromState: null,
    toState: null,
    at: tx.now,
  });
}

export type AuditEntry = {
  id: number;
  event: string;
  fromState: string | null;
  toState: string | null;
  actorId: string | null;
  actorKind: string;
  note: string | null;
  at: string;
};

export async function getRecordHistory(
  ctx: RequestCtx,
  recordType: string,
  recordId: string,
): Promise<AuditEntry[]> {
  const rows = await withTx(ctx, (tx) => listRecordEvents(tx, ctx.tenantId, recordType, recordId), {
    readOnly: true,
  });
  return rows.map((r) => ({
    id: r.id,
    event: r.event,
    fromState: r.fromState,
    toState: r.toState,
    actorId: r.actorId,
    actorKind: r.actorKind,
    note: r.note,
    at: r.at.toISOString(),
  }));
}

// ── Checkpoints ──────────────────────────────────────────────────────────────────────────────────

export const GENESIS_HASH = '0'.repeat(64);
const BATCH = 10_000;

/** The exact bytes hashed for one event. Keys in a fixed order; times in ISO 8601 UTC. */
export function canonicalEvent(e: AuditEventRow): string {
  return JSON.stringify([
    e.id,
    e.tenantId,
    e.recordType,
    e.recordId,
    e.actorId,
    e.actorKind,
    e.event,
    e.fromState,
    e.toState,
    e.note,
    e.at.toISOString(),
  ]);
}

export function checkpointHash(prevHash: string, events: AuditEventRow[]): string {
  const hash = createHash('sha256').update(prevHash);
  for (const e of events) hash.update('\n').update(canonicalEvent(e));
  return hash.digest('hex');
}

/** Hourly job: hashes events not yet covered by a checkpoint and chains them to the last one. */
export async function createCheckpoint(
  ctx: RequestCtx,
): Promise<{ checkpointId: number; eventCount: number } | null> {
  return withTx(ctx, async (tx) => {
    await lockCheckpoints(tx);
    const events = await listUncheckpointedEvents(tx, BATCH);
    if (events.length === 0) return null;
    const prev = await latestCheckpoint(tx);
    const prevHash = prev?.hash ?? GENESIS_HASH;
    const checkpoint = await insertCheckpoint(tx, {
      prevHash,
      hash: checkpointHash(prevHash, events),
      eventIds: events.map((e) => e.id),
      createdAt: tx.now,
    });
    return { checkpointId: checkpoint.id, eventCount: events.length };
  });
}

export type VerifyResult =
  | { ok: true; checkpoints: number; events: number }
  | { ok: false; checkpoints: number; problems: string[] };

/** Recomputes every checkpoint from its member rows and checks the chain (scripts/verify-audit.ts). */
export async function verifyAuditChain(ctx: RequestCtx): Promise<VerifyResult> {
  return withTx(
    ctx,
    async (tx) => {
      const checkpoints = await listCheckpoints(tx);
      const problems: string[] = [];
      let expectedPrev = GENESIS_HASH;
      let events = 0;
      for (const cp of checkpoints) {
        const members = await listCheckpointEvents(tx, cp.id);
        events += members.length;
        if (cp.prevHash !== expectedPrev)
          problems.push(`Checkpoint ${cp.id} does not link to the previous checkpoint.`);
        if (members.length !== cp.eventCount)
          problems.push(
            `Checkpoint ${cp.id} lists ${cp.eventCount} events but has ${members.length}.`,
          );
        if (checkpointHash(cp.prevHash, members) !== cp.hash)
          problems.push(`Checkpoint ${cp.id} hash does not match its events.`);
        expectedPrev = cp.hash;
      }
      return problems.length === 0
        ? { ok: true, checkpoints: checkpoints.length, events }
        : { ok: false, checkpoints: checkpoints.length, problems };
    },
    { readOnly: true },
  );
}
