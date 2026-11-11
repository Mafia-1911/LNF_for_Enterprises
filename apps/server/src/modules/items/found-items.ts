// Found items (WF-02 student post, WF-03 desk intake, FR-10 gallery, FR-13 bins and labels, NF-01
// pings, NF-02 ID card fast lane). Same shape as the lost-report slice in service.ts: plain functions
// (deps, ctx, input), one withTx per use case, state changes only through foundItemTransition.
import type {
  ShelfCheckList,
  ShelfCheckResult,
  ShelfCheckSubmit,
  OutageSheet,
  RegisterImport,
  CorrectFoundItem,
  CreateFoundPostParsed,
  DeskFoundItem,
  DeskItemRow,
  FoundItemLabel,
  FoundPost,
  GalleryItem,
  LogFoundItemParsed,
  LoggedFoundItem,
  ReceiveFoundItemParsed,
  SimilarLostQuery,
  SimilarLostReport,
} from '@lf/contracts';
import { SimilarLostQuerySchema } from '@lf/contracts';
import {
  addDaysToInstant,
  CATEGORIES,
  categoryByCode,
  dhakaDate,
  colourByCode,
  DESK_ROLES,
  foundItemMachine,
  maskLast4,
  MATCH_REASON_LABEL,
  normaliseId,
  scoreMatch,
  suggestBin,
  topMatches,
  validTicks,
  type CategoryCode,
  type FoundItemState,
} from '@lf/domain';
import QRCode from 'qrcode';
import type { PrivateDetailsCrypto } from '../../platform/crypto';
import { withTx } from '../../platform/db/tx';
import type { RequestCtx, Tx } from '../../platform/db/types';
import { Forbidden, NotFound, ValidationFailed } from '../../platform/errors';
import { nextId } from '../../platform/ids';
import { JOB, type MatchFoundItemData } from '../../platform/jobs/names';
import type { Registrar } from '../../platform/registrar';
import { tenantEmailDomain } from '../../platform/tenancy';
import { bindTransition, getRecordHistory, recordAuditEvent } from '../audit';
import {
  deskInfo,
  listDeskBins,
  readNumberPolicy,
  resolvePlaceNames,
  resolveReportPlace,
} from '../catalog';
import { memberByEmail, memberNames } from '../identity';
import { notify, sendEmail, type NotificationsDeps } from '../notifications';
import { attachPhotos, photosForRecords, setRecordPhotoVisibility } from '../photos';
import { loadRetentionRules, retentionEndOf } from './retention-rules';
import {
  countAllFoundItems,
  countItemsPerBin,
  countPings,
  findFoundItem,
  findReservedId,
  insertReservedIds,
  listFoundInWindow,
  listFoundItemsByState,
  listFoundItemsSince,
  listLostReportsSince,
  listUnusedReserved,
  markReservedUsed,
  findFoundItems,
  findLostReports,
  findPrivateDetails,
  insertFoundItem,
  insertPings,
  listAwaitingHandIn,
  listCustodyItems,
  listExpiringSoon,
  listFoundItemsByFinder,
  listLostReportsByOwner,
  listOpenLostReports,
  listPingedReports,
  listPostsDueReminder,
  listPostsPastDeadline,
  patchFoundItem,
  searchFoundItems,
  updateFoundItemState,
  upsertPrivateDetails,
  type FoundItemPatch,
  type FoundItemRow,
  type LostReportRow,
  type NewFoundItem,
} from './repo';

export type FoundItemsDeps = NotificationsDeps & {
  crypto: PrivateDetailsCrypto;
  registrar: Registrar;
};

type FoundRecord = { id: string; state: FoundItemState | null };
type FoundChange = { values?: NewFoundItem; patch?: FoundItemPatch };

/** The found-item lifecycle bound to this module's repo (ADR-0011). */
export const foundItemTransition = bindTransition({
  recordType: 'found_item',
  machine: foundItemMachine,
  create: (tx, record: FoundRecord, to, data: FoundChange) => {
    if (!data.values) throw new Error('Creating a found item needs values.');
    return insertFoundItem(tx, tx.tenantId, record.id, to, data.values);
  },
  update: (tx, record: FoundRecord, to, data: FoundChange) => {
    if (record.state === null) throw new Error('Updating needs the current state.');
    return updateFoundItemState(tx, tx.tenantId, record.id, record.state, to, data.patch);
  },
});

const GALLERY_STATES: FoundItemState[] = ['IN_CUSTODY', 'CLAIM_PENDING', 'READY_FOR_PICKUP'];
const ACTIVE_STATES: FoundItemState[] = [
  'REPORTED_BY_FINDER',
  'IN_CUSTODY',
  'CLAIM_PENDING',
  'READY_FOR_PICKUP',
  'EXPIRED',
];
const ALL_STATES = foundItemMachine.states;
/** Never listed publicly: restricted items (CC-12) and university ID cards (NF-02). */
const NEVER_PUBLIC = [
  ...CATEGORIES.filter((c) => c.restricted).map((c) => c.code),
  'university_id',
] as string[];

const MAX_PAST_DAYS = 365;
const FUTURE_SLACK_MS = 5 * 60 * 1000;
const HOUR = 3_600_000;

function isDesk(ctx: { actor: RequestCtx['actor'] }): boolean {
  return ctx.actor.kind === 'user' && DESK_ROLES.includes(ctx.actor.role);
}

function categoryOf(code: string) {
  return categoryByCode(code);
}

/** "Grey laptop", or the short name when the finder gave one. */
export function itemTitle(row: {
  shortName: string | null;
  colour: string | null;
  category: string;
}) {
  if (row.shortName) return row.shortName;
  const category = categoryOf(row.category)?.label ?? 'Item';
  const colour = row.colour ? colourByCode(row.colour)?.label : null;
  return colour ? `${colour} ${category.toLowerCase()}` : category;
}

