// Claims (WF-04, FR-11, FR-12, NF-03, CC-01, CC-11, CC-15, CC-16). Same shape as the golden slice:
// plain functions, one withTx per use case, state changes only through bindTransition. Items and
// lost reports move through their own transitions from items; system steps run as the system actor.
import { randomInt } from 'node:crypto';
import type {
  Approval,
  Claim,
  ClaimStart,
  DeskClaim,
  DeskClaimQueue,
  DeskItemClaims,
  DeskItemRow,
  DeskToday,
  ReviewClaimParsed,
  SubmitClaimParsed,
} from '@lf/contracts';
import {
  addDaysToInstant,
  claimMachine,
  claimQuestions,
  DESK_ROLES,
  DISPUTE_WINDOW_DAYS,
  FAILED_VERIFICATION_LIMIT,
  FAILED_VERIFICATION_WINDOW_DAYS,
  isHighValue,
  pickupWindowEnd,
  privateTicksFor,
  reviewDue,
  type CategoryCode,
  type ClaimState,
  type FoundItemState,
  type LostReportState,
} from '@lf/domain';
import { loadWorkingCalendar } from '../../platform/calendar';
import type { PrivateDetailsCrypto } from '../../platform/crypto';
import { withTx } from '../../platform/db/tx';
import type { RequestCtx, Tx } from '../../platform/db/types';
import { Conflict, Forbidden, NotFound, ValidationFailed } from '../../platform/errors';
import { nextId } from '../../platform/ids';
import { bindTransition, recordAuditEvent } from '../audit';
import { deskInfo, readPolicies } from '../catalog';
import { flagClearedAt, memberNames, memberProfiles } from '../identity';
import {
  deskRowsFor,
  expiringRows,
  firstPhotoOf,
  foundItemFor,
  foundItemPrivateDetails,
  foundItemsFor,
  foundItemTransition,
  itemCards,
  itemTitle,
  lostReportFor,
  lostReportTransition,
  openReportsOf,
  toShelveRows,
  type FoundItemRow,
} from '../items';
import { notify, type NotificationsDeps } from '../notifications';
import { attachPhotos, photosForRecords } from '../photos';
import {
  ACTIVE,
  countActiveByClaimant,
  countFailedFor,
  findClaim,
  insertClaim,
  listApprovalRequests,
  listApprovedDueReminder,
  listApprovedPastWindow,
  listByClaimant,
  listByState,
  listForItem,
  listRecentRejections,
  listRejectionsSince,
  patchClaim,
  updateClaimState,
  type ClaimPatch,
  type ClaimRow,
  type NewClaim,
} from './repo';

export type ClaimsDeps = NotificationsDeps & { crypto: PrivateDetailsCrypto };

type ClaimRecord = { id: string; state: ClaimState | null };
type ClaimChange = { values?: NewClaim; patch?: ClaimPatch };

export const claimTransition = bindTransition({
  recordType: 'claim',
  machine: claimMachine,
  create: (tx, record: ClaimRecord, to, data: ClaimChange) => {
    if (!data.values) throw new Error('Creating a claim needs values.');
    return insertClaim(tx, tx.tenantId, record.id, to, data.values);
  },
  update: (tx, record: ClaimRecord, to, data: ClaimChange) => {
    if (record.state === null) throw new Error('Updating needs the current state.');
    return updateClaimState(tx, tx.tenantId, record.id, record.state, to, data.patch);
  },
});

const CLAIMABLE: FoundItemState[] = ['IN_CUSTODY', 'CLAIM_PENDING'];
const OPEN_CLAIM: ClaimState[] = ['SUBMITTED', 'MORE_INFO_REQUESTED'];
const NOT_FOUND = "We couldn't find that claim; check the ID and try again.";

type Answer = { key: string; question: string; answer: string };

/** System steps (item and report side effects) are audited as the system, not the person. */
function asSystem(tx: Tx): Tx {
  return { ...tx, actor: { kind: 'system', job: 'claims' } };
}

function isDesk(ctx: { actor: RequestCtx['actor'] }) {
  return ctx.actor.kind === 'user' && DESK_ROLES.includes(ctx.actor.role);
}

const answersAad = (tenantId: string, id: string) => `${tenantId}:claim:${id}`;
const codeAad = (tenantId: string, id: string) => `${tenantId}:claim:${id}:pickup`;

function readAnswers(deps: ClaimsDeps, tenantId: string, row: ClaimRow): Answer[] {
  return JSON.parse(
    deps.crypto.decrypt(
      { ciphertext: row.answersCiphertext, keyVersion: row.keyVersion },
      answersAad(tenantId, row.id),
    ),
  ) as Answer[];
}

function readCode(deps: ClaimsDeps, tenantId: string, row: ClaimRow): string | null {
  if (!row.pickupCodeCiphertext || row.pickupKeyVersion === null) return null;
  return deps.crypto.decrypt(
    { ciphertext: row.pickupCodeCiphertext, keyVersion: row.pickupKeyVersion },
    codeAad(tenantId, row.id),
  );
}

