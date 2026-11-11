// The supervisor's screens (phase 4): overview, policies and closures, staff. This module sits on top
// of the others and owns no tables: it reads and changes them through their public surfaces.
import { randomUUID } from 'node:crypto';
import type {
  ActivityEntry,
  AddClosure,
  AddStaff,
  Flag,
  Policies,
  PolicySettings,
  StaffMember,
  SupervisorOverview,
} from '@lf/contracts';
import {
  addDays,
  deleteClosure,
  insertClosure,
  listClosures,
  overlappingClosures,
} from '../../platform/calendar';
import { withTx } from '../../platform/db/tx';
import type { RequestCtx, Tx } from '../../platform/db/types';
import { NotFound, ValidationFailed } from '../../platform/errors';
import { tenantEmailDomain } from '../../platform/tenancy';
import { latestEvents, recordAuditEvent } from '../audit';
import { readPolicies, writePolicies } from '../catalog';
import { approvalRows, failedVerifiers, todayLists } from '../claims';
import { openDisputes, returnedSince } from '../dispatch';
import {
  accountFlags,
  addStaff,
  clearFlags,
  flagClearTimes,
  listStaff,
  memberNames,
  removeStaff,
  type FlagKind,
} from '../identity';
import { custodyCounts, noShowFinders, recalculateRetention } from '../items';

const DAY = 86_400_000;
const MAX_CLOSURE_DAYS = 120;

// ── Overview (Figma 39:20616) ────────────────────────────────────────────────────────────────────

const ACTIVITY_LABEL: Record<string, string> = {
  'found_item:POST': 'Posted by finder',
  'found_item:LOG_INTAKE': 'Logged at desk',
  'found_item:RECEIVE_AT_DESK': 'Received at desk',
  'found_item:MARK_NOT_RECEIVED': 'Not handed in',
  'found_item:CLAIM_SUBMITTED': 'Claim received',
  'found_item:APPROVE_CLAIM': 'Claim approved',
  'found_item:ALL_CLAIMS_REJECTED': 'Back on the shelf',
  'found_item:HAND_OVER': 'Handed over',
  'found_item:PICKUP_LAPSED': 'Pickup window missed',
  'found_item:EXPIRE': 'Retention ended',
  'found_item:DONATE': 'Donated',
  'found_item:DISPOSE': 'Disposed of',
  'found_item:TRANSFER': 'Transferred',
  'found_item:KEEP': 'Kept longer',
  'found_item:VOID': 'Marked void',
  'lost_report:SUBMIT': 'Lost report submitted',
  'lost_report:MATCH_FOUND': 'Possible match found',
  'lost_report:RESOLVE': 'Lost report resolved',
  'lost_report:EXPIRE': 'Lost report expired',
  'lost_report:RENEW': 'Lost report renewed',
  'lost_report:WITHDRAW': 'Owner found it',
};