async function qrDataUri(url: string): Promise<string> {
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function recordUrl(deps: { appOrigin: string }, id: string): string {
  return `${deps.appOrigin}/i/${id}`;
}

function checkFoundAt(foundAt: string, now: Date): Date {
  const at = new Date(foundAt);
  if (at.getTime() > now.getTime() + FUTURE_SLACK_MS)
    throw new ValidationFailed({ foundAt: 'That time is in the future; enter when it was found.' });
  if (at.getTime() < addDaysToInstant(now, -MAX_PAST_DAYS).getTime())
    throw new ValidationFailed({
      foundAt: 'That is more than a year ago; ask the Lost & Found office how to log it.',
    });
  return at;
}

async function checkPlace(
  tx: Tx,
  place: { buildingCode: string; floorId: string | null; zoneId: string | null },
) {
  const names = await resolveReportPlace(tx, place);
  if (!names)
    throw new ValidationFailed({
      'place.buildingCode':
        "That place isn't on the campus list; pick the building and floor again.",
    });
  return names;
}

function checkTicks(category: string, ticks: string[]) {
  if (!validTicks(category as CategoryCode, ticks))
    throw new ValidationFailed({
      privateTicks: "Some of the ticked details don't fit this category; tick them again.",
    });
}

function noteAad(tenantId: string, id: string) {
  return `${tenantId}:found_item:${id}`;
}
function idNumberAad(tenantId: string, id: string) {
  return `${tenantId}:found_item:${id}:id_number`;
}

async function savePrivateDetails(
  deps: FoundItemsDeps,
  tx: Tx,
  id: string,
  ticks: string[],
  note: string | null,
) {
  if (ticks.length === 0 && !note) return;
  const encrypted = note ? deps.crypto.encrypt(note, noteAad(tx.tenantId, id)) : null;
  await upsertPrivateDetails(tx, tx.tenantId, {
    recordType: 'found_item',
    recordId: id,
    ticks,
    noteCiphertext: encrypted?.ciphertext ?? null,
    keyVersion: encrypted?.keyVersion ?? null,
  });
}

/** Item photos are public once at the desk, except sensitive or never-public categories. */
function itemPhotoVisibility(category: string): 'public' | 'staff' {
  const def = categoryOf(category);
  return def?.sensitive || def?.restricted || NEVER_PUBLIC.includes(category) ? 'staff' : 'public';
}

async function placeNamesFor(
  tx: Tx,
  rows: { buildingCode: string | null; floorId: string | null; zoneId: string | null }[],
) {
  const codes = [
    ...new Set(rows.map((r) => r.buildingCode).filter((v): v is string => v !== null)),
  ];
  const ids = [
    ...new Set(rows.flatMap((r) => [r.floorId, r.zoneId]).filter((v): v is string => v !== null)),
  ];
  const names = await resolvePlaceNames(tx, codes, ids);
  return (r: { buildingCode: string | null; floorId: string | null; zoneId: string | null }) => ({
    buildingCode: r.buildingCode,
    buildingName: r.buildingCode ? (names.buildings.get(r.buildingCode) ?? null) : null,
    floorName: r.floorId ? (names.floorsAndZones.get(r.floorId) ?? null) : null,
    zoneName: r.zoneId ? (names.floorsAndZones.get(r.zoneId) ?? null) : null,
  });
}

// ── Student post (WF-02) ───────────────────────────────────────────────────────────────────────

async function toFoundPost(deps: FoundItemsDeps, tx: Tx, row: FoundItemRow): Promise<FoundPost> {
  const place = await placeNamesFor(tx, [row]);
  const photos = (await photosForRecords(tx, 'found_item', [row.id])).get(row.id) ?? [];
  const pings = (await countPings(tx, tx.tenantId, [row.id])).get(row.id) ?? 0;
  return {
    id: row.id,
    state: row.state as FoundItemState,
    category: row.category,
    colour: row.colour,
    title: itemTitle(row),
    shortName: row.shortName,
    brand: row.brand,
    model: row.model,
    publicDescription: row.publicDescription,
    place: place(row),
    foundAt: row.foundAt.toISOString(),
    handInDeadline: row.handInDeadline?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    photoIds: photos.filter((p) => p.purpose === 'item').map((p) => p.id),
    qrDataUri: await qrDataUri(recordUrl(deps, row.id)),
    desk: await deskInfo(tx),
    pinged: pings,
  };
}

/** WF-02: a student posts what they found. They get an FND ID, a QR and a 48-hour deadline. */
export async function postFoundItem(
  deps: FoundItemsDeps,
  ctx: RequestCtx,
  input: CreateFoundPostParsed,
): Promise<FoundPost> {
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();
  return withTx(ctx, async (tx) => {
    const foundAt = checkFoundAt(input.foundAt, tx.now);
    await checkPlace(tx, input.place);
    checkTicks(input.category, input.privateTicks);
    const handInHours = await readNumberPolicy(tx, 'found_item.hand_in_hours', 48);

    const id = await nextId(tx, 'FND');
    const row = await foundItemTransition(tx, { id, state: null }, 'POST', {
      values: {
        category: input.category,
        colour: input.colour,
        brand: input.brand,
        model: input.model,
        shortName: input.shortName,
        publicDescription: input.publicDescription,
        buildingCode: input.place.buildingCode,
        floorId: input.place.floorId,
        zoneId: input.place.zoneId,
        foundAt,
        source: 'finder',
        finderId: actor.userId,
        handInDeadline: new Date(tx.now.getTime() + handInHours * HOUR),
      },
    });
    await savePrivateDetails(deps, tx, id, input.privateTicks, input.privateNote);
    await attachPhotos(tx, input.photoIds, {
      recordType: 'found_item',
      recordId: id,
      purpose: 'item',
      visibility: 'private',
    });
    await pingOwners(deps, tx, row, input.pingReportIds, actor.userId);
    return toFoundPost(deps, tx, row);
  });
}

/** "This might be theirs": tell each owner, without names or contacts on either side (NF-01). */
async function pingOwners(
  deps: FoundItemsDeps,
  tx: Tx,
  item: FoundItemRow,
  reportIds: string[],
  finderId: string,
) {
  const unique = [...new Set(reportIds)].slice(0, 5);
  if (unique.length === 0) return;
  const reports = (await findLostReports(tx, tx.tenantId, unique)).filter(
    (r) =>
      (r.state === 'OPEN' || r.state === 'POSSIBLE_MATCH') &&
      r.category === item.category &&
      r.ownerId !== finderId,
  );
  if (reports.length !== unique.length)
    throw new ValidationFailed({
      pingReportIds:
        "One of those lost reports isn't open any more; refresh the list and try again.",
    });
  await insertPings(
    tx,
    tx.tenantId,
    item.id,
    reports.map((r) => r.id),
  );
  for (const report of reports) {
    await notify(deps, tx, {
      userId: report.ownerId,
      kind: 'possible_match',
      title: `Someone may have found your ${itemTitle(report).toLowerCase()}`,
      body: `A finder posted ${item.id}, which might be yours. It isn't at the desk yet; we'll tell you when it arrives.`,
      link: '/activity',
    });
  }
}

/** The finder's own post (desk staff may also open it). */
export async function getFoundPost(
  deps: FoundItemsDeps,
  ctx: RequestCtx,
  id: string,
): Promise<FoundPost> {
  return withTx(
    ctx,
    async (tx) => {
      const row = await findFoundItem(tx, tx.tenantId, id);
      const mine = row && ctx.actor.kind === 'user' && row.finderId === ctx.actor.userId;
      if (!row || !(mine || isDesk(ctx)))
        throw new NotFound("We couldn't find that item; check the ID and try again.");
      return toFoundPost(deps, tx, row);
    },
    { readOnly: true },
  );
}

export async function listMyFoundPosts(
  deps: FoundItemsDeps,
  ctx: RequestCtx,
): Promise<Omit<FoundPost, 'qrDataUri' | 'desk'>[]> {
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();
  return withTx(
    ctx,
    async (tx) => {
      const rows = await listFoundItemsByFinder(tx, tx.tenantId, actor.userId);
      const place = await placeNamesFor(tx, rows);
      const photos = await photosForRecords(
        tx,
        'found_item',
        rows.map((r) => r.id),
      );
      const pings = await countPings(
        tx,
        tx.tenantId,
        rows.map((r) => r.id),
      );
      return rows.map((row) => ({
        id: row.id,
        state: row.state as FoundItemState,
        category: row.category,
        colour: row.colour,
        title: itemTitle(row),
        shortName: row.shortName,
        brand: row.brand,
        model: row.model,
        publicDescription: row.publicDescription,
        place: place(row),
        foundAt: row.foundAt.toISOString(),
        handInDeadline: row.handInDeadline?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        photoIds: (photos.get(row.id) ?? []).filter((p) => p.purpose === 'item').map((p) => p.id),
        pinged: pings.get(row.id) ?? 0,
      }));
    },
    { readOnly: true },
  );
}

/** US-02: up to 5 open lost reports like the item being posted. No names or contacts. */
export async function similarLostReports(
  ctx: RequestCtx,
  query: SimilarLostQuery,
): Promise<SimilarLostReport[]> {
  const q = SimilarLostQuerySchema.parse(query);
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();
  return withTx(
    ctx,
    async (tx) => {
      const candidates = await listOpenLostReports(tx, tx.tenantId, q.category, actor.userId);
      const foundAt = q.foundAt ? new Date(q.foundAt) : tx.now;
      const best = topMatches(candidates, (r) =>
        scoreMatch(
          {
            category: r.category,
            colour: r.colour,
            brand: r.brand,
            buildingCode: r.buildingCode,
            floorId: r.floorId,
            zoneId: r.zoneId,
            words: [r.shortName, r.publicDescription].filter(Boolean).join(' '),
            timeFrom: r.timeFrom,
            timeTo: r.timeTo,
          },
          {
            category: q.category,
            colour: q.colour,
            brand: q.brand,
            buildingCode: q.buildingCode,
            floorId: q.floorId,
            zoneId: q.zoneId,
            words: q.words,
            foundAt,
          },
        ),
      );
      const place = await placeNamesFor(
        tx,
        best.map((b) => b.candidate),
      );
      return best.map(({ candidate: r, match }) => ({
        id: r.id,
        category: r.category,
        colour: r.colour,
        title: itemTitle(r),
        place: place(r),
        lostOn: r.timeTo.toISOString(),
        reasons: match.reasons.map((reason) => MATCH_REASON_LABEL[reason]),
      }));
    },
    { readOnly: true },
  );
}

/** CC-05: items already at the desk that a new lost report may match (inside its transaction). */
export async function similarInCustody(
  tx: Tx,
  lost: Pick<
    LostReportRow,
    | 'category'
    | 'colour'
    | 'brand'
    | 'buildingCode'
    | 'floorId'
    | 'zoneId'
    | 'shortName'
    | 'publicDescription'
    | 'timeFrom'
    | 'timeTo'
  >,
) {
  if (NEVER_PUBLIC.includes(lost.category)) return [];
  const candidates = await listCustodyItems(tx, tx.tenantId, lost.category);
  const best = topMatches(candidates, (f) =>
    scoreMatch(
      {
        ...lost,
        words: [lost.shortName, lost.publicDescription].filter(Boolean).join(' '),
      },
      {
        category: f.category,
        colour: f.colour,
        brand: f.brand,
        buildingCode: f.buildingCode,
        floorId: f.floorId,
        zoneId: f.zoneId,
        words: [f.shortName, f.model, f.publicDescription].filter(Boolean).join(' '),
        foundAt: f.foundAt,
      },
    ),
  );
  const place = await placeNamesFor(
    tx,
    best.map((b) => b.candidate),
  );
  const photos = await photosForRecords(
    tx,
    'found_item',
    best.map((b) => b.candidate.id),
  );
  return best.map(({ candidate: f, match }) => {
    const p = place(f);
    const photo = (photos.get(f.id) ?? []).find(
      (x) => x.purpose === 'item' && x.visibility === 'public',
    );
    return {
      id: f.id,
      title: itemTitle(f),
      category: f.category,
      place: { buildingName: p.buildingName, zoneName: p.zoneName },
      foundAt: f.foundAt.toISOString(),
      photoId: photo?.id ?? null,
      reasons: match.reasons.map((reason) => MATCH_REASON_LABEL[reason]),
    };
  });
}

// ── Desk intake (WF-03) ────────────────────────────────────────────────────────────────────────

async function checkBin(tx: Tx, category: string, binCode: string | null): Promise<string | null> {
  const restricted = categoryOf(category)?.restricted ?? false;
  if (restricted) {
    if (binCode)
      throw new ValidationFailed({
        binCode: 'Restricted items are never shelved; hand it to security today instead.',
      });
    return null;
  }
  if (!binCode) throw new ValidationFailed({ binCode: 'Pick the bin it goes in.' });
  const bins = await listDeskBins(tx);
  if (!bins.includes(binCode))
    throw new ValidationFailed({ binCode: "That bin isn't on the list; pick one from the list." });
  return binCode;
}

/** NF-02: an ID card is never listed; the owner is emailed at once when the directory knows them. */
async function idCardFastLane(
  deps: FoundItemsDeps,
  tx: Tx,
  row: FoundItemRow,
  idNumber: string | null,
): Promise<
  Pick<FoundItemPatch, 'idNumberCiphertext' | 'idNumberLast4' | 'keyVersion' | 'ownerEmailedAt'>
> {
  const def = categoryOf(row.category);
  if (!idNumber || !def?.sensitive) return {};
  const encrypted = deps.crypto.encrypt(idNumber, idNumberAad(tx.tenantId, row.id));
  const patch = {
    idNumberCiphertext: encrypted.ciphertext,
    keyVersion: encrypted.keyVersion,
    idNumberLast4: maskLast4(idNumber).slice(-4),
  };
  if (row.category !== 'university_id') return patch;

  const owner = await deps.registrar.lookup(
    { tenantId: tx.tenantId, emailDomain: await tenantEmailDomain(tx) },
    idNumber,
  );
  if (!owner) return patch;
  const desk = await deskInfo(tx);
  const title = 'Your university ID card was handed in';
  const body = `Your ID card ending ${patch.idNumberLast4} is at the ${desk.name}, ${desk.location} (${desk.hours}). Bring another photo ID to collect it.`;
  const member = await memberByEmail(tx, owner.email);
  if (member) {
    await notify(deps, tx, {
      userId: member.userId,
      kind: 'id_card_found',
      title,
      body,
      link: '/alerts',
    });
  } else {
    await sendEmail(deps, tx, {
      to: owner.email,
      subject: title,
      text: `${body}\n\nNSU Lost & Found`,
    });
  }
  return { ...patch, ownerEmailedAt: tx.now };
}

/** Retention for an item reaching the desk (look-alikes get the shorter period, CC-02). */
async function retentionEnd(tx: Tx, category: string, intakeAt: Date = tx.now): Promise<Date> {
  return retentionEndOf(await loadRetentionRules(tx), {
    category,
    receivedAt: intakeAt,
    createdAt: intakeAt,
    retentionExtraDays: 0,
  });
}

/**
 * The new item's ID and intake time. Normally a fresh FND ID and now; for an item tagged on paper
 * during an outage, its pre-printed ID and the time it was tagged (NF-04, CC-17).
 */
async function intakeIdentity(
  tx: Tx,
  input: { reservedId?: string | null | undefined; intakeAt?: string | null | undefined },
): Promise<{ id: string; intakeAt: Date }> {
  if (!input.reservedId) return { id: await nextId(tx, 'FND'), intakeAt: tx.now };
  const id = normaliseId(input.reservedId);
  const reserved = id ? await findReservedId(tx, tx.tenantId, id) : null;
  if (!id || !reserved || reserved.usedAt)
    throw new ValidationFailed({
      reservedId: "That ID isn't on an unused outage sheet; check the label and try again.",
    });
  let intakeAt = tx.now;
  if (input.intakeAt) {
    intakeAt = new Date(input.intakeAt);
    if (intakeAt > tx.now)
      throw new ValidationFailed({
        intakeAt: 'That time is in the future; pick when it was tagged.',
      });
    if (intakeAt < reserved.reservedAt)
      throw new ValidationFailed({
        intakeAt: "That's before the sheet was printed; check the time written on the label.",
      });
  }
  await markReservedUsed(tx, tx.tenantId, id);
  return { id, intakeAt };
}

// ── Outage label sheets (NF-04) ──────────────────────────────────────────────────────────────────

async function outageSheet(deps: FoundItemsDeps, tx: Tx): Promise<OutageSheet> {
  const rows = await listUnusedReserved(tx, tx.tenantId);
  const labels: OutageSheet['labels'] = [];
  for (const r of rows) {
    const url = recordUrl(deps, r.id);
    labels.push({
      id: r.id,
      reservedAt: r.reservedAt.toISOString(),
      qrDataUri: await qrDataUri(url),
      url,
    });
  }
  return { labels };
}

/** Unused reserved IDs, ready to print. */
export function getOutageSheet(deps: FoundItemsDeps, ctx: RequestCtx): Promise<OutageSheet> {
  if (!isDesk(ctx)) throw new Forbidden();
  return withTx(ctx, (tx) => outageSheet(deps, tx), { readOnly: true });
}

/** Reserves `count` FND IDs for a printed sheet. Same ID series, no gaps or a second series. */
export function reserveOutageIds(
  deps: FoundItemsDeps,
  ctx: RequestCtx,
  count: number,
): Promise<OutageSheet> {
  const actor = ctx.actor;
  if (actor.kind !== 'user' || !isDesk(ctx)) throw new Forbidden();
  return withTx(ctx, async (tx) => {
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) ids.push(await nextId(tx, 'FND'));
    await insertReservedIds(tx, tx.tenantId, ids, actor.userId);
    await recordAuditEvent(tx, {
      recordType: 'outage_sheet',
      recordId: `${ids[0] ?? ''}..${ids.at(-1) ?? ''}`,
      event: 'IDS_RESERVED',
      note: `${count} labels`,
    });
    return outageSheet(deps, tx);
  });
}