/** CC-15: three failed verifications in 7 days pause claim rights until the oldest falls out. */
async function pausedUntil(tx: Tx, claimantId: string): Promise<Date | null> {
  const since = addDaysToInstant(tx.now, -FAILED_VERIFICATION_WINDOW_DAYS);
  // A supervisor's "Review done — clear" (Flags page) lifts the pause (CC-15 "pending review").
  const cleared = await flagClearedAt(tx, claimantId, 'failed_verifications');
  const failed = (await listRecentRejections(tx, tx.tenantId, claimantId, since))
    .filter((r) => Object.values(r.verdicts).includes('fail'))
    .filter((r) => !cleared || (r.decidedAt !== null && r.decidedAt > cleared))
    .map((r) => r.decidedAt as Date)
    .sort((a, b) => a.getTime() - b.getTime());
  if (failed.length < FAILED_VERIFICATION_LIMIT) return null;
  const oldest = failed[failed.length - FAILED_VERIFICATION_LIMIT];
  return oldest ? addDaysToInstant(oldest, FAILED_VERIFICATION_WINDOW_DAYS) : null;
}

const dhakaDay = (d: Date) =>
  d.toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short' });

/** Why this person can't claim this item now, or null. */
async function blockedReason(
  tx: Tx,
  item: FoundItemRow,
  claimantId: string,
  existing: ClaimRow | undefined,
) {
  if (!CLAIMABLE.includes(item.state as FoundItemState))
    return "This item can't be claimed right now; ask the Lost & Found office.";
  if (item.finderId === claimantId) return 'You found this item, so you can’t claim it.';
  if (existing && existing.state !== 'WITHDRAWN')
    return 'You already claimed this item; open My activity to see the claim.';
  const cap = (await readPolicies(tx)).activeClaimCap;
  if ((await countActiveByClaimant(tx, tx.tenantId, claimantId)) >= cap)
    return `You already have ${cap} open ${cap === 1 ? 'claim' : 'claims'}; wait for a decision before making another.`;
  const paused = await pausedUntil(tx, claimantId);
  if (paused)
    return `New claims are paused until ${dhakaDay(paused)} after three answers didn’t match; ask the desk if this is wrong.`;
  return null;
}

// ── Claimant ───────────────────────────────────────────────────────────────────────────────────

/** "This is mine": the item, its questions, and my open reports to link (WF-04 steps 1–2). */
export async function startClaim(
  deps: ClaimsDeps,
  ctx: RequestCtx,
  foundItemId: string,
): Promise<ClaimStart> {
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();
  return withTx(
    ctx,
    async (tx) => {
      const item = await foundItemFor(tx, foundItemId);
      if (!item || item.category === 'university_id' || item.state === 'REPORTED_BY_FINDER')
        throw new NotFound("We couldn't find that item; check the ID and try again.");
      const card = (await itemCards(tx, [item])).get(item.id);
      if (!card) throw new NotFound("We couldn't find that item; check the ID and try again.");
      const details = await foundItemPrivateDetails(deps, tx, item.id);
      const mine = (await listByClaimant(tx, tx.tenantId, actor.userId)).find(
        (c) => c.foundItemId === item.id,
      );
      const reports = await myOpenReports(tx, actor.userId, item.category);
      return {
        item: card,
        questions: claimQuestions(details.ticks),
        myClaim: mine ? { id: mine.id, state: mine.state as ClaimState } : null,
        myLostReports: reports,
        blockedReason: await blockedReason(tx, item, actor.userId, mine),
      };
    },
    { readOnly: true },
  );
}

async function myOpenReports(tx: Tx, userId: string, category: string) {
  return (await openReportsOf(tx, userId, category)).map((r) => ({
    id: r.id,
    title: itemTitle(r),
  }));
}

