// Contracts for found items (WF-02 student post, WF-03 desk intake), the gallery (FR-10), the desk
// views and photos. Shared by the forms, the routes and the OpenAPI document.
import {
  CATEGORIES,
  CATEGORY_CODES,
  COLOUR_CODES,
  FOUND_ITEM_STATES,
  normaliseId,
  type CategoryCode,
} from '@lf/domain';
import { z } from 'zod';

const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .transform((v) => (v === '' ? null : v))
    .nullable();

export const UploadedPhotoSchema = z
  .object({ id: z.uuid(), width: z.number(), height: z.number(), bytes: z.number() })
  .meta({ id: 'UploadedPhoto' });
export type UploadedPhoto = z.infer<typeof UploadedPhotoSchema>;

const photoIds = z.array(z.uuid()).max(5, 'Add up to 5 photos.').default([]);

/** Categories a student may post: everything except the desk-only restricted ones (CC-12). */
export const POSTABLE_CATEGORY_CODES = CATEGORIES.filter((c) => !c.restricted).map(
  (c) => c.code,
) as unknown as readonly [CategoryCode, ...CategoryCode[]];

export const FoundPlaceSchema = z
  .object({
    buildingCode: z.string('Pick the building where it was found.').trim().min(1).max(10),
    floorId: z.uuid().nullable(),
    zoneId: z.uuid().nullable(),
  })
  .refine((p) => p.floorId !== null || p.zoneId === null, {
    message: 'Pick a floor before choosing a zone.',
    path: ['zoneId'],
  })
  .meta({ id: 'FoundPlace' });

const describe = {
  colour: z.enum(COLOUR_CODES, 'Pick the main colour.').nullable(),
  shortName: optionalText(60, 'Keep the short name to 60 characters.'),
  brand: optionalText(40, 'Keep the brand to 40 characters.'),
  model: optionalText(60, 'Keep the model to 60 characters.'),
  publicDescription: optionalText(500, 'Keep the description to 500 characters.'),
  place: FoundPlaceSchema,
  foundAt: z.iso.datetime({ offset: true, error: 'Enter when it was found.' }),
  privateTicks: z.array(z.string().min(1).max(40)).max(10).default([]),
  /** Encrypted, desk staff only (FR-06). Never returned to the finder or anyone else. */
  privateNote: optionalText(500, 'Keep the private note to 500 characters.'),
  photoIds,
};

export const CreateFoundPostSchema = z
  .object({
    category: z.enum(POSTABLE_CATEGORY_CODES, 'Pick what you found.'),
    ...describe,
    /** Open lost reports the finder thinks it belongs to ("This might be theirs", NF-01). */
    pingReportIds: z.array(z.string().min(1).max(32)).max(5).default([]),
  })
  .meta({ id: 'CreateFoundPost' });
export type CreateFoundPost = z.input<typeof CreateFoundPostSchema>;
export type CreateFoundPostParsed = z.output<typeof CreateFoundPostSchema>;

/** Desk intake (WF-03): any category, plus condition, bin and the ID card number. */
export const LogFoundItemSchema = z
  .object({
    category: z.enum(CATEGORY_CODES, 'Pick what it is.'),
    ...describe,
    condition: optionalText(300, 'Keep the condition note to 300 characters.'),
    conditionPhotoIds: photoIds,
    /** Null only for restricted items, which are never shelved. */
    binCode: z.string().trim().max(10).nullable(),
    /** University ID or card number (CC-06). Stored encrypted; only the last 4 are ever shown. */
    idNumber: optionalText(40, 'Keep the number to 40 characters.'),
    /** NF-04, CC-17: an ID from an outage label sheet, entered after the outage. */
    reservedId: z.string().trim().max(20).nullable().optional(),
    /** When the item was tagged on paper; retention counts from then. */
    intakeAt: z.iso
      .datetime({ offset: true, error: 'Pick when the item was tagged.' })
      .nullable()
      .optional(),
  })
  .meta({ id: 'LogFoundItem' });
export type LogFoundItem = z.input<typeof LogFoundItemSchema>;
export type LogFoundItemParsed = z.output<typeof LogFoundItemSchema>;

/** A student post brought to the desk: what the officer confirms or adds (WF-02 step 4). */
export const ReceiveFoundItemSchema = LogFoundItemSchema.omit({
  photoIds: true,
  reservedId: true,
  intakeAt: true,
})
  .extend({ photoIds })
  .meta({ id: 'ReceiveFoundItem' });
export type ReceiveFoundItem = z.input<typeof ReceiveFoundItemSchema>;
export type ReceiveFoundItemParsed = z.output<typeof ReceiveFoundItemSchema>;

export const CorrectFoundItemSchema = z
  .object({
    shortName: optionalText(60, 'Keep the short name to 60 characters.').optional(),
    binCode: z.string().trim().max(10).nullable().optional(),
    condition: optionalText(300, 'Keep the condition note to 300 characters.').optional(),
    reason: z
      .string('Say why you are changing it.')
      .trim()
      .min(3, 'Say why you are changing it.')
      .max(300, 'Keep the reason to 300 characters.'),
  })
  .meta({ id: 'CorrectFoundItem' });