// ── Paper register import (WF-07, NF-05) ────────────────────────────────────────────────────────

/**
 * Old logbook rows become found items marked "migrated" (source register), in custody from their
 * logbook date. Retention counts from that date, so old items go straight to the retention list.
 */
export async function importRegister(
  deps: FoundItemsDeps,
  ctx: RequestCtx,
  input: RegisterImport,
): Promise<{ ids: string[] }> {
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();
  return withTx(ctx, async (tx) => {
    const errors: Record<string, string> = {};
    const bins = new Set(await listDeskBins(tx));
    const { buildings } = await resolvePlaceNames(
      tx,
      input.rows.map((r) => r.buildingCode).filter((v): v is string => Boolean(v)),
      [],
    );
    const earliest = addDaysToInstant(tx.now, -5 * 365);
    input.rows.forEach((r, i) => {
      const at = new Date(`${r.date}T12:00:00+06:00`);
      if (Number.isNaN(at.getTime()) || at > tx.now || at < earliest)
        errors[`rows.${i}.date`] = 'Use a logbook date from the last 5 years, not in the future.';
      const category = categoryOf(r.category);
      if (!category || category.restricted)
        errors[`rows.${i}.category`] = 'Pick a category from the list.';
      if (r.colour && !colourByCode(r.colour))
        errors[`rows.${i}.colour`] = 'Pick a colour from the list or leave it empty.';
      if (r.buildingCode && !buildings.has(r.buildingCode))
        errors[`rows.${i}.buildingCode`] = 'Pick a building from the list or leave it empty.';
      if (r.binCode && !bins.has(r.binCode))
        errors[`rows.${i}.binCode`] = "That bin isn't at this desk; pick one from the list.";
    });
    if (Object.keys(errors).length > 0) throw new ValidationFailed(errors);

    const ids: string[] = [];
    for (const r of input.rows) {
      const at = new Date(`${r.date}T12:00:00+06:00`);
      const id = await nextId(tx, 'FND');
      await foundItemTransition(
        tx,
        { id, state: null },
        'LOG_INTAKE',
        {
          values: {
            category: r.category,
            colour: r.colour,
            brand: null,
            model: null,
            shortName: r.shortName,
            publicDescription: null,
            buildingCode: r.buildingCode,
            floorId: null,
            zoneId: null,
            foundAt: at,
            source: 'register',
            finderId: null,
            loggedBy: actor.userId,
            binCode: r.binCode,
            condition: null,
            receivedAt: at,
            retentionEndsAt: await retentionEnd(tx, r.category, at),
          },
        },
        'Migrated from the paper register',
      );
      if (r.note) await savePrivateDetails(deps, tx, id, [], r.note);
      await queueMatch(deps, tx, id);
      ids.push(id);
    }
    return { ids };
  });
}

