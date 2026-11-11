// Contracts for the golden slice: "Submit a lost report" (US-01, WF-01). Shared by the form
// (React Hook Form + zodResolver), the API route (createRoute) and the OpenAPI document.
import { CATEGORIES, COLOUR_CODES, LOST_REPORT_STATES, type CategoryCode } from '@lf/domain';
import { z } from 'zod';

/** Categories a person can report as lost: everything except the desk-only restricted ones. */
export const REPORTABLE_CATEGORY_CODES = CATEGORIES.filter((c) => !c.restricted).map(
  (c) => c.code,
) as unknown as readonly [CategoryCode, ...CategoryCode[]];

const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .transform((v) => (v === '' ? null : v))
    .nullable();

export const LostReportPlaceSchema = z
  .object({
    /** Building code, e.g. "NAC"; null means "Not sure". */
    buildingCode: z.string().trim().min(1).max(10).nullable(),
    floorId: z.uuid().nullable(),
    zoneId: z.uuid().nullable(),
  })
  .refine((p) => p.buildingCode !== null || (p.floorId === null && p.zoneId === null), {
    message: 'Pick a building before choosing a floor or zone.',
    path: ['floorId'],
  })
  .refine((p) => p.floorId !== null || p.zoneId === null, {
    message: 'Pick a floor before choosing a zone.',
    path: ['zoneId'],
  })
  .meta({ id: 'LostReportPlace' });

export const CreateLostReportSchema = z
  .object({
    category: z.enum(REPORTABLE_CATEGORY_CODES, 'Pick what you lost.'),
    colour: z.enum(COLOUR_CODES, 'Pick the main colour.').nullable(),
    shortName: optionalText(60, 'Keep the short name to 60 characters.'),
    brand: optionalText(40, 'Keep the brand to 40 characters.'),
    publicDescription: optionalText(500, 'Keep the description to 500 characters.'),
    /** Stored encrypted, shown only to desk staff during claim review (FR-06). Never returned. */
    privateNote: optionalText(500, 'Keep private details to 500 characters.'),
    place: LostReportPlaceSchema,
    /** Up to 5 photos from POST /api/photos (FR-05). Seen only by the owner and desk staff. */
    photoIds: z.array(z.uuid()).max(5, 'Add up to 5 photos.').default([]),
    /** When the owner last saw it (ISO 8601 with offset). */
    timeFrom: z.iso.datetime({ offset: true, error: 'Enter when you last had it.' }),
    /** When they noticed it was gone. */
    timeTo: z.iso.datetime({ offset: true, error: 'Enter when you noticed it was gone.' }),
    /** US-10: desk staff filing for a walk-in student give the student's university email. */
    ownerEmail: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email({ error: "Type the student's university email." }))
      .optional(),
  })
  .refine((v) => Date.parse(v.timeTo) >= Date.parse(v.timeFrom), {
    message: 'The "To" time must be after the "From" time.',
    path: ['timeTo'],
  })
  .meta({ id: 'CreateLostReport' });
export type CreateLostReport = z.input<typeof CreateLostReportSchema>;
export type CreateLostReportParsed = z.output<typeof CreateLostReportSchema>;

export const LostReportStateSchema = z.enum(LOST_REPORT_STATES).meta({ id: 'LostReportState' });

export const LostReportSchema = z
  .object({
    id: z.string(),
    state: LostReportStateSchema,
    category: z.string(),
    colour: z.string().nullable(),
    shortName: z.string().nullable(),
    brand: z.string().nullable(),
    publicDescription: z.string().nullable(),
    place: z.object({
      buildingCode: z.string().nullable(),
      buildingName: z.string().nullable(),
      floorName: z.string().nullable(),
      zoneName: z.string().nullable(),
    }),
    timeFrom: z.iso.datetime({ offset: true }),
    timeTo: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    createdAt: z.iso.datetime({ offset: true }),
    /** True when private details were recorded. Their content is never returned to the owner. */
    hasPrivateDetails: z.boolean(),
    photoIds: z.array(z.string()),
    /** Renewals used (two allowed, SRS lifecycles.lost_report). */
    renewCount: z.number(),
  })
  .meta({ id: 'LostReport' });
export type LostReport = z.infer<typeof LostReportSchema>;

export const LostReportCreatedSchema = z
  .object({
    report: LostReportSchema,
    /** Up to 5 similar items already at the desk (CC-05), with plain reasons (FR-07). */
    similarInCustody: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        category: z.string(),
        place: z.object({ buildingName: z.string().nullable(), zoneName: z.string().nullable() }),
        foundAt: z.iso.datetime({ offset: true }),
        photoId: z.string().nullable(),
        reasons: z.array(z.string()),
      }),
    ),
  })
  .meta({ id: 'LostReportCreated' });
export type LostReportCreated = z.infer<typeof LostReportCreatedSchema>;

export const LostReportListSchema = z
  .object({ reports: z.array(LostReportSchema) })
  .meta({ id: 'LostReportList' });
