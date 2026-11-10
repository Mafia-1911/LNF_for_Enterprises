// GOLDEN SLICE — business logic for lost reports. Copy this shape:
//   1. Plain functions: (deps, ctx, input). deps = things to call out to; ctx = who/where/when.
//   2. One withTx per use case. Inside it: validate against the catalog, allocate the ID, move the
//      record with its bound transition() (row + audit event), save extras, queue jobs on tx.jobs.
//   3. Return a view object for the route; never return private details.
import type { CreateLostReportParsed, LostReport, LostReportCreated } from '@lf/contracts';
import {
  addDaysToInstant,
  DESK_ROLES,
  LOST_REPORT_OPEN_DAYS,
  lostReportMachine,
  type LostReportState,
} from '@lf/domain';
import { withTx } from '../../platform/db/tx';
import type { RequestCtx, Tx } from '../../platform/db/types';
import { Forbidden, NotFound, ValidationFailed } from '../../platform/errors';
import { nextId } from '../../platform/ids';
import { bindTransition } from '../audit';
import { resolvePlaceNames, resolveReportPlace } from '../catalog';
import { JOB, type MatchLostReportData } from '../../platform/jobs/names';
import { attachPhotos, photosForRecords } from '../photos';
import { similarInCustody, type FoundItemsDeps } from './found-items';
import {
  findLostReport,
  hasPrivateDetails,
  insertLostReport,
  insertPrivateDetails,
  listLostReportsByOwner,
  updateLostReportState,
  type LostReportRow,
  type NewLostReport,
} from './repo';

export type ItemsDeps = FoundItemsDeps;

/** The lost-report lifecycle bound to this module's repo (ADR-0011). State changes go only through here. */
type LostReportRecord = { id: string; state: LostReportState | null };
type LostReportChange = {
  values?: NewLostReport;
  patch?: Partial<Pick<LostReportRow, 'expiresAt' | 'renewCount'>>;
};

export const lostReportTransition = bindTransition({
  recordType: 'lost_report',
  machine: lostReportMachine,
  create: (tx, record: LostReportRecord, to, data: LostReportChange) => {
    if (!data.values) throw new Error('Creating a lost report needs values.');
    return insertLostReport(tx, tx.tenantId, record.id, to, data.values);
  },
  update: (tx, record: LostReportRecord, to, data: LostReportChange) => {
    if (record.state === null) throw new Error('Updating needs the current state.');
    return updateLostReportState(tx, tx.tenantId, record.id, record.state, to, data.patch);
  },
});

const MAX_PAST_DAYS = 365;
const FUTURE_SLACK_MS = 5 * 60 * 1000;

function checkTimeRange(input: CreateLostReportParsed, now: Date): void {
  const from = new Date(input.timeFrom).getTime();
  const to = new Date(input.timeTo).getTime();
  if (to > now.getTime() + FUTURE_SLACK_MS) {
    throw new ValidationFailed({
      timeTo: 'The "To" time is in the future; enter when you noticed it was gone.',
    });
  }
  if (from < addDaysToInstant(now, -MAX_PAST_DAYS).getTime()) {
    throw new ValidationFailed({
      timeFrom: 'That is more than a year ago; ask the Lost & Found office about older items.',
    });
  }
}

function privateNoteAad(tenantId: string, reportId: string): string {
  return `${tenantId}:lost_report:${reportId}`;
}

type PlaceNames = {
  buildingName: string | null;
  floorName: string | null;
  zoneName: string | null;
};

function toView(
  row: LostReportRow,
  names: PlaceNames,
  withPrivateDetails: boolean,
  photoIds: string[],
): LostReport {
  return {
    id: row.id,
    state: row.state as LostReportState,
    category: row.category,
    colour: row.colour,
    shortName: row.shortName,
    brand: row.brand,
    publicDescription: row.publicDescription,
    place: { buildingCode: row.buildingCode, ...names },
    timeFrom: row.timeFrom.toISOString(),
    timeTo: row.timeTo.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    hasPrivateDetails: withPrivateDetails,
    photoIds,
  };
}