/** WF-04: answers questions only the owner could answer (NF-03). Max 3 open claims (FR-11). */
export async function submitClaim(
  deps: ClaimsDeps,
  ctx: RequestCtx,
  foundItemId: string,
  input: SubmitClaimParsed,
): Promise<Claim> {
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();
  const id = await withTx(ctx, async (tx) => {
    const item = await foundItemFor(tx, foundItemId);
    if (!item || item.category === 'university_id' || item.state === 'REPORTED_BY_FINDER')
      throw new NotFound("We couldn't find that item; check the ID and try again.");
    const mine = (await listByClaimant(tx, tx.tenantId, actor.userId)).find(
      (c) => c.foundItemId === item.id,
    );
    const blocked = await blockedReason(tx, item, actor.userId, mine);
    if (blocked) throw new Conflict(blocked);

    const details = await foundItemPrivateDetails(deps, tx, item.id);
    const questions = claimQuestions(details.ticks);
    const byKey = new Map(input.answers.map((a) => [a.key, a.answer]));
    const missing = questions.find((q) => !byKey.get(q.key));
    if (missing)
      throw new ValidationFailed({
        [`answers.${missing.key}`]: 'Answer the question; a few words are enough.',
      });

    let lostReportId: string | null = null;
    if (input.lostReportId) {
      const report = await lostReportFor(tx, input.lostReportId);
      const linkable =
        report &&
        report.ownerId === actor.userId &&
        ['OPEN', 'POSSIBLE_MATCH'].includes(report.state);
      if (!linkable)
        throw new ValidationFailed({
          lostReportId: "That report isn't open any more; pick another or none.",
        });
      lostReportId = report.id;
    }

    const newId = await nextId(tx, 'CLM');
    const answers: Answer[] = questions.map((q) => ({ ...q, answer: byKey.get(q.key) ?? '' }));
    const encrypted = deps.crypto.encrypt(JSON.stringify(answers), answersAad(tx.tenantId, newId));
    const calendar = await loadWorkingCalendar(tx);
    await claimTransition(tx, { id: newId, state: null }, 'SUBMIT', {
      values: {
        foundItemId: item.id,
        claimantId: actor.userId,
        lostReportId,
        questions,
        answersCiphertext: encrypted.ciphertext,
        keyVersion: encrypted.keyVersion,
        verdicts: {},
        reviewDueAt: reviewDue(tx.now, calendar),
      },
    });
    await attachPhotos(
      tx,
      input.proofPhotoIds,
      {
        recordType: 'claim',
        recordId: newId,
        purpose: 'proof',
        visibility: 'staff',
      },
      'proofPhotoIds',
    );
    if (item.state === 'IN_CUSTODY')
      await foundItemTransition(
        asSystem(tx),
        { id: item.id, state: 'IN_CUSTODY' },
        'CLAIM_SUBMITTED',
        {},
      );
    if (lostReportId) {
      const report = await lostReportFor(tx, lostReportId);
      if (report && (report.state === 'OPEN' || report.state === 'POSSIBLE_MATCH'))
        await lostReportTransition(tx, { id: report.id, state: report.state }, 'CLAIM', {});
    }
    await notify(deps, tx, {
      userId: actor.userId,
      kind: 'claim_update',
      title: 'Claim received',
      body: `We’ll check your answers for ${itemTitle(item).toLowerCase()} and decide within 2 working days.`,
      link: `/claims/${newId}`,
    });
    return newId;
  });
  return getMyClaim(deps, ctx, id);
}

async function toClaimView(
  deps: ClaimsDeps,
  tx: Tx,
  row: ClaimRow,
  items: Map<string, FoundItemRow>,
): Promise<Claim> {
  const item = items.get(row.foundItemId);
  if (!item) throw new NotFound(NOT_FOUND);
  const card = (await itemCards(tx, [item])).get(item.id);
  if (!card) throw new NotFound(NOT_FOUND);
  return {
    id: row.id,
    state: row.state as ClaimState,
    item: card,
    lostReportId: row.lostReportId,
    answers: readAnswers(deps, tx.tenantId, row),
    moreInfoRequest: row.state === 'MORE_INFO_REQUESTED' ? row.moreInfoRequest : null,
    decisionNote: row.decisionNote,
    pickupCode: row.state === 'APPROVED' ? readCode(deps, tx.tenantId, row) : null,
    pickupEndsAt: row.state === 'APPROVED' ? (row.pickupEndsAt?.toISOString() ?? null) : null,
    reviewDueAt: row.reviewDueAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    desk: await deskInfo(tx),
    canReRequest: row.state === 'LAPSED' && !row.reRequested && item.state === 'IN_CUSTODY',
    canDispute: disputable(tx, row, item),
  };
}

const DAY = 86_400_000;
/** WF-06: a closed or rejected claim within 7 days (CC-01); a collected one within 30 (CC-14). */
function disputable(tx: Tx, row: ClaimRow, item: FoundItemRow): Claim['canDispute'] {
  const age = tx.now.getTime() - row.updatedAt.getTime();
  // Cancelled because the item went to someone else (not because the owner withdrew), or rejected.
  const lost =
    row.state === 'REJECTED' ||
    (row.state === 'CANCELLED' && ['READY_FOR_PICKUP', 'DISPATCHED'].includes(item.state));
  if (lost && age <= DISPUTE_WINDOW_DAYS * DAY) return 'second_claimant';
  if (row.state === 'COLLECTED' && age <= 30 * DAY) return 'wrong_handover';
  return null;
}

export async function listMyClaims(deps: ClaimsDeps, ctx: RequestCtx): Promise<Claim[]> {
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();
  return withTx(
    ctx,
    async (tx) => {
      const rows = await listByClaimant(tx, tx.tenantId, actor.userId);
      const items = new Map(
        (
          await foundItemsFor(
            tx,
            rows.map((r) => r.foundItemId),
          )
        ).map((i) => [i.id, i]),
      );
      const out: Claim[] = [];
      for (const row of rows) out.push(await toClaimView(deps, tx, row, items));
      return out;
    },
    { readOnly: true },
  );
}