/** Records in a date range for the loss hotspot report (NF-07). */
export async function hotspotRecords(
  tx: Tx,
  since: Date,
): Promise<{ lost: LostReportRow[]; found: FoundItemRow[] }> {
  return {
    lost: await listLostReportsSince(tx, tx.tenantId, since),
    found: await listFoundItemsSince(tx, tx.tenantId, since),
  };
}

/** WF-03: an officer logs a walk-in item. It goes straight to IN_CUSTODY with a bin and a label. */
export async function logFoundItem(
  deps: FoundItemsDeps,
  ctx: RequestCtx,
  input: LogFoundItemParsed,
): Promise<LoggedFoundItem> {
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();
  const id = await withTx(ctx, async (tx) => {
    const foundAt = checkFoundAt(input.foundAt, tx.now);
    await checkPlace(tx, input.place);
    checkTicks(input.category, input.privateTicks);
    const binCode = await checkBin(tx, input.category, input.binCode);
    if (input.category === 'university_id' && !input.idNumber)
      throw new ValidationFailed({ idNumber: 'Type the ID number printed on the card.' });

    const { id: newId, intakeAt } = await intakeIdentity(tx, input);
    let row = await foundItemTransition(tx, { id: newId, state: null }, 'LOG_INTAKE', {
      values: {
        category: input.category,
        colour: input.colour,
        brand: input.brand,
        model: input.model,
        shortName: input.shortName,
        publicDescription: input.publicDescription,
        buildingCode: input.place.buildingCode,
        floorId: input.place.floorId,
        zoneId: input.place.zoneId,
        foundAt,
        source: 'desk',
        finderId: null,
        loggedBy: actor.userId,
        binCode,
        condition: input.condition,
        receivedAt: intakeAt,
        retentionEndsAt: await retentionEnd(tx, input.category, intakeAt),
      },
    });
    await savePrivateDetails(deps, tx, newId, input.privateTicks, input.privateNote);
    await attachPhotos(tx, input.photoIds, {
      recordType: 'found_item',
      recordId: newId,
      purpose: 'item',
      visibility: itemPhotoVisibility(input.category),
    });
    await attachPhotos(
      tx,
      input.conditionPhotoIds,
      { recordType: 'found_item', recordId: newId, purpose: 'condition', visibility: 'staff' },
      'conditionPhotoIds',
    );
    const lane = await idCardFastLane(deps, tx, row, input.idNumber);
    if (Object.keys(lane).length > 0)
      row = await patchFoundItem(tx, tx.tenantId, newId, 'IN_CUSTODY', lane);
    await queueMatch(deps, tx, row.id);
    return row.id;
  });
  return { item: await getDeskItem(deps, ctx, id), label: await getLabel(deps, ctx, id) };
}