export type CorrectFoundItem = z.input<typeof CorrectFoundItemSchema>;

export const ReasonSchema = z
  .object({
    reason: z
      .string('Say why.')
      .trim()
      .min(3, 'Say why.')
      .max(300, 'Keep the reason to 300 characters.'),
  })
  .meta({ id: 'Reason' });

export const FoundItemStateSchema = z.enum(FOUND_ITEM_STATES).meta({ id: 'FoundItemState' });

const placeView = z.object({
  buildingCode: z.string().nullable(),
  buildingName: z.string().nullable(),
  floorName: z.string().nullable(),
  zoneName: z.string().nullable(),
});

const deskInfo = z.object({ name: z.string(), location: z.string(), hours: z.string() });

/** What the finder sees about their own post. */
export const FoundPostSchema = z
  .object({
    id: z.string(),
    state: FoundItemStateSchema,
    category: z.string(),
    colour: z.string().nullable(),
    title: z.string(),
    shortName: z.string().nullable(),
    brand: z.string().nullable(),
    model: z.string().nullable(),
    publicDescription: z.string().nullable(),
    place: placeView,
    foundAt: z.iso.datetime({ offset: true }),
    handInDeadline: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    photoIds: z.array(z.string()),
    /** QR for the desk (a link to this record). */
    qrDataUri: z.string(),
    desk: deskInfo,
    /** How many owners were pinged. */
    pinged: z.number(),
  })
  .meta({ id: 'FoundPost' });
export type FoundPost = z.infer<typeof FoundPostSchema>;

export const FoundPostListSchema = z
  .object({ items: z.array(FoundPostSchema.omit({ qrDataUri: true, desk: true })) })
  .meta({ id: 'FoundPostList' });

/** A gallery card (FR-10). Sensitive items never carry a photo. */
export const GalleryItemSchema = z
  .object({
    id: z.string(),
    state: FoundItemStateSchema,
    category: z.string(),
    colour: z.string().nullable(),
    title: z.string(),
    place: placeView,
    foundAt: z.iso.datetime({ offset: true }),
    sensitive: z.boolean(),
    photoId: z.string().nullable(),
  })
  .meta({ id: 'GalleryItem' });
export type GalleryItem = z.infer<typeof GalleryItemSchema>;

export const GalleryQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(CATEGORY_CODES).optional(),
  building: z.string().trim().max(10).optional(),
  /** Found on or after this Dhaka date (YYYY-MM-DD). */
  since: z.iso.date().optional(),
});

export const GalleryListSchema = z
  .object({ items: z.array(GalleryItemSchema) })
  .meta({ id: 'GalleryList' });

/** A lost report as the "Someone lost this?" panel shows it: no names, no contacts (US-02). */
export const SimilarLostReportSchema = z
  .object({
    id: z.string(),
    category: z.string(),
    colour: z.string().nullable(),
    title: z.string(),
    place: placeView,
    lostOn: z.iso.datetime({ offset: true }),
    reasons: z.array(z.string()),
  })
  .meta({ id: 'SimilarLostReport' });
export type SimilarLostReport = z.infer<typeof SimilarLostReportSchema>;

export const SimilarLostQuerySchema = z
  .object({
    category: z.enum(CATEGORY_CODES),
    colour: z.enum(COLOUR_CODES).nullable().default(null),
    brand: z.string().trim().max(40).nullable().default(null),
    words: z.string().trim().max(500).nullable().default(null),
    buildingCode: z.string().trim().max(10).nullable().default(null),
    floorId: z.uuid().nullable().default(null),
    zoneId: z.uuid().nullable().default(null),
    foundAt: z.iso.datetime({ offset: true }).nullable().default(null),
  })
  .meta({ id: 'SimilarLostQuery' });
export type SimilarLostQuery = z.input<typeof SimilarLostQuerySchema>;

export const SimilarLostListSchema = z
  .object({ reports: z.array(SimilarLostReportSchema) })
  .meta({ id: 'SimilarLostList' });

const historyEntry = z.object({
  event: z.string(),
  label: z.string(),
  fromState: z.string().nullable(),
  toState: z.string().nullable(),
  at: z.iso.datetime({ offset: true }),
  by: z.string(),
  note: z.string().nullable(),
});

/** The desk's view of a found item, including private details (staff only). */
export const DeskFoundItemSchema = z
  .object({
    id: z.string(),
    state: FoundItemStateSchema,
    category: z.string(),
    colour: z.string().nullable(),
    title: z.string(),
    shortName: z.string().nullable(),
    brand: z.string().nullable(),
    model: z.string().nullable(),
    publicDescription: z.string().nullable(),
    place: placeView,
    foundAt: z.iso.datetime({ offset: true }),
    source: z.enum(['finder', 'desk']),
    sourceLabel: z.string(),
    binCode: z.string().nullable(),
    condition: z.string().nullable(),
    handInDeadline: z.iso.datetime({ offset: true }).nullable(),
    retentionEndsAt: z.iso.datetime({ offset: true }).nullable(),
    restricted: z.boolean(),
    sensitive: z.boolean(),
    idNumberMasked: z.string().nullable(),
    privateDetails: z.object({ ticks: z.array(z.string()), note: z.string().nullable() }),
    photoIds: z.array(z.string()),
    conditionPhotoIds: z.array(z.string()),
    history: z.array(historyEntry),
    /** Owners told about this item: by finder ping or the ID card fast lane. */
    ownerEmailed: z.boolean(),
    /** CC-04: the record this one was merged into, if it was a duplicate. */
    mergedInto: z.string().nullable(),
    /** CC-04: same category, place and day; the desk may merge them. */
    possibleDuplicates: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        state: FoundItemStateSchema,
        source: z.string(),
      }),
    ),
  })
  .meta({ id: 'DeskFoundItem' });