async function ownClaim(tx: Tx, ctx: RequestCtx, id: string): Promise<ClaimRow> {
  const row = await findClaim(tx, tx.tenantId, id);
  if (!row || ctx.actor.kind !== 'user' || row.claimantId !== ctx.actor.userId)
    throw new NotFound(NOT_FOUND);
  return row;
}

export async function getMyClaim(deps: ClaimsDeps, ctx: RequestCtx, id: string): Promise<Claim> {
  return withTx(
    ctx,
    async (tx) => {
      const row = await ownClaim(tx, ctx, id);
      const items = new Map((await foundItemsFor(tx, [row.foundItemId])).map((i) => [i.id, i]));
      return toClaimView(deps, tx, row, items);
    },
    { readOnly: true },
  );
}

/** After a claim ends without a handover: free the item and the report again (CC-01, CC-11). */
async function afterClaimEnded(tx: Tx, claim: ClaimRow, lapsed = false) {
  const item = await foundItemFor(tx, claim.foundItemId);
  if (item) {
    if (lapsed && item.state === 'READY_FOR_PICKUP')
      await foundItemTransition(
        asSystem(tx),
        { id: item.id, state: 'READY_FOR_PICKUP' },
        'PICKUP_LAPSED',
        {},
      );
    if (item.state === 'CLAIM_PENDING') {
      const stillOpen = (await listForItem(tx, tx.tenantId, item.id)).some(
        (c) => c.id !== claim.id && OPEN_CLAIM.includes(c.state as ClaimState),
      );
      if (!stillOpen)
        await foundItemTransition(
          asSystem(tx),
          { id: item.id, state: 'CLAIM_PENDING' },
          'ALL_CLAIMS_REJECTED',
          {},
        );
    }
  }
  if (claim.lostReportId) {
    const report = await lostReportFor(tx, claim.lostReportId);
    if (report?.state === 'CLAIMED')
      await lostReportTransition(
        asSystem(tx),
        { id: report.id, state: 'CLAIMED' },
        'CLAIM_ENDED',
        {},
      );
  }
}

export async function withdrawClaim(deps: ClaimsDeps, ctx: RequestCtx, id: string): Promise<Claim> {
  await withTx(ctx, async (tx) => {
    const row = await ownClaim(tx, ctx, id);
    const ended = await claimTransition(tx, { id, state: row.state as ClaimState }, 'WITHDRAW', {});
    await afterClaimEnded(tx, ended);
  });
  return getMyClaim(deps, ctx, id);
}

/** The desk asked for more: the answer is added to the encrypted answers and it goes back to review. */
export async function provideMore(
  deps: ClaimsDeps,
  ctx: RequestCtx,
  id: string,
  answer: string,
): Promise<Claim> {
  await withTx(ctx, async (tx) => {
    const row = await ownClaim(tx, ctx, id);
    if (row.state !== 'MORE_INFO_REQUESTED')
      throw new Conflict('The desk isn’t waiting for an answer on this claim; refresh the page.');
    const answers = readAnswers(deps, tx.tenantId, row);
    answers.push({
      key: `more_${answers.length + 1}`,
      question: row.moreInfoRequest ?? 'More details',
      answer: answer.trim(),
    });
    const encrypted = deps.crypto.encrypt(JSON.stringify(answers), answersAad(tx.tenantId, id));
    const calendar = await loadWorkingCalendar(tx);
    await claimTransition(tx, { id, state: 'MORE_INFO_REQUESTED' }, 'PROVIDE_MORE', {
      patch: {
        answersCiphertext: encrypted.ciphertext,
        keyVersion: encrypted.keyVersion,
        reviewDueAt: reviewDue(tx.now, calendar),
      },
    });
  });
  return getMyClaim(deps, ctx, id);
}

/** CC-11: the owner can re-request a lapsed pickup once, while the item is still at the desk. */
export async function reRequestClaim(
  deps: ClaimsDeps,
  ctx: RequestCtx,
  id: string,
): Promise<Claim> {
  await withTx(ctx, async (tx) => {
    const row = await ownClaim(tx, ctx, id);
    const item = await foundItemFor(tx, row.foundItemId);
    if (row.state !== 'LAPSED' || row.reRequested || item?.state !== 'IN_CUSTODY')
      throw new Conflict('This claim can’t be re-requested; ask the Lost & Found office.');
    const calendar = await loadWorkingCalendar(tx);
    await claimTransition(tx, { id, state: 'LAPSED' }, 'RE_REQUEST', {
      patch: {
        reRequested: true,
        reviewDueAt: reviewDue(tx.now, calendar),
        pickupCodeCiphertext: null,
        pickupEndsAt: null,
      },
    });
    await foundItemTransition(
      asSystem(tx),
      { id: item.id, state: 'IN_CUSTODY' },
      'CLAIM_SUBMITTED',
      {},
    );
  });
  return getMyClaim(deps, ctx, id);
}

