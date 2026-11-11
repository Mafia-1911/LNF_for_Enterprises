// Retention and disposal (WF-05, US-08, CC-02, NF-09) and lost-report expiry. Same shape as the rest
// of the module: plain functions (deps, ctx, input), one withTx per use case, state changes only
// through the bound transitions.
//   - A daily job recalculates every retention end (policy, look-alikes, "Keep longer", closures),
//     moves items past it to EXPIRED, and sends owners of similar open reports a last-chance alert
//     7 days before.
//   - A supervisor donates, disposes of or transfers expired items (one or many, with a note), or
//     keeps one longer.
//   - An hourly job reminds owners 2 days before their lost report expires, then expires it.
import type { RetentionDecision, RetentionItem, RetentionList, RetentionRun } from '@lf/contracts';
import {
  addDaysToInstant,
  isLookAlike,
  isWithinDaysOf,
  KEEP_LONGER_DAYS,
  LAST_CHANCE_DAYS,
  MATCH_LIST_SCORE,
  REPORT_EXPIRY_REMINDER_DAYS,
  type DisposalDecision,
  type FoundItemEvent,
  type FoundItemState,
} from '@lf/domain';
import { withTx } from '../../platform/db/tx';
import type { RequestCtx, Tx } from '../../platform/db/types';
import { InvalidTransition, NotFound, ValidationFailed } from '../../platform/errors';
import { JOB } from '../../platform/jobs/names';
import { lastEventOf, recordAuditEvent } from '../audit';
import { notify, type NotificationsDeps } from '../notifications';
import {
  deskRowsFor,
  foundItemTransition,
  itemCards,
  itemTitle,
  scorePair,
  type FoundItemRow,
} from './found-items';
import {
  findFoundItem,
  findFoundItems,
  listFoundItemsByState,
  listOpenLostReports,
  listOpenReportsExpiringBy,
  patchFoundItem,
  patchLostReport,
} from './repo';
import { loadRetentionRules, retentionEndOf } from './retention-rules';
import { lostReportTransition } from './service';

const DAY = 86_400_000;
/** The retention clock runs while the item is held, including during a claim. */
const HELD: FoundItemState[] = ['IN_CUSTODY', 'CLAIM_PENDING', 'READY_FOR_PICKUP'];
const DECIDED: FoundItemState[] = ['DONATED', 'DISPOSED', 'TRANSFERRED'];
const ENDING_WITHIN_DAYS = 14;
const DECIDED_SHOWN_DAYS = 90;

const EVENT_FOR: Record<DisposalDecision, FoundItemEvent> = {
  donate: 'DONATE',
  dispose: 'DISPOSE',
  transfer: 'TRANSFER',
};
const DECISION_OF: Partial<Record<string, DisposalDecision>> = {
  DONATE: 'donate',
  DISPOSE: 'dispose',
  TRANSFER: 'transfer',
};

/** Timer side effects are audited as the job, even when a supervisor pressed "Run daily job now". */
function asJob(tx: Tx, job: string): Tx {
  return { ...tx, actor: { kind: 'system', job } };
}

// ── Supervisor: lists and decisions (Figma 39:21973) ─────────────────────────────────────────────

async function toItems(
  tx: Tx,
  rows: FoundItemRow[],
  decisions: Map<
    string,
    { decision: DisposalDecision; at: string; note: string | null }
  > = new Map(),
): Promise<RetentionItem[]> {
  const cards = await itemCards(tx, rows);
  const desk = new Map((await deskRowsFor(tx, rows, () => null)).map((r) => [r.id, r]));
  return rows.map((r) => {
    const place = cards.get(r.id)?.place;
    const decided = decisions.get(r.id);
    return {
      id: r.id,
      state: r.state as FoundItemState,
      category: r.category,
      title: itemTitle(r),
      binCode: r.binCode,
      place: place
        ? [place.buildingCode, place.floorName, place.zoneName].filter(Boolean).join(' · ') || null
        : null,
      photoId: desk.get(r.id)?.sensitive ? null : (desk.get(r.id)?.photoId ?? null),
      sensitive: desk.get(r.id)?.sensitive ?? false,
      lookAlike: isLookAlike(r.category),
      endsAt: r.retentionEndsAt?.toISOString() ?? null,
      decision: decided?.decision ?? null,
      decidedAt: decided?.at ?? null,
      note: decided?.note ?? null,
    };
  });
}