/** WF-02 step 4: the finder brought it in. The officer confirms the details and shelves it. */
export async function receiveFoundItem(
  deps: FoundItemsDeps,
  ctx: RequestCtx,
  id: string,
  input: ReceiveFoundItemParsed,
): Promise<LoggedFoundItem> {
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();
  await withTx(ctx, async (tx) => {
    const current = await findFoundItem(tx, tx.tenantId, id);
    if (!current) throw new NotFound("We couldn't find that item; check the ID and try again.");
    const foundAt = checkFoundAt(input.foundAt, tx.now);
    await checkPlace(tx, input.place);
    checkTicks(input.category, input.privateTicks);
    const binCode = await checkBin(tx, input.category, input.binCode);
    if (input.category === 'university_id' && !input.idNumber)
      throw new ValidationFailed({ idNumber: 'Type the ID number printed on the card.' });

    let state = current.state as FoundItemState;
    if (state === 'NOT_RECEIVED') {
      await foundItemTransition(tx, { id, state }, 'REOPEN', {}, 'Brought in after the deadline');
      state = 'REPORTED_BY_FINDER';
    }
    let row = await foundItemTransition(tx, { id, state }, 'RECEIVE_AT_DESK', {
      patch: {
        category: input.category,
        colour: input.colour,
        brand: input.brand,
        model: input.model,
        shortName: input.shortName,
        publicDescription: input.publicDescription,
        buildingCode: input.place.buildingCode,
        floorId: input.place.floorId,
        zoneId: input.place.zoneId,
        foundAt,
        loggedBy: actor.userId,
        binCode,
        condition: input.condition,
        receivedAt: tx.now,
        retentionEndsAt: await retentionEnd(tx, input.category),
      },
    });
    if (input.privateTicks.length > 0 || input.privateNote) {
      checkTicks(input.category, input.privateTicks);
      await savePrivateDetails(deps, tx, id, input.privateTicks, input.privateNote);
    }
    await attachPhotos(tx, input.photoIds, {
      recordType: 'found_item',
      recordId: id,
      purpose: 'item',
      visibility: itemPhotoVisibility(input.category),
    });
    await attachPhotos(
      tx,
      input.conditionPhotoIds,
      { recordType: 'found_item', recordId: id, purpose: 'condition', visibility: 'staff' },
      'conditionPhotoIds',
    );
    // The finder's own photos become visible in the gallery now (unless sensitive).
    await setRecordPhotoVisibility(
      tx,
      'found_item',
      id,
      'item',
      itemPhotoVisibility(input.category),
    );
    const lane = await idCardFastLane(deps, tx, row, input.idNumber);
    if (Object.keys(lane).length > 0)
      row = await patchFoundItem(tx, tx.tenantId, id, 'IN_CUSTODY', lane);
    await queueMatch(deps, tx, id);

    for (const report of await findLostReports(
      tx,
      tx.tenantId,
      await listPingedReports(tx, tx.tenantId, id),
    )) {
      if (report.state !== 'OPEN' && report.state !== 'POSSIBLE_MATCH') continue;
      await notify(deps, tx, {
        userId: report.ownerId,
        kind: 'item_arrived',
        title: 'An item that might be yours is at the desk',
        body: `${row.id} (${itemTitle(row).toLowerCase()}) is now at the Lost & Found Office. Look for it in the gallery.`,
        link: '/gallery',
      });
    }
  });
  return { item: await getDeskItem(deps, ctx, id), label: await getLabel(deps, ctx, id) };
}

// ── Desk views ─────────────────────────────────────────────────────────────────────────────────

const EVENT_LABEL: Record<string, string> = {
  POST: 'Posted by the finder',
  LOG_INTAKE: 'Logged at the desk',
  RECEIVE_AT_DESK: 'Received at the desk',
  MARK_NOT_RECEIVED: 'Not handed in by the deadline',
  REOPEN: 'Reopened',
  CORRECT: 'Corrected',
  VOID: 'Marked VOID',
  MERGED: 'Duplicate merged in',
  SHELF_CHECK_PRESENT: 'Shelf check: present',
  SHELF_CHECK_MISSING: 'Shelf check: missing',
  TRANSFER: 'Transferred',
  EXPIRE: 'Retention ended',
};

