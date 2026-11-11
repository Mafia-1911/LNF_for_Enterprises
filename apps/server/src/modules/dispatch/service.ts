// Handover (WF-04 steps 5–7): pickup code → fetch from the bin → check identity (and a second check
// for high-value items) → signature → DSP record. The item is DISPATCHED, the claim COLLECTED, the
// lost report RESOLVED, and the finder told (US-11). Records lock after 24 h (FR-17).
import type { Dispatch, HandOverParsed, Pickup } from '@lf/contracts';
import { DESK_ROLES, isHighValue } from '@lf/domain';
import { withTx } from '../../platform/db/tx';
import type { RequestCtx, Tx } from '../../platform/db/types';
import { Conflict, Forbidden, NotFound, ValidationFailed } from '../../platform/errors';
import { nextId } from '../../platform/ids';
import {
  approvalOf,
  approvedClaimByCode,
  proxyOf,
  claimFor,
  collectClaim,
  type ClaimsDeps,
} from '../claims';
import { memberNames, memberProfiles } from '../identity';
import {
  firstPhotoOf,
  foundItemFor,
  foundItemTransition,
  itemTitle,
  lostReportFor,
  lostReportTransition,
} from '../items';
import { notify } from '../notifications';
import { attachPhotos } from '../photos';
import { countDispatchesSince, findDispatch, insertDispatch, type DispatchRow } from './repo';

export type DispatchDeps = ClaimsDeps;

const NO_CODE =
  'No claim uses that code. Check the digits with the person, or search under Find an item.';

function deskActor(ctx: RequestCtx) {
  const actor = ctx.actor;
  if (actor.kind !== 'user' || !DESK_ROLES.includes(actor.role)) throw new Forbidden();
  return actor;
}

/** The DSP record as the desk and the directory show it. */
export async function dispatchView(tx: Tx, row: DispatchRow): Promise<Dispatch> {
  const item = await foundItemFor(tx, row.foundItemId);
  const names = await memberNames(tx, [row.officerId]);
  return {
    id: row.id,
    foundItemId: row.foundItemId,
    itemTitle: item ? itemTitle(item) : row.foundItemId,
    claimId: row.claimId,
    recipientName: row.recipientName,
    idLast4: row.idLast4,
    secondCheck: row.secondCheck,
    officerName: names.get(row.officerId) ?? 'Staff',
    proxyName: row.proxyName,
    createdAt: row.createdAt.toISOString(),
    locksAt: row.locksAt.toISOString(),
  };
}

/** Step 1: who is this code for, and which bin is the item in? */
export async function findPickup(
  deps: DispatchDeps,
  ctx: RequestCtx,
  code: string,
): Promise<Pickup> {
  deskActor(ctx);
  return withTx(
    ctx,
    async (tx) => {
      const claim = await approvedClaimByCode(deps, tx, code);
      if (!claim) throw new NotFound(NO_CODE);
      const item = await foundItemFor(tx, claim.foundItemId);
      if (!item || item.state !== 'READY_FOR_PICKUP') throw new NotFound(NO_CODE);
      const who = (await memberProfiles(tx, [claim.claimantId])).get(claim.claimantId);
      const highValue = isHighValue(item.category);
      return {
        claimId: claim.id,
        item: {
          id: item.id,
          title: itemTitle(item),
          category: item.category,
          binCode: item.binCode,
          photoId: await firstPhotoOf(tx, item.id),
        },
        claimant: {
          name: who?.name ?? 'Unknown',
          title: who?.title ?? null,
          role: who?.role ?? 'none',
        },
        highValue,
        needsSupervisor: highValue && who?.role === 'visitor',
        approval: approvalOf(claim),
        proxy: proxyOf(claim),
        pickupEndsAt: (claim.pickupEndsAt ?? tx.now).toISOString(),
      };
    },
    { readOnly: true },
  );
}

