// The supervisor's screens (phase 4): overview, policies and closures, staff. This module sits on top
// of the others and owns no tables: it reads and changes them through their public surfaces.
import { randomUUID } from 'node:crypto';
import type {
  ActivityEntry,
  AddClosure,
  AddStaff,
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
import { todayLists } from '../claims';
import { returnedSince } from '../dispatch';
import { addStaff, listStaff, memberNames, removeStaff } from '../identity';
import { custodyCounts, recalculateRetention } from '../items';

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
      return {
        counts: {
          inCustody: counts.held,
          claimsToReview: today.claimsToReview.length,
          returned30Days: await returnedSince(tx, new Date(tx.now.getTime() - 30 * DAY)),
          expiringThisWeek: counts.expiringThisWeek,
        },
        badges: { retention: counts.awaiting },
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
