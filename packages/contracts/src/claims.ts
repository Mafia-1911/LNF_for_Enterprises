// Contracts for claims (WF-04, FR-11, FR-12, NF-03, CC-01, CC-11, CC-15) and handovers (DSP records,
// FR-16, FR-17). Claim answers and pickup codes are private: only the claimant and desk staff see them.
import { CLAIM_STATES, SECOND_CHECKS } from '@lf/domain';
import { z } from 'zod';
import { DeskItemRowSchema, GalleryItemSchema } from './found-item';

export const ClaimStateSchema = z.enum(CLAIM_STATES).meta({ id: 'ClaimState' });

export const ClaimQuestionSchema = z
  .object({ key: z.string(), question: z.string() })
  .meta({ id: 'ClaimQuestion' });

const deskInfo = z.object({ name: z.string(), location: z.string(), hours: z.string() });

/** What the claim form needs: the item, its questions, and my open reports to link. */
export const ClaimStartSchema = z
  .object({
    item: GalleryItemSchema,
    questions: z.array(ClaimQuestionSchema),
    myClaim: z.object({ id: z.string(), state: ClaimStateSchema }).nullable(),
    myLostReports: z.array(z.object({ id: z.string(), title: z.string() })),
    /** Why a claim can't be made right now (one sentence), or null. */
    blockedReason: z.string().nullable(),
  })
  .meta({ id: 'ClaimStart' });
export type ClaimStart = z.infer<typeof ClaimStartSchema>;

export const SubmitClaimSchema = z
  .object({
    answers: z
      .array(
        z.object({
          key: z.string().min(1).max(40),
          answer: z
            .string('Answer the question.')
            .trim()
            .min(2, 'Answer the question; a few words are enough.')
            .max(300, 'Keep the answer to 300 characters.'),
        }),
      )
      .min(1)
      .max(3),
    lostReportId: z.string().max(32).nullable().default(null),
    /** Optional proof: a receipt or an older photo of it (WF-04). Staff only. */
    proofPhotoIds: z.array(z.uuid()).max(3, 'Add up to 3 photos.').default([]),
  })
  .meta({ id: 'SubmitClaim' });
export type SubmitClaim = z.input<typeof SubmitClaimSchema>;
export type SubmitClaimParsed = z.output<typeof SubmitClaimSchema>;

export const ProvideMoreSchema = z
  .object({
    answer: z
      .string('Answer what the desk asked.')
      .trim()
      .min(2, 'Answer what the desk asked.')
      .max(500, 'Keep the answer to 500 characters.'),
  })
  .meta({ id: 'ProvideMore' });

/** The claimant's view of their claim. The pickup code shows once the claim is approved. */
export const ClaimSchema = z
  .object({
    id: z.string(),
    state: ClaimStateSchema,
    item: GalleryItemSchema,
    lostReportId: z.string().nullable(),
    answers: z.array(z.object({ key: z.string(), question: z.string(), answer: z.string() })),
    moreInfoRequest: z.string().nullable(),
    decisionNote: z.string().nullable(),
    pickupCode: z.string().nullable(),
    pickupEndsAt: z.iso.datetime({ offset: true }).nullable(),
    reviewDueAt: z.iso.datetime({ offset: true }),
    createdAt: z.iso.datetime({ offset: true }),
    desk: deskInfo,
    canReRequest: z.boolean(),
    /** WF-06: a closed claim can be disputed within 7 days; a collected one if it was the wrong item. */
    canDispute: z.enum(['second_claimant', 'wrong_handover']).nullable(),
    /** CC-09: someone the owner nominated to collect for them. */
    proxy: z.object({ name: z.string(), idMasked: z.string() }).nullable(),
    canNominateProxy: z.boolean(),
  })
  .meta({ id: 'Claim' });

export const NominateProxySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, { error: "Type the person's full name." })
      .max(80, { error: 'Keep the name to 80 characters.' }),
    universityId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{4,20}$/, {
        error: 'Type their university ID number, e.g. 2214450613.',
      }),
  })
  .meta({ id: 'NominateProxy' });
export type NominateProxy = z.infer<typeof NominateProxySchema>;
export type Claim = z.infer<typeof ClaimSchema>;

export const ClaimListSchema = z.object({ claims: z.array(ClaimSchema) }).meta({ id: 'ClaimList' });

// ── Desk ───────────────────────────────────────────────────────────────────────────────────────

export const DeskClaimQueueSchema = z
  .object({
    items: z.array(
      z.object({
        item: DeskItemRowSchema,
        claims: z.number(),
        dueAt: z.iso.datetime({ offset: true }),
      }),
    ),
  })
  .meta({ id: 'DeskClaimQueue' });
export type DeskClaimQueue = z.infer<typeof DeskClaimQueueSchema>;