/** Steps 2–3: identity checked, signed, handed over. */
export async function handOver(
  deps: DispatchDeps,
  ctx: RequestCtx,
  claimId: string,
  input: HandOverParsed,
): Promise<Dispatch> {
  const actor = deskActor(ctx);
  return withTx(ctx, async (tx) => {
    const claim = await claimFor(tx, claimId);
    if (!claim) throw new NotFound(NO_CODE);
    if (claim.state !== 'APPROVED')
      throw new Conflict(
        'This claim isn’t ready for pickup any more; check it under Find an item.',
      );
    const item = await foundItemFor(tx, claim.foundItemId);
    if (!item || item.state !== 'READY_FOR_PICKUP')
      throw new Conflict('This item isn’t ready for pickup any more; check it under Find an item.');
    const who = (await memberProfiles(tx, [claim.claimantId])).get(claim.claimantId);
    const highValue = isHighValue(item.category);
    if (highValue && !input.secondCheck)
      throw new ValidationFailed({
        secondCheck:
          'This is a high-value item; record the second check (unlock, serial, recount or supervisor).',
      });
    const supervisorNeeded = highValue && who?.role === 'visitor';
    // A supervisor finishes it on their own account, or approved it from the Approvals page.
    const approvedBySupervisor = actor.role === 'supervisor' || claim.supervisorApprovedAt !== null;
    if ((supervisorNeeded || input.secondCheck === 'supervisor_approved') && !approvedBySupervisor)
      throw new ValidationFailed({
        secondCheck:
          'This handover needs a supervisor; tap "Ask a supervisor" and wait for their approval.',
      });
    if (supervisorNeeded && input.secondCheck !== 'supervisor_approved')
      throw new ValidationFailed({
        secondCheck:
          'A visitor collecting a high-value item needs supervisor approval; tick it to confirm.',
      });

    // CC-09: a nominated proxy shows their own university ID; the DSP records both people.
    const proxy = input.collectedBy === 'proxy' ? proxyOf(claim) : null;
    if (input.collectedBy === 'proxy' && !proxy)
      throw new ValidationFailed({ collectedBy: 'No proxy was nominated for this claim.' });
    if (proxy && proxy.idLast4 !== input.idLast4.toUpperCase())
      throw new ValidationFailed({
        idLast4: "That doesn't match the proxy's university ID; check the ID they show.",
      });

    const id = await nextId(tx, 'DSP');
    const row = await insertDispatch(tx, tx.tenantId, {
      id,
      foundItemId: item.id,
      claimId: claim.id,
      recipientId: claim.claimantId,
      recipientName: who?.name ?? 'Unknown',
      idLast4: input.idLast4.toUpperCase(),
      photoMatch: input.photoMatches,
      secondCheck: input.secondCheck,
      proxyName: proxy?.name ?? null,
      officerId: actor.userId,
    });
    await attachPhotos(
      tx,
      [input.signaturePhotoId],
      { recordType: 'dispatch', recordId: id, purpose: 'signature', visibility: 'staff' },
      'signaturePhotoId',
    );
    await collectClaim(tx, claim, `Handed over as ${id}`);
    await foundItemTransition(
      tx,
      { id: item.id, state: 'READY_FOR_PICKUP' },
      'HAND_OVER',
      {},
      `Handed over as ${id}`,
    );
    if (claim.lostReportId) {
      const report = await lostReportFor(tx, claim.lostReportId);
      if (report?.state === 'CLAIMED')
        await lostReportTransition(tx, { id: report.id, state: report.state }, 'RESOLVE', {});
    }
    await notify(deps, tx, {
      userId: claim.claimantId,
      kind: 'claim_update',
      title: 'Item handed over',
      body: `You collected ${itemTitle(item).toLowerCase()}. Your receipt is ${id}.`,
      link: `/claims/${claim.id}`,
    });
    if (item.finderId)
      await notify(deps, tx, {
        userId: item.finderId,
        kind: 'general',
        title: 'The item you found is back with its owner',
        body: `${itemTitle(item)} (${item.id}) was returned to its owner. Thank you for handing it in.`,
        link: '/activity',
      });
    return dispatchView(tx, row);
  });
}

export async function getDispatch(ctx: RequestCtx, id: string): Promise<Dispatch> {
  deskActor(ctx);
  return withTx(
    ctx,
    async (tx) => {
      const row = await findDispatch(tx, tx.tenantId, id);
      if (!row) throw new NotFound("We couldn't find that handover record; check the DSP ID.");
      return dispatchView(tx, row);
    },
    { readOnly: true },
  );
}

/** How many items were handed back since `since` (supervisor overview). */
export function returnedSince(tx: Tx, since: Date): Promise<number> {
  return countDispatchesSince(tx, tx.tenantId, since);
}