const byEnd = (a: FoundItemRow, b: FoundItemRow) =>
  (a.retentionEndsAt?.getTime() ?? 0) - (b.retentionEndsAt?.getTime() ?? 0);

/** Awaiting a decision (EXPIRED), ending within 14 days, and decided in the last 90 days. */
export async function listRetention(ctx: RequestCtx): Promise<RetentionList> {
  return withTx(
    ctx,
    async (tx) => {
      const rules = await loadRetentionRules(tx);
      const expired = (await listFoundItemsByState(tx, tx.tenantId, ['EXPIRED'])).sort(byEnd);
      const soon = addDaysToInstant(tx.now, ENDING_WITHIN_DAYS);
      const ending = (await listFoundItemsByState(tx, tx.tenantId, ['IN_CUSTODY']))
        .filter((r) => r.retentionEndsAt !== null && r.retentionEndsAt <= soon)
        .sort(byEnd);
      const done = await listFoundItemsByState(
        tx,
        tx.tenantId,
        DECIDED,
        addDaysToInstant(tx.now, -DECIDED_SHOWN_DAYS),
      );
      const last = await lastEventOf(
        tx,
        'found_item',
        done.map((r) => r.id),
      );
      const decisions = new Map<
        string,
        { decision: DisposalDecision; at: string; note: string | null }
      >();
      for (const r of done) {
        const e = last.get(r.id);
        const decision = e ? DECISION_OF[e.event] : undefined;
        // Restricted items are transferred straight from custody (CC-12); only expired ones count.
        if (e && decision && e.fromState === 'EXPIRED')
          decisions.set(r.id, { decision, at: e.at, note: e.note });
      }
      const decided = done
        .filter((r) => decisions.has(r.id))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      return {
        policy: rules.policy,
        awaiting: await toItems(tx, expired),
        ending: await toItems(tx, ending),
        decided: await toItems(tx, decided, decisions),
      };
    },
    { readOnly: true },
  );
}

/** Donate, dispose of or transfer one or more expired items, with a note (WF-05). */
export async function decideRetention(
  ctx: RequestCtx,
  input: RetentionDecision,
): Promise<{ decided: number }> {
  return withTx(ctx, async (tx) => {
    const ids = [...new Set(input.ids)];
    const rows = new Map((await findFoundItems(tx, tx.tenantId, ids)).map((r) => [r.id, r]));
    const missing = ids.filter((id) => !rows.has(id));
    if (missing.length > 0)
      throw new NotFound("We couldn't find some of those items; reload the list and try again.");
    for (const id of ids) {
      const row = rows.get(id);
      if (row?.state !== 'EXPIRED')
        throw new InvalidTransition(
          `${id} is no longer waiting for a decision; reload the list and try again.`,
        );
      await foundItemTransition(
        tx,
        { id, state: 'EXPIRED' },
        EVENT_FOR[input.decision],
        {},
        input.note,
      );
    }
    return { decided: ids.length };
  });
}

/**
 * "Keep longer": 30 more days from now. An expired item goes back on the shelf (KEEP); an item still
 * in custody just gets the extra days.
 */