export async function getDeskItem(
  deps: FoundItemsDeps,
  ctx: RequestCtx,
  id: string,
): Promise<DeskFoundItem> {
  if (!isDesk(ctx)) throw new Forbidden();
  const history = await getRecordHistory(ctx, 'found_item', id);
  return withTx(
    ctx,
    async (tx) => {
      const row = await findFoundItem(tx, tx.tenantId, id);
      if (!row) throw new NotFound("We couldn't find that item; check the ID and try again.");
      const place = await placeNamesFor(tx, [row]);
      const photos = (await photosForRecords(tx, 'found_item', [id])).get(id) ?? [];
      const details = await findPrivateDetails(tx, tx.tenantId, 'found_item', id);
      const names = await memberNames(tx, [
        ...history.map((h) => h.actorId).filter((v): v is string => v !== null),
        ...[row.loggedBy, row.finderId].filter((v): v is string => v !== null),
      ]);
      const note =
        details?.noteCiphertext && details.keyVersion !== null
          ? deps.crypto.decrypt(
              { ciphertext: details.noteCiphertext, keyVersion: details.keyVersion },
              noteAad(tx.tenantId, id),
            )
          : null;
      const def = categoryOf(row.category);
      return {
        id: row.id,
        state: row.state as FoundItemState,
        category: row.category,
        colour: row.colour,
        title: itemTitle(row),
        shortName: row.shortName,
        brand: row.brand,
        model: row.model,
        publicDescription: row.publicDescription,
        place: place(row),
        foundAt: row.foundAt.toISOString(),
        source: row.source === 'finder' ? 'finder' : 'desk',
        sourceLabel:
          row.source === 'finder'
            ? 'Student post'
            : row.source === 'register'
              ? `Migrated from the paper register by ${(row.loggedBy && names.get(row.loggedBy)) || 'staff'}`
              : `Desk, by ${(row.loggedBy && names.get(row.loggedBy)) || 'staff'}`,
        binCode: row.binCode,
        condition: row.condition,
        handInDeadline: row.handInDeadline?.toISOString() ?? null,
        retentionEndsAt: row.retentionEndsAt?.toISOString() ?? null,
        restricted: def?.restricted ?? false,
        sensitive: def?.sensitive ?? false,
        idNumberMasked: row.idNumberLast4 ? `••••${row.idNumberLast4}` : null,
        privateDetails: { ticks: details?.ticks ?? [], note },
        photoIds: photos.filter((p) => p.purpose === 'item').map((p) => p.id),
        conditionPhotoIds: photos.filter((p) => p.purpose === 'condition').map((p) => p.id),
        history: history.map((h) => ({
          event: h.event,
          label: EVENT_LABEL[h.event] ?? h.event,
          fromState: h.fromState,
          toState: h.toState,
          at: h.at,
          by: h.actorKind === 'user' ? ((h.actorId && names.get(h.actorId)) ?? 'Staff') : 'System',
          note: h.note,
        })),
        ownerEmailed: row.ownerEmailedAt !== null,
        mergedInto: row.mergedInto,
        possibleDuplicates: (await duplicatesOf(tx, row)).map((d) => ({
          id: d.id,
          title: itemTitle(d),
          state: d.state as FoundItemState,
          source: d.source,
        })),
      };
    },
    { readOnly: true },
  );
}

// ── Duplicates (CC-04): same category, same place, same day ─────────────────────────────────────

async function duplicatesOf(tx: Tx, row: FoundItemRow): Promise<FoundItemRow[]> {
  if (row.mergedInto || !['REPORTED_BY_FINDER', 'IN_CUSTODY'].includes(row.state)) return [];
  const day = dhakaDate(row.foundAt);
  const from = new Date(`${day}T00:00:00+06:00`);
  const to = new Date(`${day}T23:59:59.999+06:00`);
  return (await listFoundInWindow(tx, tx.tenantId, row.category, from, to)).filter(
    (o) =>
      o.id !== row.id &&
      !o.mergedInto &&
      o.buildingCode === row.buildingCode &&
      (row.zoneId === null || o.zoneId === null || o.zoneId === row.zoneId),
  );
}

/**
 * CC-04: the same item was posted twice (two finders, or a finder and the desk). The duplicate is
 * marked VOID with "Merged into …", and its ID points to the record that is kept.
 */
export async function mergeFoundItem(
  deps: FoundItemsDeps,
  ctx: RequestCtx,
  id: string,
  into: string,
): Promise<DeskFoundItem> {
  if (!isDesk(ctx)) throw new Forbidden();
  await withTx(ctx, async (tx) => {
    const duplicate = await findFoundItem(tx, tx.tenantId, id);
    const kept = await findFoundItem(tx, tx.tenantId, into);
    if (!duplicate || !kept)
      throw new NotFound("We couldn't find one of those records; check the IDs and try again.");
    if (!(await duplicatesOf(tx, kept)).some((d) => d.id === id))
      throw new ValidationFailed({
        into: 'These records are not the same category, place and day; check them first.',
      });
    await foundItemTransition(
      tx,
      { id, state: duplicate.state as FoundItemState },
      'VOID',
      { patch: { mergedInto: kept.id } },
      `Merged into ${kept.id}`,
    );
    await recordAuditEvent(tx, {
      recordType: 'found_item',
      recordId: kept.id,
      event: 'MERGED',
      note: `${id} was a duplicate of this record`,
    });
    if (duplicate.finderId)
      await notify(deps, tx, {
        userId: duplicate.finderId,
        kind: 'general',
        title: 'Your found-item post was matched at the desk',
        body: `${id} is the same item as ${kept.id}, which is already at the desk. Thank you for posting it.`,
        link: `/found/${id}/posted`,
      });
  });
  return getDeskItem(deps, ctx, into);
}

async function toRows(
  tx: Tx,
  rows: FoundItemRow[],
  due: (r: FoundItemRow) => Date | null,
): Promise<DeskItemRow[]> {
  const photos = await photosForRecords(
    tx,
    'found_item',
    rows.map((r) => r.id),
  );
  return rows.map((r) => {
    const def = categoryOf(r.category);
    return {
      id: r.id,
      state: r.state as FoundItemState,
      category: r.category,
      title: itemTitle(r),
      binCode: r.binCode,
      photoId: (photos.get(r.id) ?? []).find((p) => p.purpose === 'item')?.id ?? null,
      sensitive: def?.sensitive ?? false,
      due: due(r)?.toISOString() ?? null,
    };
  });
}

/** "Find an item": any ID (any case, no dashes) or words. */
export async function deskSearch(
  ctx: RequestCtx,
  query: { q?: string | undefined; category?: CategoryCode | undefined; scope: 'active' | 'all' },
  idFromText: (value: string) => string | null,
): Promise<DeskItemRow[]> {
  if (!isDesk(ctx)) throw new Forbidden();
  return withTx(
    ctx,
    async (tx) => {
      const asId = query.q ? idFromText(query.q) : null;
      if (asId) {
        const row = await findFoundItem(tx, tx.tenantId, asId);
        return row ? toRows(tx, [row], (r) => r.handInDeadline) : [];
      }
      const rows = await searchFoundItems(tx, tx.tenantId, {
        states: query.scope === 'all' ? ALL_STATES : ACTIVE_STATES,
        q: query.q,
        category: query.category,
      });
      return toRows(tx, rows, (r) =>
        r.state === 'REPORTED_BY_FINDER' ? r.handInDeadline : r.retentionEndsAt,
      );
    },
    { readOnly: true },
  );
}

export async function getLabel(
  deps: FoundItemsDeps,
  ctx: RequestCtx,
  id: string,
): Promise<FoundItemLabel> {
  if (!isDesk(ctx)) throw new Forbidden();
  return withTx(
    ctx,
    async (tx) => {
      const row = await findFoundItem(tx, tx.tenantId, id);
      if (!row) throw new NotFound("We couldn't find that item; check the ID and try again.");
      const url = recordUrl(deps, row.id);
      return {
        id: row.id,
        binCode: row.binCode,
        category: row.category,
        categoryLabel: categoryOf(row.category)?.label ?? row.category,
        date: (row.receivedAt ?? row.createdAt).toISOString(),
        qrDataUri: await qrDataUri(url),
        url,
      };
    },
    { readOnly: true },
  );
}

export async function binSuggestion(ctx: RequestCtx, category: CategoryCode) {
  if (!isDesk(ctx)) throw new Forbidden();
  return withTx(
    ctx,
    async (tx) => {
      const counts = await countItemsPerBin(tx, tx.tenantId);
      const bins = (await listDeskBins(tx)).map((code) => ({
        code,
        itemCount: counts.get(code) ?? 0,
      }));
      return { suggested: suggestBin(category, bins), bins };
    },
    { readOnly: true },
  );
}