/** CC-16: the owner found it themselves. Open claims linked to the report are cancelled. */
export async function withdrawLostReport(deps: ClaimsDeps, ctx: RequestCtx, reportId: string) {
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();
  await withTx(ctx, async (tx) => {
    const report = await lostReportFor(tx, reportId);
    if (!report || report.ownerId !== actor.userId)
      throw new NotFound("We couldn't find that report; check the ID and try again.");
    await lostReportTransition(
      tx,
      { id: report.id, state: report.state as LostReportState },
      'WITHDRAW',
      {},
    );
    for (const claim of await listByClaimant(tx, tx.tenantId, actor.userId)) {
      if (claim.lostReportId !== report.id || !OPEN_CLAIM.includes(claim.state as ClaimState))
        continue;
      const ended = await claimTransition(
        asSystem(tx),
        { id: claim.id, state: claim.state as ClaimState },
        'CANCEL',
        {},
        'Lost report withdrawn by the owner',
      );
      await afterClaimEnded(tx, { ...ended, lostReportId: null });
    }
  });
}

// ── Desk ───────────────────────────────────────────────────────────────────────────────────────

/** "Check claims" (Figma 39:15044): items with claims waiting, soonest deadline first. */
export async function deskClaimQueue(ctx: RequestCtx): Promise<DeskClaimQueue> {
  if (!isDesk(ctx)) throw new Forbidden();
  return withTx(
    ctx,
    async (tx) => {
      const waiting = await listByState(tx, tx.tenantId, ['SUBMITTED']);
      const byItem = new Map<string, ClaimRow[]>();
      for (const c of waiting) byItem.set(c.foundItemId, [...(byItem.get(c.foundItemId) ?? []), c]);
      const items = await foundItemsFor(tx, [...byItem.keys()]);
      const rows = await deskRowsFor(tx, items, () => null);
      const rowById = new Map(rows.map((r) => [r.id, r]));
      return {
        items: [...byItem.entries()]
          .map(([itemId, list]) => {
            const item = rowById.get(itemId);
            const due = list.map((c) => c.reviewDueAt).sort((a, b) => a.getTime() - b.getTime())[0];
            return item && due ? { item, claims: list.length, dueAt: due.toISOString() } : null;
          })
          .filter((x): x is { item: DeskItemRow; claims: number; dueAt: string } => x !== null)
          .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
      };
    },
    { readOnly: true },
  );
}

/** Side by side (FR-12): every claim on one item next to what was recorded at intake. */
export async function deskItemClaims(
  deps: ClaimsDeps,
  ctx: RequestCtx,
  foundItemId: string,
): Promise<DeskItemClaims> {
  if (!isDesk(ctx)) throw new Forbidden();
  return withTx(
    ctx,
    async (tx) => {
      const item = await foundItemFor(tx, foundItemId);
      if (!item) throw new NotFound("We couldn't find that item; check the ID and try again.");
      const details = await foundItemPrivateDetails(deps, tx, item.id);
      const list = (await listForItem(tx, tx.tenantId, item.id)).filter(
        (c) => c.state !== 'WITHDRAWN',
      );
      const profiles = await memberProfiles(
        tx,
        list.map((c) => c.claimantId),
      );
      const failed = await countFailedFor(
        tx,
        tx.tenantId,
        list.map((c) => c.claimantId),
      );
      const proofs = await photosForRecords(
        tx,
        'claim',
        list.map((c) => c.id),
      );
      const labels = new Map(
        privateTicksFor(item.category as CategoryCode).map((t) => [t.code, t.label]),
      );
      return {
        item: {
          id: item.id,
          title: itemTitle(item),
          state: item.state,
          category: item.category,
          binCode: item.binCode,
          photoId: await firstPhotoOf(tx, item.id),
        },
        recorded: {
          ticks: details.ticks.map((code) => ({ code, label: labels.get(code) ?? code })),
          note: details.note,
        },
        claims: list.map((c): DeskClaim => {
          const who = profiles.get(c.claimantId);
          return {
            id: c.id,
            state: c.state as ClaimState,
            claimant: {
              name: who?.name ?? 'Unknown',
              title: who?.title ?? null,
              role: who?.role ?? 'none',
            },
            submittedAt: c.createdAt.toISOString(),
            dueAt: c.reviewDueAt.toISOString(),
            lostReportId: c.lostReportId,
            failedVerifications: failed.get(c.claimantId) ?? 0,
            answers: readAnswers(deps, tx.tenantId, c).map((a) => ({
              ...a,
              verdict: c.verdicts[a.key] ?? null,
            })),
            moreInfoRequest: c.moreInfoRequest,
            decisionNote: c.decisionNote,
            proofPhotoIds: (proofs.get(c.id) ?? []).map((p) => p.id),
          };
        }),
      };
    },
    { readOnly: true },
  );
}

/** A 6-digit code no other approved claim at this university is using. */
async function freshPickupCode(deps: ClaimsDeps, tx: Tx): Promise<string> {
  const used = new Set(
    (await listByState(tx, tx.tenantId, ['APPROVED'])).map((c) => readCode(deps, tx.tenantId, c)),
  );
  for (;;) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (!used.has(code)) return code;
  }
}