export async function keepLonger(ctx: RequestCtx, id: string): Promise<RetentionItem> {
  return withTx(ctx, async (tx) => {
    const row = await findFoundItem(tx, tx.tenantId, id);
    if (!row) throw new NotFound("We couldn't find that item; check the ID and try again.");
    const state = row.state as FoundItemState;
    if (state !== 'EXPIRED' && state !== 'IN_CUSTODY')
      throw new ValidationFailed(
        {},
        'Only items on the shelf or past retention can be kept longer; reload the page.',
      );
    const rules = await loadRetentionRules(tx);
    const end = retentionEndOf(rules, row);
    // Days already past the end are added back, so the item really gets 30 days from today.
    const overdue = Math.max(0, Math.ceil((tx.now.getTime() - end.getTime()) / DAY));
    const extra = row.retentionExtraDays + overdue + KEEP_LONGER_DAYS;
    const patch = {
      retentionExtraDays: extra,
      retentionEndsAt: retentionEndOf(rules, { ...row, retentionExtraDays: extra }),
      lastChanceSentAt: null,
    };
    const saved =
      state === 'EXPIRED'
        ? await foundItemTransition(
            tx,
            { id, state },
            'KEEP',
            { patch },
            `Kept ${KEEP_LONGER_DAYS} more days`,
          )
        : await patchFoundItem(tx, tx.tenantId, id, state, patch);
    if (state === 'IN_CUSTODY')
      await recordAuditEvent(tx, {
        recordType: 'found_item',
        recordId: id,
        event: 'RETENTION_EXTENDED',
        note: `Kept ${KEEP_LONGER_DAYS} more days`,
      });
    const [item] = await toItems(tx, [saved]);
    if (!item) throw new Error('keepLonger lost the item');
    return item;
  });
}

// ── The daily retention run ──────────────────────────────────────────────────────────────────────

/** Recalculates retention ends after a policy or closure change ("applies straight away"). */
export async function recalculateRetention(tx: Tx): Promise<number> {
  const rules = await loadRetentionRules(tx);
  let changed = 0;
  for (const row of await listFoundItemsByState(tx, tx.tenantId, HELD)) {
    const end = retentionEndOf(rules, row);
    if (row.retentionEndsAt?.getTime() === end.getTime()) continue;
    await patchFoundItem(tx, tx.tenantId, row.id, row.state as FoundItemState, {
      retentionEndsAt: end,
    });
    changed += 1;
  }
  return changed;
}

async function retentionRun(deps: NotificationsDeps, tx: Tx): Promise<RetentionRun> {
  const job = asJob(tx, JOB.retention);
  const recalculated = await recalculateRetention(tx);
  let expired = 0;
  let lastChanceAlerts = 0;
  for (const row of await listFoundItemsByState(tx, tx.tenantId, ['IN_CUSTODY'])) {
    const end = row.retentionEndsAt;
    if (!end) continue;
    if (end <= tx.now) {
      await foundItemTransition(job, { id: row.id, state: 'IN_CUSTODY' }, 'EXPIRE', {});
      expired += 1;
      continue;
    }
    if (row.lastChanceSentAt || !isWithinDaysOf(end, tx.now, LAST_CHANCE_DAYS)) continue;
    const owners = new Set<string>();
    for (const report of await listOpenLostReports(tx, tx.tenantId, row.category, null)) {
      const match = scorePair(report, row);
      if (match && match.score >= MATCH_LIST_SCORE) owners.add(report.ownerId);
    }
    for (const userId of owners) {
      await notify(deps, job, {
        userId,
        kind: 'last_chance',
        title: `Last chance: is this ${itemTitle(row).toLowerCase()} yours?`,
        body: `${row.id} looks like the item in your lost report and leaves custody in ${LAST_CHANCE_DAYS} days. Open it and tap "This is mine" if it's yours.`,
        link: `/gallery/${row.id}`,
      });
      lastChanceAlerts += 1;
    }
    await patchFoundItem(tx, tx.tenantId, row.id, 'IN_CUSTODY', { lastChanceSentAt: tx.now });
  }
  return { recalculated, expired, lastChanceAlerts };
}

/** The daily job (per tenant, system actor). */
export function runRetention(deps: NotificationsDeps, ctx: RequestCtx): Promise<RetentionRun> {
  return withTx(ctx, (tx) => retentionRun(deps, tx));
}