/** A correction is never silent: it needs a reason and lands in the history (FR-14). */
export async function correctFoundItem(
  deps: FoundItemsDeps,
  ctx: RequestCtx,
  id: string,
  input: CorrectFoundItem,
): Promise<DeskFoundItem> {
  if (!isDesk(ctx)) throw new Forbidden();
  await withTx(ctx, async (tx) => {
    const row = await findFoundItem(tx, tx.tenantId, id);
    if (!row) throw new NotFound("We couldn't find that item; check the ID and try again.");
    const patch: FoundItemPatch = {};
    const changes: string[] = [];
    if (input.shortName !== undefined && input.shortName !== row.shortName) {
      patch.shortName = input.shortName;
      changes.push('short name');
    }
    if (input.binCode !== undefined && input.binCode !== row.binCode) {
      patch.binCode = await checkBin(tx, row.category, input.binCode);
      changes.push(`bin ${row.binCode ?? '—'} → ${input.binCode ?? '—'}`);
    }
    if (input.condition !== undefined && input.condition !== row.condition) {
      patch.condition = input.condition;
      changes.push('condition');
    }
    if (changes.length === 0)
      throw new ValidationFailed({ shortName: 'Nothing changed; edit a field before saving.' });
    await patchFoundItem(tx, tx.tenantId, id, row.state as FoundItemState, patch);
    await recordAuditEvent(tx, {
      recordType: 'found_item',
      recordId: id,
      event: 'CORRECT',
      note: `${input.reason.trim()} (${changes.join(', ')})`,
    });
  });
  return getDeskItem(deps, ctx, id);
}

/** Created in error: VOID keeps the ID and the history (identifiers rule). */
export async function voidFoundItem(
  deps: FoundItemsDeps,
  ctx: RequestCtx,
  id: string,
  reason: string,
): Promise<DeskFoundItem> {
  if (!isDesk(ctx)) throw new Forbidden();
  await withTx(ctx, async (tx) => {
    const row = await findFoundItem(tx, tx.tenantId, id);
    if (!row) throw new NotFound("We couldn't find that item; check the ID and try again.");
    await foundItemTransition(
      tx,
      { id, state: row.state as FoundItemState },
      'VOID',
      {},
      reason.trim(),
    );
  });
  return getDeskItem(deps, ctx, id);
}

// ── Gallery (FR-10) ────────────────────────────────────────────────────────────────────────────

export async function gallery(
  ctx: RequestCtx,
  query: {
    q?: string | undefined;
    category?: CategoryCode | undefined;
    building?: string | undefined;
    since?: string | undefined;
  },
): Promise<GalleryItem[]> {
  const actor = ctx.actor;
  if (actor.kind !== 'user' || actor.role === 'visitor')
    throw new Forbidden(
      'Visitors can report a lost item and claim, but the gallery is for students and staff.',
    );
  if (query.category && NEVER_PUBLIC.includes(query.category)) return [];
  return withTx(
    ctx,
    async (tx) => {
      const rows = await searchFoundItems(tx, tx.tenantId, {
        states: GALLERY_STATES,
        q: query.q,
        category: query.category,
        excludeCategories: NEVER_PUBLIC,
        building: query.building,
        since: query.since ? new Date(`${query.since}T00:00:00+06:00`) : undefined,
        limit: 120,
      });
      const place = await placeNamesFor(tx, rows);
      const photos = await photosForRecords(
        tx,
        'found_item',
        rows.map((r) => r.id),
      );
      return rows.map((r) => {
        const sensitive = categoryOf(r.category)?.sensitive ?? false;
        const photo = (photos.get(r.id) ?? []).find(
          (p) => p.purpose === 'item' && p.visibility === 'public',
        );
        return {
          id: r.id,
          state: r.state as FoundItemState,
          category: r.category,
          colour: r.colour,
          title: itemTitle(r),
          place: place(r),
          foundAt: r.foundAt.toISOString(),
          sensitive,
          photoId: sensitive ? null : (photo?.id ?? null),
        };
      });
    },
    { readOnly: true },
  );
}

// ── Hand-in timer (CC-03) ──────────────────────────────────────────────────────────────────────

/** Hourly: remind finders at 24 h; at the deadline the post becomes NOT_RECEIVED. */
export async function runHandInTimer(
  deps: FoundItemsDeps,
  ctx: RequestCtx,
): Promise<{ reminded: number; notReceived: number }> {
  return withTx(ctx, async (tx) => {
    const desk = await deskInfo(tx);
    const due = await listPostsDueReminder(tx, tx.tenantId, new Date(tx.now.getTime() - 24 * HOUR));
    let reminded = 0;
    for (const row of due) {
      if (row.handInDeadline && row.handInDeadline <= tx.now) continue;
      if (row.finderId)
        await notify(deps, tx, {
          userId: row.finderId,
          kind: 'hand_in_reminder',
          title: `Please bring the ${itemTitle(row).toLowerCase()} to the desk`,
          body: `Hand ${row.id} in at the ${desk.name}, ${desk.location} (${desk.hours}) before the deadline, so its owner can get it back.`,
          link: `/found/${row.id}/posted`,
        });
      await patchFoundItem(tx, tx.tenantId, row.id, 'REPORTED_BY_FINDER', {
        reminderSentAt: tx.now,
      });
      reminded += 1;
    }
    const late = await listPostsPastDeadline(tx, tx.tenantId, tx.now);
    for (const row of late) {
      await foundItemTransition(
        tx,
        { id: row.id, state: 'REPORTED_BY_FINDER' },
        'MARK_NOT_RECEIVED',
        {},
      );
      const pinged = await findLostReports(
        tx,
        tx.tenantId,
        await listPingedReports(tx, tx.tenantId, row.id),
      );
      for (const report of pinged) {
        if (report.state !== 'OPEN' && report.state !== 'POSSIBLE_MATCH') continue;
        await notify(deps, tx, {
          userId: report.ownerId,
          kind: 'item_not_received',
          title: 'The possible match was not handed in',
          body: `The finder of ${row.id} didn't bring it to the desk in time. Your report stays open and we'll tell you about new matches.`,
          link: '/activity',
        });
      }
    }
    return { reminded, notReceived: late.length };
  });
}

/** How many found items this tenant has (seed: only add samples to an empty tenant). */
export function countFoundItems(ctx: RequestCtx): Promise<number> {
  return withTx(ctx, (tx) => countAllFoundItems(tx, tx.tenantId), { readOnly: true });
}

/** Matching runs after commit (job), so a slow scan never holds the desk's transaction. */
async function queueMatch(deps: FoundItemsDeps, tx: Tx, foundItemId: string) {
  const data: MatchFoundItemData = { tenantId: tx.tenantId, foundItemId };
  await deps.boss.send(JOB.matchFoundItem, data, { db: tx.jobs });
}

// ── For other modules (matching, claims, dispatch): reads inside the caller's transaction ─────

