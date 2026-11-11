// Matching (FR-07, US-04, WF-03 "matching runs"): rule-based score from packages/domain, plain
// reasons, at most one alert per owner per pair. Runs as jobs after the change that caused it.
import type { LikelyMatch } from '@lf/contracts';
import {
  DESK_ROLES,
  MATCH_ALERT_SCORE,
  MATCH_LIST_SCORE,
  MATCH_REASON_LABEL,
  topMatches,
  type MatchReason,
} from '@lf/domain';
import { withTx } from '../../platform/db/tx';
import type { RequestCtx, Tx } from '../../platform/db/types';
import { NotFound } from '../../platform/errors';
import {
  custodyItemsIn,
  foundItemFor,
  foundItemsFor,
  itemCards,
  itemTitle,
  lostReportFor,
  lostReportTransition,
  NEVER_PUBLIC_CATEGORIES,
  openLostReportsIn,
  scorePair,
  type FoundItemRow,
  type LostReportRow,
} from '../items';
import { notify, type NotificationsDeps } from '../notifications';
import {
  countMatchRuns,
  insertMatchRun,
  listResultsForReport,
  markAlerted,
  upsertMatchResult,
} from './repo';

export type MatchingDeps = NotificationsDeps;

/** A pair this strong alerts the owner; this strong is listed (thresholds live in @lf/domain). */
export const ALERT_SCORE = MATCH_ALERT_SCORE;
export const LIST_SCORE = MATCH_LIST_SCORE;

const CLAIMABLE = ['IN_CUSTODY', 'CLAIM_PENDING'];
const reasonText = (codes: string[]) =>
  codes.map((c) => MATCH_REASON_LABEL[c as MatchReason] ?? c).join(', ');

async function alertOwner(
  deps: MatchingDeps,
  tx: Tx,
  report: LostReportRow,
  item: FoundItemRow,
  reasons: string[],
) {
  if (report.state === 'OPEN')
    await lostReportTransition(tx, { id: report.id, state: 'OPEN' }, 'MATCH_FOUND', {});
  await notify(deps, tx, {
    userId: report.ownerId,
    kind: 'possible_match',
    title: `Possible match for your ${itemTitle(report).toLowerCase()}`,
    body: `${itemTitle(item)} (${item.id}) is at the Lost & Found Office. ${reasonText(reasons)}.`,
    link: `/lost/${report.id}`,
  });
  await markAlerted(tx, tx.tenantId, report.id, item.id);
}

/** A new lost report against items already at the desk. */
export async function matchLostReport(
  deps: MatchingDeps,
  ctx: RequestCtx,
  reportId: string,
): Promise<{ candidates: number; alerted: number }> {
  return withTx(ctx, async (tx) => {
    const report = await lostReportFor(tx, reportId);
    let candidates = 0;
    let alerted = 0;
    if (
      report &&
      (report.state === 'OPEN' || report.state === 'POSSIBLE_MATCH') &&
      !NEVER_PUBLIC_CATEGORIES.includes(report.category)
    ) {
      const items = await custodyItemsIn(tx, report.category);
      candidates = items.length;
      const best = topMatches(items, (f) => scorePair(report, f));
      let current = report;
      for (const { candidate, match } of best) {
        const saved = await upsertMatchResult(tx, tx.tenantId, {
          lostReportId: report.id,
          foundItemId: candidate.id,
          score: match.score,
          reasons: match.reasons,
        });
        if (match.score >= ALERT_SCORE && !saved.alertedAt && alerted === 0) {
          await alertOwner(deps, tx, current, candidate, match.reasons);
          current = {
            ...current,
            state: current.state === 'OPEN' ? 'POSSIBLE_MATCH' : current.state,
          };
          alerted += 1;
        }
      }
    }
    await insertMatchRun(tx, tx.tenantId, {
      recordType: 'lost_report',
      recordId: reportId,
      candidates,
    });
    return { candidates, alerted };
  });
}

/** An item that just reached the desk against open lost reports (WF-03: owners get alerts). */
export async function matchFoundItem(
  deps: MatchingDeps,
  ctx: RequestCtx,
  foundItemId: string,
): Promise<{ candidates: number; alerted: number }> {
  return withTx(ctx, async (tx) => {
    const item = await foundItemFor(tx, foundItemId);
    let candidates = 0;
    let alerted = 0;
    if (
      item &&
      CLAIMABLE.includes(item.state) &&
      !NEVER_PUBLIC_CATEGORIES.includes(item.category)
    ) {
      const reports = await openLostReportsIn(tx, item.category);
      candidates = reports.length;
      for (const { candidate, match } of topMatches(reports, (r) => scorePair(r, item))) {
        const saved = await upsertMatchResult(tx, tx.tenantId, {
          lostReportId: candidate.id,
          foundItemId: item.id,
          score: match.score,
          reasons: match.reasons,
        });
        if (match.score >= ALERT_SCORE && !saved.alertedAt) {
          await alertOwner(deps, tx, candidate, item, match.reasons);
          alerted += 1;
        }
      }
    }
    await insertMatchRun(tx, tx.tenantId, {
      recordType: 'found_item',
      recordId: foundItemId,
      candidates,
    });
    return { candidates, alerted };
  });
}

/** "Likely matches in custody" for the owner's report (or desk staff). */
export async function likelyMatches(ctx: RequestCtx, reportId: string): Promise<LikelyMatch[]> {
  return withTx(
    ctx,
    async (tx) => {
      const report = await lostReportFor(tx, reportId);
      const actor = ctx.actor;
      const allowed =
        report &&
        actor.kind === 'user' &&
        (report.ownerId === actor.userId || DESK_ROLES.includes(actor.role));
      if (!report || !allowed)
        throw new NotFound("We couldn't find that report; check the ID and try again.");
      const results = (await listResultsForReport(tx, tx.tenantId, reportId)).filter(
        (r) => r.score >= LIST_SCORE,
      );
      const items = (
        await foundItemsFor(
          tx,
          results.map((r) => r.foundItemId),
        )
      ).filter((f) => CLAIMABLE.includes(f.state));
      const cards = await itemCards(tx, items);
      return results.flatMap((r) => {
        const card = cards.get(r.foundItemId);
        return card
          ? [
              {
                ...card,
                score: r.score,
                reasons: r.reasons.map((c) => MATCH_REASON_LABEL[c as MatchReason] ?? c),
              },
            ]
          : [];
      });
    },
    { readOnly: true },
  );
}

export async function matchRunsFor(
  ctx: RequestCtx,
  recordType: string,
  recordId: string,
): Promise<number> {
  return withTx(ctx, (tx) => countMatchRuns(tx, ctx.tenantId, recordType, recordId), {
    readOnly: true,
  });
}