export const VERDICTS = ['pass', 'fail'] as const;

export const DeskClaimSchema = z
  .object({
    id: z.string(),
    state: ClaimStateSchema,
    claimant: z.object({ name: z.string(), title: z.string().nullable(), role: z.string() }),
    submittedAt: z.iso.datetime({ offset: true }),
    dueAt: z.iso.datetime({ offset: true }),
    lostReportId: z.string().nullable(),
    failedVerifications: z.number(),
    answers: z.array(
      z.object({
        key: z.string(),
        question: z.string(),
        answer: z.string(),
        verdict: z.enum(VERDICTS).nullable(),
      }),
    ),
    moreInfoRequest: z.string().nullable(),
    decisionNote: z.string().nullable(),
    proofPhotoIds: z.array(z.string()),
  })
  .meta({ id: 'DeskClaim' });
export type DeskClaim = z.infer<typeof DeskClaimSchema>;

/** One item with every claim on it, next to what was recorded at intake (FR-12, Figma 39:15356). */
export const DeskItemClaimsSchema = z
  .object({
    item: z.object({
      id: z.string(),
      title: z.string(),
      state: z.string(),
      category: z.string(),
      binCode: z.string().nullable(),
      photoId: z.string().nullable(),
    }),
    recorded: z.object({
      ticks: z.array(z.object({ code: z.string(), label: z.string() })),
      note: z.string().nullable(),
    }),
    claims: z.array(DeskClaimSchema),
  })
  .meta({ id: 'DeskItemClaims' });
export type DeskItemClaims = z.infer<typeof DeskItemClaimsSchema>;

export const ReviewClaimSchema = z
  .object({
    verdicts: z.record(z.string(), z.enum(VERDICTS)),
    decision: z.enum(['approve', 'reject', 'more']),
    note: z
      .string()
      .trim()
      .max(500, 'Keep the note to 500 characters.')
      .transform((v) => (v === '' ? null : v))
      .nullable()
      .default(null),
  })
  .meta({ id: 'ReviewClaim' });
export type ReviewClaim = z.input<typeof ReviewClaimSchema>;
export type ReviewClaimParsed = z.output<typeof ReviewClaimSchema>;

// ── Handover (WF-04 steps 5–7) ─────────────────────────────────────────────────────────────────

export const PickupLookupSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Type the 6-digit pickup code.'),
  })
  .meta({ id: 'PickupLookup' });

export const PickupSchema = z
  .object({
    claimId: z.string(),
    item: z.object({
      id: z.string(),
      title: z.string(),
      category: z.string(),
      binCode: z.string().nullable(),
      photoId: z.string().nullable(),
    }),
    claimant: z.object({ name: z.string(), title: z.string().nullable(), role: z.string() }),
    /** Device, cash, jewellery: a second check is needed (CC-07, CC-08). */
    highValue: z.boolean(),
    /** Visitor collecting a high-value item: a supervisor must approve (CC-10). */
    needsSupervisor: z.boolean(),
    /** A supervisor's approval for this handover (requested from the desk, CC-08, CC-10). */
    approval: z.enum(['none', 'requested', 'approved']),
    /** CC-09: a nominated proxy who may collect instead, with the last 4 of their ID. */
    proxy: z.object({ name: z.string(), idLast4: z.string() }).nullable(),
    pickupEndsAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'Pickup' });
export type Pickup = z.infer<typeof PickupSchema>;

export const HandOverSchema = z
  .object({
    photoMatches: z.literal(true, 'Check the person against the photo on their ID first.'),
    idLast4: z
      .string('Type the last 4 characters of the ID you checked.')
      .trim()
      .regex(/^[A-Za-z0-9]{4}$/, 'Type the last 4 characters of the ID you checked.'),
    secondCheck: z.enum(SECOND_CHECKS).nullable().default(null),
    signaturePhotoId: z.uuid('Ask the claimant to sign first.'),
    /** CC-09: the owner, or the proxy they nominated. */
    collectedBy: z.enum(['owner', 'proxy']).default('owner'),
  })
  .meta({ id: 'HandOver' });
export type HandOver = z.input<typeof HandOverSchema>;
export type HandOverParsed = z.output<typeof HandOverSchema>;

export const DispatchSchema = z
  .object({
    id: z.string(),
    foundItemId: z.string(),
    itemTitle: z.string(),
    claimId: z.string(),
    recipientName: z.string(),
    idLast4: z.string(),
    secondCheck: z.string().nullable(),
    officerName: z.string(),
    /** Set when a nominated proxy collected for the owner (CC-09). */
    proxyName: z.string().nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    locksAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'Dispatch' });
export type Dispatch = z.infer<typeof DispatchSchema>;