export type { FoundItemRow, LostReportRow };
export const NEVER_PUBLIC_CATEGORIES: readonly string[] = NEVER_PUBLIC;

export function foundItemFor(tx: Tx, id: string): Promise<FoundItemRow | null> {
  return findFoundItem(tx, tx.tenantId, id);
}

export async function lostReportFor(tx: Tx, id: string): Promise<LostReportRow | null> {
  return (await findLostReports(tx, tx.tenantId, [id]))[0] ?? null;
}

export function openLostReportsIn(tx: Tx, category: string): Promise<LostReportRow[]> {
  return listOpenLostReports(tx, tx.tenantId, category, null);
}

export function custodyItemsIn(tx: Tx, category: string): Promise<FoundItemRow[]> {
  return listCustodyItems(tx, tx.tenantId, category);
}

export function foundItemsFor(tx: Tx, ids: string[]): Promise<FoundItemRow[]> {
  return findFoundItems(tx, tx.tenantId, ids);
}

/** Ticks and the decrypted note recorded for a found item (desk staff only, FR-06). */
export async function foundItemPrivateDetails(
  deps: { crypto: PrivateDetailsCrypto },
  tx: Tx,
  id: string,
): Promise<{ ticks: string[]; note: string | null }> {
  const details = await findPrivateDetails(tx, tx.tenantId, 'found_item', id);
  const note =
    details?.noteCiphertext && details.keyVersion !== null
      ? deps.crypto.decrypt(
          { ciphertext: details.noteCiphertext, keyVersion: details.keyVersion },
          noteAad(tx.tenantId, id),
        )
      : null;
  return { ticks: details?.ticks ?? [], note };
}

/** FR-07 score of one lost report against one found item. */
export function scorePair(lost: LostReportRow, found: FoundItemRow) {
  return scoreMatch(
    {
      category: lost.category,
      colour: lost.colour,
      brand: lost.brand,
      buildingCode: lost.buildingCode,
      floorId: lost.floorId,
      zoneId: lost.zoneId,
      words: [lost.shortName, lost.publicDescription].filter(Boolean).join(' '),
      timeFrom: lost.timeFrom,
      timeTo: lost.timeTo,
    },
    {
      category: found.category,
      colour: found.colour,
      brand: found.brand,
      buildingCode: found.buildingCode,
      floorId: found.floorId,
      zoneId: found.zoneId,
      words: [found.shortName, found.model, found.publicDescription].filter(Boolean).join(' '),
      foundAt: found.foundAt,
    },
  );
}

/** Desk list rows (title, bin, photo) for found items. */
export function deskRowsFor(
  tx: Tx,
  rows: FoundItemRow[],
  due: (r: FoundItemRow) => Date | null,
): Promise<DeskItemRow[]> {
  return toRows(tx, rows, due);
}

export async function toShelveRows(tx: Tx): Promise<DeskItemRow[]> {
  return toRows(tx, await listAwaitingHandIn(tx, tx.tenantId), (r) => r.handInDeadline);
}

export async function expiringRows(tx: Tx, until: Date): Promise<DeskItemRow[]> {
  return toRows(tx, await listExpiringSoon(tx, tx.tenantId, until), (r) => r.retentionEndsAt);
}

/** Gallery-style cards (public photo only, never for sensitive items), by item id. */
export async function itemCards(tx: Tx, rows: FoundItemRow[]): Promise<Map<string, GalleryItem>> {
  const place = await placeNamesFor(tx, rows);
  const photos = await photosForRecords(
    tx,
    'found_item',
    rows.map((r) => r.id),
  );
  const out = new Map<string, GalleryItem>();
  for (const r of rows) {
    const sensitive = categoryOf(r.category)?.sensitive ?? false;
    const photo = (photos.get(r.id) ?? []).find(
      (p) => p.purpose === 'item' && p.visibility === 'public',
    );
    out.set(r.id, {
      id: r.id,
      state: r.state as FoundItemState,
      category: r.category,
      colour: r.colour,
      title: itemTitle(r),
      place: place(r),
      foundAt: r.foundAt.toISOString(),
      sensitive,
      photoId: sensitive ? null : (photo?.id ?? null),
    });
  }
  return out;
}

/** The first item photo, public or not (desk views). */
export async function firstPhotoOf(tx: Tx, id: string): Promise<string | null> {
  const photos = (await photosForRecords(tx, 'found_item', [id])).get(id) ?? [];
  return photos.find((p) => p.purpose === 'item')?.id ?? null;
}

/** The owner's open lost reports in one category (to link a claim to). */
export async function openReportsOf(
  tx: Tx,
  ownerId: string,
  category: string,
): Promise<LostReportRow[]> {
  return (await listLostReportsByOwner(tx, tx.tenantId, ownerId)).filter(
    (r) => r.category === category && (r.state === 'OPEN' || r.state === 'POSSIBLE_MATCH'),
  );
}

// ── Daily shelf check (FR-15) ───────────────────────────────────────────────────────────────────

const ON_SHELF: FoundItemState[] = ['IN_CUSTODY', 'CLAIM_PENDING', 'READY_FOR_PICKUP'];

/** Items expected in each bin, bin by bin. */
export async function shelfCheckList(ctx: RequestCtx): Promise<ShelfCheckList> {
  if (!isDesk(ctx)) throw new Forbidden();
  return withTx(
    ctx,
    async (tx) => {
      const rows = (await listFoundItemsByState(tx, tx.tenantId, ON_SHELF)).filter(
        (r) => r.binCode !== null,
      );
      const desk = await toRows(tx, rows, () => null);
      const bins = new Map<string, DeskItemRow[]>();
      for (const r of desk) if (r.binCode) bins.set(r.binCode, [...(bins.get(r.binCode) ?? []), r]);
      return {
        bins: [...bins]
          .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
          .map(([binCode, items]) => ({ binCode, items })),
      };
    },
    { readOnly: true },
  );
}

/** Records present or missing for each item (append-only, on each item's history). */
export async function recordShelfCheck(
  ctx: RequestCtx,
  input: ShelfCheckSubmit,
): Promise<ShelfCheckResult> {
  if (!isDesk(ctx)) throw new Forbidden();
  return withTx(ctx, async (tx) => {
    const ids = [...new Set(input.results.map((r) => r.id))];
    const rows = new Map((await findFoundItems(tx, tx.tenantId, ids)).map((r) => [r.id, r]));
    const missing: FoundItemRow[] = [];
    for (const result of input.results) {
      const row = rows.get(result.id);
      if (!row || !ON_SHELF.includes(row.state as FoundItemState) || !row.binCode) continue;
      await recordAuditEvent(tx, {
        recordType: 'found_item',
        recordId: row.id,
        event: result.present ? 'SHELF_CHECK_PRESENT' : 'SHELF_CHECK_MISSING',
        note: `${result.present ? 'Present in' : 'Missing from'} bin ${row.binCode}`,
      });
      if (!result.present) missing.push(row);
    }
    return { checked: rows.size, missing: await toRows(tx, missing, () => null) };
  });
}