/** Approve, reject or ask for more (WF-04 step 3). Approval cancels the other claims (CC-01). */
export async function reviewClaim(
  deps: ClaimsDeps,
  ctx: RequestCtx,
  claimId: string,
  input: ReviewClaimParsed,
): Promise<DeskItemClaims> {
  const actor = ctx.actor;
  if (!isDesk(ctx) || actor.kind !== 'user') throw new Forbidden();
  const itemId = await withTx(ctx, async (tx) => {
    const claim = await findClaim(tx, tx.tenantId, claimId);
    if (!claim) throw new NotFound(NOT_FOUND);
    const keys = readAnswers(deps, tx.tenantId, claim).map((a) => a.key);
    const verdicts = Object.fromEntries(
      Object.entries(input.verdicts).filter(([k]) => keys.includes(k)),
    );
    const item = await foundItemFor(tx, claim.foundItemId);
    if (!item) throw new NotFound(NOT_FOUND);
    const decided = {
      verdicts,
      decidedBy: actor.userId,
      decidedAt: tx.now,
      decisionNote: input.note,
    };

    if (input.decision === 'approve') {
      if (keys.some((k) => verdicts[k] !== 'pass'))
        throw new ValidationFailed({
          verdicts: 'Mark every answer Pass before approving, or reject or ask for more.',
        });
      const code = await freshPickupCode(deps, tx);
      const encrypted = deps.crypto.encrypt(code, codeAad(tx.tenantId, claim.id));
      const calendar = await loadWorkingCalendar(tx);
      const endsAt = pickupWindowEnd(tx.now, calendar, (await readPolicies(tx)).pickupWindowDays);
      await claimTransition(
        tx,
        { id: claim.id, state: claim.state as ClaimState },
        'APPROVE',
        {
          patch: {
            ...decided,
            pickupCodeCiphertext: encrypted.ciphertext,
            pickupKeyVersion: encrypted.keyVersion,
            pickupEndsAt: endsAt,
          },
        },
        input.note,
      );
      await foundItemTransition(
        tx,
        { id: item.id, state: item.state as FoundItemState },
        'APPROVE_CLAIM',
        {},
      );
      await notify(deps, tx, {
        userId: claim.claimantId,
        kind: 'claim_update',
        title: 'Claim approved: pickup code ready',
        body: `Your claim for ${itemTitle(item).toLowerCase()} was approved. Open the claim to see your pickup code, and bring your university ID (or NID for visitors) to the L&F Office by ${dhakaDay(endsAt)}.`,
        link: `/claims/${claim.id}`,
      });
      for (const other of await listForItem(tx, tx.tenantId, item.id)) {
        if (other.id === claim.id || !OPEN_CLAIM.includes(other.state as ClaimState)) continue;
        await claimTransition(
          asSystem(tx),
          { id: other.id, state: other.state as ClaimState },
          'CANCEL',
          {},
          `Another claim (${claim.id}) was approved`,
        );
        if (other.lostReportId) {
          const report = await lostReportFor(tx, other.lostReportId);
          if (report?.state === 'CLAIMED')
            await lostReportTransition(
              asSystem(tx),
              { id: report.id, state: 'CLAIMED' },
              'CLAIM_ENDED',
              {},
            );
        }
        await notify(deps, tx, {
          userId: other.claimantId,
          kind: 'claim_update',
          title: 'Your claim was closed',
          body: `The item went to an owner whose answers matched. If you think this is wrong, open the claim and tap "Dispute" within 7 days.`,
          link: `/claims/${other.id}`,
        });
      }
    } else if (input.decision === 'reject') {
      const ended = await claimTransition(
        tx,
        { id: claim.id, state: claim.state as ClaimState },
        'REJECT',
        { patch: decided },
        input.note,
      );
      await afterClaimEnded(tx, ended);
      await notify(deps, tx, {
        userId: claim.claimantId,
        kind: 'claim_update',
        title: 'Your claim wasn’t approved',
        body: input.note
          ? `The desk couldn’t match your answers: ${input.note}`
          : 'The desk couldn’t match your answers to the item. Ask the L&F Office if you think this is wrong.',
        link: `/claims/${claim.id}`,
      });
    } else {
      if (!input.note) throw new ValidationFailed({ note: 'Say what you need from them.' });
      await claimTransition(
        tx,
        { id: claim.id, state: claim.state as ClaimState },
        'ASK_FOR_MORE',
        {
          patch: { ...decided, moreInfoRequest: input.note },
        },
        input.note,
      );
      await notify(deps, tx, {
        userId: claim.claimantId,
        kind: 'claim_update',
        title: 'The desk needs a bit more from you',
        body: input.note,
        link: `/claims/${claim.id}`,
      });
    }
    return item.id;
  });
  return deskItemClaims(deps, ctx, itemId);
}