/** "RETENTION_EXTENDED" → "Retention extended", for events without a hand-written label. */
function humanise(event: string): string {
  const words = event.toLowerCase().replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

async function activity(tx: Tx): Promise<ActivityEntry[]> {
  const events = await latestEvents(tx, 8, ['found_item', 'lost_report']);
  const names = await memberNames(
    tx,
    events.map((e) => e.actorId).filter((id): id is string => id !== null),
  );
  return events.map((e) => ({
    id: e.id,
    label: ACTIVITY_LABEL[`${e.recordType}:${e.event}`] ?? humanise(e.event),
    recordId: e.recordId,
    actor: e.actorId ? (names.get(e.actorId) ?? 'Staff') : 'System',
    at: e.at,
  }));
}

export async function supervisorOverview(ctx: RequestCtx): Promise<SupervisorOverview> {
  return withTx(
    ctx,
    async (tx) => {
      const counts = await custodyCounts(tx);
      const today = await todayLists(tx);
      const needsDecision: SupervisorOverview['needsDecision'] = [];
      if (counts.awaiting > 0)
        needsDecision.push({
          kind: 'retention',
          title: `${counts.awaiting} ${counts.awaiting === 1 ? 'item is' : 'items are'} past retention`,
          detail: 'Donate, dispose of, transfer or keep longer',
          link: '/supervisor/retention',
          at: counts.oldestAwaiting?.toISOString() ?? null,
        });
      for (const row of today.claimsToReview)
        if (row.due && new Date(row.due) < tx.now)
          needsDecision.push({
            kind: 'claim_overdue',
            title: row.title,
            detail: `Claim review overdue · ${row.id}`,
            link: `/desk/claims/${row.id}`,
            at: row.due,
          });
      const disputes = await openDisputes(tx);
      for (const d of disputes)
        needsDecision.push({
          kind: 'dispute',
          title: `Dispute on ${d.dispatchId ?? d.foundItemId}`,
          detail: `${d.itemTitle} · raised by ${d.raisedBy}`,
          link: `/supervisor/disputes`,
          at: d.createdAt,
        });
      const approvals = (await approvalRows(tx)).filter((a) => !a.approved);
      for (const a of approvals)
        needsDecision.push({
          kind: 'approval',
          title: `Approve handover: ${a.itemTitle}`,
          detail: `${a.claimantName} · requested by ${a.requestedBy}`,
          link: '/supervisor/approvals',
          at: a.requestedAt,
        });
      const flags = await flagsIn(tx);
      return {
        counts: {
          inCustody: counts.held,
          claimsToReview: today.claimsToReview.length,
          returned30Days: await returnedSince(tx, new Date(tx.now.getTime() - 30 * DAY)),
          expiringThisWeek: counts.expiringThisWeek,
        },
        badges: {
          retention: counts.awaiting,
          approvals: approvals.length,
          disputes: disputes.length,
          flags: flags.length,
        },
        needsDecision,
        activity: await activity(tx),
        today,
      };
    },
    { readOnly: true },
  );
}

// ── Policies and closures (Figma 39:26930) ───────────────────────────────────────────────────────

async function settings(tx: Tx): Promise<PolicySettings> {
  return {
    policies: await readPolicies(tx),
    closures: (await listClosures(tx)).map((c) => ({
      id: c.id,
      name: c.name,
      from: c.fromDate,
      to: c.toDate,
    })),
  };
}

export function getPolicySettings(ctx: RequestCtx): Promise<PolicySettings> {
  return withTx(ctx, settings, { readOnly: true });
}

/** Saves the policies; retention ends are recalculated straight away for items on the shelf. */
export function updatePolicies(ctx: RequestCtx, input: Policies): Promise<PolicySettings> {
  return withTx(ctx, async (tx) => {
    const changed = await writePolicies(tx, input);
    if (changed.includes('retentionDays') || changed.includes('lookAlikeRetentionDays'))
      await recalculateRetention(tx);
    return settings(tx);
  });
}

export function addClosure(ctx: RequestCtx, input: AddClosure): Promise<PolicySettings> {
  return withTx(ctx, async (tx) => {
    if (addDays(input.from, MAX_CLOSURE_DAYS) < input.to)
      throw new ValidationFailed({
        to: `A closure can be at most ${MAX_CLOSURE_DAYS} days; split it into shorter ones.`,
      });
    const [clash] = await overlappingClosures(tx, input.from, input.to);
    if (clash)
      throw new ValidationFailed({
        from: `Those dates overlap “${clash.name}”; pick other dates or remove it first.`,
      });
    const id = randomUUID();
    await insertClosure(tx, {
      id,
      name: input.name,
      fromDate: input.from,
      toDate: input.to,
      createdBy: tx.actor.kind === 'user' ? tx.actor.userId : null,
    });
    await recordAuditEvent(tx, {
      recordType: 'closure',
      recordId: id,
      event: 'CLOSURE_ADDED',
      note: `${input.name}: ${input.from} to ${input.to}`,
    });
    await recalculateRetention(tx);
    return settings(tx);
  });
}

export function removeClosure(ctx: RequestCtx, id: string): Promise<PolicySettings> {
  return withTx(ctx, async (tx) => {
    const removed = await deleteClosure(tx, id);
    if (!removed) throw new NotFound("That closure isn't on the list any more; reload the page.");
    await recordAuditEvent(tx, {
      recordType: 'closure',
      recordId: id,
      event: 'CLOSURE_REMOVED',
      note: `${removed.name}: ${removed.fromDate} to ${removed.toDate}`,
    });
    await recalculateRetention(tx);
    return settings(tx);
  });
}

// ── Staff (Figma 39:27640) ───────────────────────────────────────────────────────────────────────

export function getStaff(ctx: RequestCtx): Promise<{ staff: StaffMember[] }> {
  return withTx(ctx, async (tx) => ({ staff: await listStaff(tx) }), { readOnly: true });
}

export function addStaffMember(
  ctx: RequestCtx,
  input: AddStaff,
): Promise<{ staff: StaffMember[] }> {
  return withTx(ctx, async (tx) => {
    const recordId = await addStaff(tx, input, await tenantEmailDomain(tx));
    await recordAuditEvent(tx, {
      recordType: 'staff',
      recordId,
      event: 'STAFF_ADDED',
      note: input.role,
    });
    return { staff: await listStaff(tx) };
  });
}

export function removeStaffMember(
  ctx: RequestCtx,
  email: string,
): Promise<{ staff: StaffMember[] }> {
  return withTx(ctx, async (tx) => {
    const recordId = await removeStaff(tx, email);
    await recordAuditEvent(tx, {
      recordType: 'staff',
      recordId,
      event: 'STAFF_REMOVED',
      note: null,
    });
    return { staff: await listStaff(tx) };
  });
}

// ── Flags (Figma 39:23882, CC-03, CC-14, CC-15) ──────────────────────────────────────────────────

/** Accounts to review: repeat no-show finders, paused claimants, wrong recipients. */
async function flagsIn(tx: Tx): Promise<Flag[]> {
  const clears = await flagClearTimes(tx);
  const fresh = (userId: string, kind: FlagKind, at: Date) => {
    const cleared = clears.get(`${userId}:${kind}`);
    return !cleared || at > cleared;
  };
  const by = new Map<string, { kinds: FlagKind[]; reasons: string[]; since: Date }>();
  const add = (userId: string, kind: FlagKind, reason: string, at: Date) => {
    if (!fresh(userId, kind, at)) return;
    const f = by.get(userId) ?? { kinds: [], reasons: [], since: at };
    if (!f.kinds.includes(kind)) f.kinds.push(kind);
    f.reasons.push(reason);
    if (at < f.since) f.since = at;
    by.set(userId, f);
  };
  for (const n of await noShowFinders(tx))
    add(
      n.userId,
      'no_show_finder',
      `Repeat no-show: ${n.count} found posts never handed in`,
      n.latest,
    );
  for (const v of await failedVerifiers(tx))
    add(
      v.userId,
      'failed_verifications',
      `Claims paused: ${v.failed} failed verifications in 7 days`,
      v.latest,
    );
  for (const f of await accountFlags(tx)) add(f.userId, f.kind, f.reason, f.at);
  const names = await memberNames(tx, [...by.keys()]);
  return [...by].map(([userId, f]) => ({
    userId,
    name: names.get(userId) ?? 'Unknown',
    kinds: f.kinds,
    reasons: f.reasons,
    since: f.since.toISOString(),
  }));
}

export function listFlags(ctx: RequestCtx): Promise<{ flags: Flag[] }> {
  return withTx(ctx, async (tx) => ({ flags: await flagsIn(tx) }), { readOnly: true });
}

/** "Review done — clear": hides this person's current flags and lifts a claim pause. */
export function clearFlag(ctx: RequestCtx, userId: string): Promise<{ flags: Flag[] }> {
  return withTx(ctx, async (tx) => {
    const flag = (await flagsIn(tx)).find((f) => f.userId === userId);
    if (!flag) throw new NotFound('That account has no flags to clear; reload the page.');
    await clearFlags(tx, userId, flag.kinds);
    await recordAuditEvent(tx, {
      recordType: 'account',
      recordId: userId,
      event: 'FLAGS_CLEARED',
      note: flag.kinds.join(', '),
    });
    return { flags: await flagsIn(tx) };
  });
}