export const MergeFoundItemSchema = z
  .object({ into: z.string().trim().min(1, 'Pick the record to keep.') })
  .meta({ id: 'MergeFoundItem' });
export type DeskFoundItem = z.infer<typeof DeskFoundItemSchema>;

export const DeskItemRowSchema = z
  .object({
    id: z.string(),
    state: FoundItemStateSchema,
    category: z.string(),
    title: z.string(),
    binCode: z.string().nullable(),
    photoId: z.string().nullable(),
    sensitive: z.boolean(),
    due: z.iso.datetime({ offset: true }).nullable(),
  })
  .meta({ id: 'DeskItemRow' });
export type DeskItemRow = z.infer<typeof DeskItemRowSchema>;

export const DESK_SEARCH_SCOPES = ['active', 'all'] as const;
export const DeskSearchQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(CATEGORY_CODES).optional(),
  /** active = at the desk or due to arrive; all = every state. */
  scope: z.enum(DESK_SEARCH_SCOPES).default('active'),
});

export const DeskItemListSchema = z
  .object({ items: z.array(DeskItemRowSchema) })
  .meta({ id: 'DeskItemList' });

export const DeskTodaySchema = z
  .object({
    toShelve: z.array(DeskItemRowSchema),
    claimsToReview: z.array(DeskItemRowSchema),
    pickupsDue: z.array(DeskItemRowSchema),
    expiringThisWeek: z.array(DeskItemRowSchema),
  })
  .meta({ id: 'DeskToday' });
export type DeskToday = z.infer<typeof DeskTodaySchema>;

export const FoundItemLabelSchema = z
  .object({
    id: z.string(),
    binCode: z.string().nullable(),
    category: z.string(),
    categoryLabel: z.string(),
    date: z.iso.datetime({ offset: true }),
    qrDataUri: z.string(),
    url: z.string(),
  })
  .meta({ id: 'FoundItemLabel' });
export type FoundItemLabel = z.infer<typeof FoundItemLabelSchema>;

export const LoggedFoundItemSchema = z
  .object({ item: DeskFoundItemSchema, label: FoundItemLabelSchema })
  .meta({ id: 'LoggedFoundItem' });
export type LoggedFoundItem = z.infer<typeof LoggedFoundItemSchema>;

export const BinSuggestionSchema = z
  .object({
    suggested: z.string().nullable(),
    bins: z.array(z.object({ code: z.string(), itemCount: z.number() })),
  })
  .meta({ id: 'BinSuggestion' });
export type BinSuggestion = z.infer<typeof BinSuggestionSchema>;

/** Accepts "FND-2611-0042K", "fnd26110042k" or a label link ".../i/FND-2611-0042K". */
export function idFromScan(value: string): string | null {
  const trimmed = value.trim();
  const fromLink = /\/i\/([A-Za-z0-9-]+)\/?$/.exec(trimmed)?.[1];
  return normaliseId(fromLink ?? trimmed);
}

/** "Likely matches in custody" on a lost report (Figma 39:6605). */
export const LikelyMatchSchema = GalleryItemSchema.extend({
  score: z.number(),
  reasons: z.array(z.string()),
}).meta({ id: 'LikelyMatch' });
export type LikelyMatch = z.infer<typeof LikelyMatchSchema>;

// ── Daily shelf check (FR-15) ─────────────────────────────────────────────────────────────────────

export const ShelfCheckListSchema = z
  .object({ bins: z.array(z.object({ binCode: z.string(), items: z.array(DeskItemRowSchema) })) })
  .meta({ id: 'ShelfCheckList' });
export type ShelfCheckList = z.infer<typeof ShelfCheckListSchema>;

export const ShelfCheckSubmitSchema = z
  .object({
    results: z
      .array(z.object({ id: z.string().trim().min(1), present: z.boolean() }))
      .min(1, 'Tick at least one item, then save.')
      .max(1000, 'Save at most 1000 items at a time.'),
  })
  .meta({ id: 'ShelfCheckSubmit' });
export type ShelfCheckSubmit = z.infer<typeof ShelfCheckSubmitSchema>;

export const ShelfCheckResultSchema = z
  .object({ checked: z.number().int(), missing: z.array(DeskItemRowSchema) })
  .meta({ id: 'ShelfCheckResult' });
export type ShelfCheckResult = z.infer<typeof ShelfCheckResultSchema>;