/** The desk "Today" list (Figma 39:11179): to shelve, claims to review, pickups due, expiring. */
export async function deskToday(ctx: RequestCtx): Promise<DeskToday> {
  if (!isDesk(ctx)) throw new Forbidden();
  return withTx(ctx, todayLists, { readOnly: true });
}

/** The desk's Today lists inside the caller's transaction (desk home, supervisor overview). */
export async function todayLists(tx: Tx): Promise<DeskToday> {
  const waiting = await listByState(tx, tx.tenantId, ['SUBMITTED']);
  const approved = await listByState(tx, tx.tenantId, ['APPROVED']);
  const items = new Map(
    (
      await foundItemsFor(tx, [...new Set([...waiting, ...approved].map((c) => c.foundItemId))])
    ).map((i) => [i.id, i]),
  );
  const due = new Map<string, Date | null>();
  for (const c of waiting) if (!due.has(c.foundItemId)) due.set(c.foundItemId, c.reviewDueAt);
  const reviewRows = await deskRowsFor(
    tx,
    [...due.keys()].map((id) => items.get(id)).filter((i): i is FoundItemRow => i !== undefined),
    (r) => due.get(r.id) ?? null,
  );
  const pickupRows = await deskRowsFor(
    tx,
    approved.map((c) => items.get(c.foundItemId)).filter((i): i is FoundItemRow => i !== undefined),
    (r) => approved.find((c) => c.foundItemId === r.id)?.pickupEndsAt ?? null,
  );
  return {
    toShelve: await toShelveRows(tx),
    claimsToReview: reviewRows,
    pickupsDue: pickupRows,
    expiringThisWeek: await expiringRows(tx, addDaysToInstant(tx.now, 7)),
  };
}

// ── Timers (CC-11) ─────────────────────────────────────────────────────────────────────────────

/** Hourly: one reminder a day before the pickup window closes; then the claim lapses. */
export async function runPickupTimer(
  deps: ClaimsDeps,
  ctx: RequestCtx,
): Promise<{ reminded: number; lapsed: number }> {
  return withTx(ctx, async (tx) => {
    let reminded = 0;
    for (const c of await listApprovedDueReminder(tx, tx.tenantId, addDaysToInstant(tx.now, 1))) {
      if (c.pickupEndsAt && c.pickupEndsAt <= tx.now) continue;
      await notify(deps, tx, {
        userId: c.claimantId,
        kind: 'claim_update',
        title: 'Your pickup window closes soon',
        body: `Collect your item by ${c.pickupEndsAt ? dhakaDay(c.pickupEndsAt) : 'tomorrow'} with your pickup code and ID.`,
        link: `/claims/${c.id}`,
      });
      await patchClaim(tx, tx.tenantId, c.id, 'APPROVED', { reminderSentAt: tx.now });
      reminded += 1;
    }
    const late = await listApprovedPastWindow(tx, tx.tenantId, tx.now);
    for (const c of late) {
      const ended = await claimTransition(tx, { id: c.id, state: 'APPROVED' }, 'LAPSE', {
        patch: { pickupCodeCiphertext: null },
      });
      await afterClaimEnded(tx, ended, true);
      await notify(deps, tx, {
        userId: c.claimantId,
        kind: 'claim_update',
        title: 'Your pickup window closed',
        body: 'The item went back on the shelf. You can re-request it once from the claim page.',
        link: `/claims/${c.id}`,
      });
    }
    return { reminded, lapsed: late.length };
  });
}

// ── For the dispatch module ────────────────────────────────────────────────────────────────────

/** The approved claim using this pickup code, or null (desk lookup, WF-04 step 5). */
export async function approvedClaimByCode(
  deps: ClaimsDeps,
  tx: Tx,
  code: string,
): Promise<ClaimRow | null> {
  for (const c of await listByState(tx, tx.tenantId, ['APPROVED']))
    if (readCode(deps, tx.tenantId, c) === code) return c;
  return null;
}

export function claimFor(tx: Tx, id: string): Promise<ClaimRow | null> {
  return findClaim(tx, tx.tenantId, id);
}

/** WF-04 step 7: the claim is collected. */
export function collectClaim(tx: Tx, claim: ClaimRow, note: string): Promise<ClaimRow> {
  return claimTransition(
    tx,
    { id: claim.id, state: 'APPROVED' },
    'HAND_OVER',
    { patch: { pickupCodeCiphertext: null } },
    note,
  );
}

export type { ClaimRow };
export { ACTIVE as ACTIVE_CLAIM_STATES };

// ── High-value approvals (CC-08, CC-10) ───────────────────────────────────────────────────────────

/** Where a claim's supervisor approval stands (desk pickup screen). */
export function approvalOf(row: ClaimRow): 'none' | 'requested' | 'approved' {
  if (row.supervisorApprovedAt) return 'approved';
  return row.approvalRequestedAt ? 'requested' : 'none';
}