/** US-01 / WF-01: a student, visitor or desk officer submits a lost report. */
export async function submitLostReport(
  deps: ItemsDeps,
  ctx: RequestCtx,
  input: CreateLostReportParsed,
): Promise<LostReportCreated> {
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();

  return withTx(ctx, async (tx) => {
    checkTimeRange(input, tx.now);
    const names = await resolveReportPlace(tx, input.place);
    if (!names)
      throw new ValidationFailed({
        'place.buildingCode':
          "That place isn't on the campus list; pick the building and floor again.",
      });

    const id = await nextId(tx, 'LST');
    const report = await lostReportTransition(tx, { id, state: null }, 'SUBMIT', {
      values: {
        ownerId: actor.userId,
        filedBy: actor.userId,
        category: input.category,
        colour: input.colour,
        brand: input.brand,
        shortName: input.shortName,
        publicDescription: input.publicDescription,
        buildingCode: input.place.buildingCode,
        floorId: input.place.floorId,
        zoneId: input.place.zoneId,
        timeFrom: new Date(input.timeFrom),
        timeTo: new Date(input.timeTo),
        expiresAt: addDaysToInstant(tx.now, LOST_REPORT_OPEN_DAYS),
      },
    });

    if (input.privateNote) {
      const encrypted = deps.crypto.encrypt(input.privateNote, privateNoteAad(tx.tenantId, id));
      await insertPrivateDetails(tx, tx.tenantId, {
        recordType: 'lost_report',
        recordId: id,
        ticks: [],
        noteCiphertext: encrypted.ciphertext,
        keyVersion: encrypted.keyVersion,
      });
    }

    await attachPhotos(tx, input.photoIds, {
      recordType: 'lost_report',
      recordId: id,
      purpose: 'item',
      visibility: 'private',
    });

    const job: MatchLostReportData = { tenantId: tx.tenantId, reportId: id };
    await deps.boss.send(JOB.matchLostReport, job, { db: tx.jobs });

    return {
      report: toView(report, names, input.privateNote !== null, [...new Set(input.photoIds)]),
      similarInCustody: await similarInCustody(tx, report),
    };
  });
}

function canRead(ctx: RequestCtx, row: LostReportRow): boolean {
  if (ctx.actor.kind !== 'user') return true;
  return row.ownerId === ctx.actor.userId || DESK_ROLES.includes(ctx.actor.role);
}

async function viewOf(tx: Tx, row: LostReportRow): Promise<LostReport> {
  const ids = [row.floorId, row.zoneId].filter((v): v is string => v !== null);
  const names = await resolvePlaceNames(tx, row.buildingCode ? [row.buildingCode] : [], ids);
  return toView(
    row,
    {
      buildingName: row.buildingCode ? (names.buildings.get(row.buildingCode) ?? null) : null,
      floorName: row.floorId ? (names.floorsAndZones.get(row.floorId) ?? null) : null,
      zoneName: row.zoneId ? (names.floorsAndZones.get(row.zoneId) ?? null) : null,
    },
    await hasPrivateDetails(tx, tx.tenantId, 'lost_report', row.id),
    ((await photosForRecords(tx, 'lost_report', [row.id])).get(row.id) ?? []).map((p) => p.id),
  );
}

/** The owner (or desk staff) reads one report. Anyone else gets NotFound, so IDs reveal nothing. */
export async function getLostReport(ctx: RequestCtx, id: string): Promise<LostReport> {
  return withTx(
    ctx,
    async (tx) => {
      const row = await findLostReport(tx, ctx.tenantId, id);
      if (!row || !canRead(ctx, row))
        throw new NotFound("We couldn't find that report; check the ID and try again.");
      return viewOf(tx, row);
    },
    { readOnly: true },
  );
}

/** The signed-in person's own reports, newest first. */
export async function listMyLostReports(ctx: RequestCtx): Promise<LostReport[]> {
  const actor = ctx.actor;
  if (actor.kind !== 'user') throw new Forbidden();
  return withTx(
    ctx,
    async (tx) => {
      const rows = await listLostReportsByOwner(tx, ctx.tenantId, actor.userId);
      const views: LostReport[] = [];
      for (const row of rows) views.push(await viewOf(tx, row));
      return views;
    },
    { readOnly: true },
  );
}