/** "Run daily job now" (supervisor): the same run, audited as the job, plus who asked for it. */
export function runRetentionNow(deps: NotificationsDeps, ctx: RequestCtx): Promise<RetentionRun> {
  return withTx(ctx, async (tx) => {
    const result = await retentionRun(deps, tx);
    await recordAuditEvent(tx, {
      recordType: 'job',
      recordId: JOB.retention,
      event: 'RUN_NOW',
      note: `${result.expired} expired, ${result.lastChanceAlerts} last-chance alerts`,
    });
    return result;
  });
}

// ── Lost-report expiry (WF-01: open 30 days, one-tap renew) ──────────────────────────────────────

/** Hourly: "expires in 2 days" reminder, then EXPIRED with a renew link. */
export async function runLostReportTimer(
  deps: NotificationsDeps,
  ctx: RequestCtx,
): Promise<{ reminded: number; expired: number }> {
  return withTx(ctx, async (tx) => {
    const job = asJob(tx, JOB.lostReportTimer);
    const until = addDaysToInstant(tx.now, REPORT_EXPIRY_REMINDER_DAYS);
    let reminded = 0;
    let expired = 0;
    for (const row of await listOpenReportsExpiringBy(tx, tx.tenantId, until)) {
      const name = row.shortName ?? 'lost item';
      if (row.expiresAt <= tx.now) {
        await lostReportTransition(job, { id: row.id, state: 'OPEN' }, 'EXPIRE', {});
        await notify(deps, job, {
          userId: row.ownerId,
          kind: 'report_expired',
          title: 'Your lost report has expired',
          body: `${row.id} (${name}) has closed. Renew it if you're still looking.`,
          link: `/lost/${row.id}`,
        });
        expired += 1;
      } else if (!row.expiryReminderSentAt) {
        await notify(deps, job, {
          userId: row.ownerId,
          kind: 'report_expiring',
          title: `Your report expires in ${REPORT_EXPIRY_REMINDER_DAYS} days`,
          body: `${row.id} (${name}) closes soon. Renew it with one tap to keep getting match alerts.`,
          link: `/lost/${row.id}`,
        });
        await patchLostReport(tx, tx.tenantId, row.id, 'OPEN', { expiryReminderSentAt: tx.now });
        reminded += 1;
      }
    }
    return { reminded, expired };
  });
}

/** Overview numbers: held items, ending within a week, and awaiting a decision. */
export async function custodyCounts(tx: Tx): Promise<{
  held: number;
  expiringThisWeek: number;
  awaiting: number;
  oldestAwaiting: Date | null;
}> {
  const held = await listFoundItemsByState(tx, tx.tenantId, HELD);
  const week = addDaysToInstant(tx.now, 7);
  const expired = (await listFoundItemsByState(tx, tx.tenantId, ['EXPIRED'])).sort(byEnd);
  return {
    held: held.length,
    expiringThisWeek: held.filter(
      (r) => r.state === 'IN_CUSTODY' && r.retentionEndsAt !== null && r.retentionEndsAt <= week,
    ).length,
    awaiting: expired.length,
    oldestAwaiting: expired[0]?.retentionEndsAt ?? null,
  };
}

/** Finders with 2+ posts never handed in (Flags page, CC-03 "repeat cases flagged"). */
export async function noShowFinders(
  tx: Tx,
): Promise<{ userId: string; count: number; latest: Date }[]> {
  const by = new Map<string, Date[]>();
  for (const r of await listFoundItemsByState(tx, tx.tenantId, ['NOT_RECEIVED']))
    if (r.finderId) by.set(r.finderId, [...(by.get(r.finderId) ?? []), r.updatedAt]);
  return [...by]
    .filter(([, dates]) => dates.length >= 2)
    .map(([userId, dates]) => ({
      userId,
      count: dates.length,
      latest: new Date(Math.max(...dates.map((d) => d.getTime()))),
    }));
}