/** The desk asks a supervisor to approve a high-value handover. */
export async function requestApproval(
  ctx: RequestCtx,
  claimId: string,
): Promise<{ approval: 'none' | 'requested' | 'approved' }> {
  const actor = ctx.actor;
  if (actor.kind !== 'user' || !DESK_ROLES.includes(actor.role)) throw new Forbidden();
  return withTx(ctx, async (tx) => {
    const row = await findClaim(tx, tx.tenantId, claimId);
    if (!row || row.state !== 'APPROVED') throw new NotFound(NOT_FOUND);
    const item = await foundItemFor(tx, row.foundItemId);
    if (!item || !isHighValue(item.category))
      throw new ValidationFailed(
        {},
        'Only high-value items need a supervisor; finish the handover.',
      );
    if (row.approvalRequestedAt) return { approval: approvalOf(row) };
    const saved = await patchClaim(tx, tx.tenantId, row.id, 'APPROVED', {
      approvalRequestedAt: tx.now,
      approvalRequestedBy: actor.userId,
    });
    await recordAuditEvent(tx, {
      recordType: 'claim',
      recordId: row.id,
      event: 'APPROVAL_REQUESTED',
      note: null,
    });
    return { approval: approvalOf(saved) };
  });
}

/** Approval requests waiting for (or given by) a supervisor. */
export function listApprovals(ctx: RequestCtx): Promise<Approval[]> {
  return withTx(ctx, approvalRows, { readOnly: true });
}

/** The same list inside the caller's transaction (supervisor overview). */
export async function approvalRows(tx: Tx): Promise<Approval[]> {
  const rows = await listApprovalRequests(tx, tx.tenantId);
  const items = new Map(
    (
      await foundItemsFor(
        tx,
        rows.map((r) => r.foundItemId),
      )
    ).map((i) => [i.id, i]),
  );
  const people = await memberProfiles(
    tx,
    rows.map((r) => r.claimantId),
  );
  const officers = await memberNames(
    tx,
    rows.map((r) => r.approvalRequestedBy).filter((v): v is string => v !== null),
  );
  return rows.map((r) => {
    const item = items.get(r.foundItemId);
    return {
      claimId: r.id,
      foundItemId: r.foundItemId,
      itemTitle: item ? itemTitle(item) : r.foundItemId,
      category: item?.category ?? 'other',
      claimantName: people.get(r.claimantId)?.name ?? 'Unknown',
      claimantRole: people.get(r.claimantId)?.role ?? 'none',
      requestedBy: r.approvalRequestedBy
        ? (officers.get(r.approvalRequestedBy) ?? 'Staff')
        : 'Staff',
      requestedAt: (r.approvalRequestedAt ?? r.updatedAt).toISOString(),
      approved: r.supervisorApprovedAt !== null,
    };
  });
}

/** A supervisor approves a requested high-value handover; the desk can then finish it. */
export async function approveHandover(ctx: RequestCtx, claimId: string): Promise<Approval[]> {
  const actor = ctx.actor;
  if (actor.kind !== 'user' || actor.role !== 'supervisor') throw new Forbidden();
  await withTx(ctx, async (tx) => {
    const row = await findClaim(tx, tx.tenantId, claimId);
    if (!row || row.state !== 'APPROVED' || !row.approvalRequestedAt) throw new NotFound(NOT_FOUND);
    if (row.supervisorApprovedAt) return;
    await patchClaim(tx, tx.tenantId, row.id, 'APPROVED', {
      supervisorApprovedBy: actor.userId,
      supervisorApprovedAt: tx.now,
    });
    await recordAuditEvent(tx, {
      recordType: 'claim',
      recordId: row.id,
      event: 'HANDOVER_APPROVED',
      note: null,
    });
  });
  return listApprovals(ctx);
}

/** People with 3+ failed verifications in 7 days (Flags page, CC-15). */
export async function failedVerifiers(
  tx: Tx,
): Promise<{ userId: string; failed: number; latest: Date }[]> {
  const since = addDaysToInstant(tx.now, -FAILED_VERIFICATION_WINDOW_DAYS);
  const by = new Map<string, Date[]>();
  for (const r of await listRejectionsSince(tx, tx.tenantId, since)) {
    if (!Object.values(r.verdicts).includes('fail') || !r.decidedAt) continue;
    by.set(r.claimantId, [...(by.get(r.claimantId) ?? []), r.decidedAt]);
  }
  return [...by]
    .filter(([, dates]) => dates.length >= FAILED_VERIFICATION_LIMIT)
    .map(([userId, dates]) => ({
      userId,
      failed: dates.length,
      latest: new Date(Math.max(...dates.map((d) => d.getTime()))),
    }));
}

/** For disputes (dispatch module): this person's claim and what they may dispute, or null. */
export async function disputableClaim(
  tx: Tx,
  claimId: string,
  userId: string,
): Promise<{ row: ClaimRow; kind: 'second_claimant' | 'wrong_handover' } | null> {
  const row = await findClaim(tx, tx.tenantId, claimId);
  if (!row || row.claimantId !== userId) return null;
  const item = await foundItemFor(tx, row.foundItemId);
  const kind = item ? disputable(tx, row, item) : null;
  return kind ? { row, kind } : null;
}
