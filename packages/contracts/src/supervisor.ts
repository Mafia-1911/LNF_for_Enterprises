// Supervisor contracts (phase 4): policies and closures, retention decisions, the overview, and
// staff. Messages follow the error rule: what happened, then what to do next.
import { DISPOSAL_DECISIONS } from '@lf/domain';
import { z } from 'zod';
import { DispatchSchema } from './claims';
import { DeskTodaySchema, FoundItemStateSchema } from './found-item';

// ── Policies (Figma 39:26930) ─────────────────────────────────────────────────────────────────────

const days = (label: string, min: number, max: number) =>
  z
    .number({ error: `Type the ${label} as a number of days.` })
    .int({ error: `Type the ${label} as a whole number of days.` })
    .min(min, { error: `The ${label} must be at least ${min} days; type a larger number.` })
    .max(max, { error: `The ${label} can be at most ${max} days; type a smaller number.` });

export const PoliciesSchema = z
  .object({
    /** Owners can nominate a proxy by university ID (CC-09, A6). */
    proxyPickup: z.boolean(),
    retentionDays: days('retention period', 7, 365),
    lookAlikeRetentionDays: days('look-alike retention', 7, 365),
    /** Working days (Sun–Thu). */
    pickupWindowDays: z
      .number({ error: 'Type the pickup window as a number of working days.' })
      .int({ error: 'Type the pickup window as a whole number of working days.' })
      .min(1, { error: 'The pickup window must be at least 1 working day; type a larger number.' })
      .max(10, {
        error: 'The pickup window can be at most 10 working days; type a smaller number.',
      }),
    activeClaimCap: z
      .number({ error: 'Type the claim cap as a number.' })
      .int({ error: 'Type the claim cap as a whole number.' })
      .min(1, { error: 'The claim cap must be at least 1; type a larger number.' })
      .max(10, { error: 'The claim cap can be at most 10; type a smaller number.' }),
    /** P1: stored, not sent yet (no SMS provider; ADR-0009). */
    smsAlerts: z.boolean(),
  })
  .refine((p) => p.lookAlikeRetentionDays <= p.retentionDays, {
    path: ['lookAlikeRetentionDays'],
    error:
      "Look-alike retention can't be longer than the retention period; lower it or raise the retention period.",
  })
  .meta({ id: 'Policies' });
export type Policies = z.infer<typeof PoliciesSchema>;

const localDate = (what: string) =>
  z.iso.date({ error: `Pick the ${what} date from the calendar.` });

export const ClosureSchema = z
  .object({ id: z.uuid(), name: z.string(), from: z.iso.date(), to: z.iso.date() })
  .meta({ id: 'Closure' });
export type Closure = z.infer<typeof ClosureSchema>;

export const AddClosureSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, { error: 'Give the closure a name, e.g. "Durga Puja closure".' })
      .max(80, { error: 'Keep the name under 80 characters; shorten it.' }),
    from: localDate('first'),
    to: localDate('last'),
  })
  .refine((c) => c.to >= c.from, {
    path: ['to'],
    error: 'The closure ends before it starts; pick a last day on or after the first.',
  })
  .meta({ id: 'AddClosure' });
export type AddClosure = z.infer<typeof AddClosureSchema>;

export const PolicySettingsSchema = z
  .object({ policies: PoliciesSchema, closures: z.array(ClosureSchema) })
  .meta({ id: 'PolicySettings' });
export type PolicySettings = z.infer<typeof PolicySettingsSchema>;

// ── Retention and disposal (WF-05, Figma 39:21973) ────────────────────────────────────────────────

export const DisposalDecisionSchema = z.enum(DISPOSAL_DECISIONS);
export type DisposalDecision = z.infer<typeof DisposalDecisionSchema>;

export const RetentionItemSchema = z
  .object({
    id: z.string(),
    state: FoundItemStateSchema,
    category: z.string(),
    title: z.string(),
    binCode: z.string().nullable(),
    place: z.string().nullable(),
    photoId: z.string().nullable(),
    sensitive: z.boolean(),
    lookAlike: z.boolean(),
    /** When retention ended or will end. */
    endsAt: z.iso.datetime({ offset: true }).nullable(),
    /** For decided items: what was decided, when, and the note. */
    decision: DisposalDecisionSchema.nullable(),
    decidedAt: z.iso.datetime({ offset: true }).nullable(),
    note: z.string().nullable(),
  })
  .meta({ id: 'RetentionItem' });
export type RetentionItem = z.infer<typeof RetentionItemSchema>;

export const RetentionListSchema = z
  .object({
    policy: z.object({ days: z.number().int(), lookAlikeDays: z.number().int() }),
    awaiting: z.array(RetentionItemSchema),
    ending: z.array(RetentionItemSchema),
    decided: z.array(RetentionItemSchema),
  })
  .meta({ id: 'RetentionList' });
export type RetentionList = z.infer<typeof RetentionListSchema>;

export const RetentionDecisionSchema = z
  .object({
    ids: z
      .array(z.string().trim().min(1))
      .min(1, { error: 'Select at least one item, then choose what to do with it.' })
      .max(100, { error: 'Decide at most 100 items at once; select fewer.' }),
    decision: DisposalDecisionSchema,
    note: z
      .string()
      .trim()
      .min(3, { error: 'Add a short note, e.g. who received the items.' })
      .max(300, { error: 'Keep the note under 300 characters; shorten it.' }),
  })
  .meta({ id: 'RetentionDecision' });
export type RetentionDecision = z.infer<typeof RetentionDecisionSchema>;

export const RetentionDecisionResultSchema = z
  .object({ decided: z.number().int() })
  .meta({ id: 'RetentionDecisionResult' });

export const RetentionRunSchema = z
  .object({
    recalculated: z.number().int(),
    expired: z.number().int(),
    lastChanceAlerts: z.number().int(),
  })
  .meta({ id: 'RetentionRun' });
export type RetentionRun = z.infer<typeof RetentionRunSchema>;

// ── Overview (Figma 39:20616) ─────────────────────────────────────────────────────────────────────

export const NeedsDecisionSchema = z
  .object({
    kind: z.enum(['retention', 'claim_overdue', 'dispute', 'approval', 'flag']),
    title: z.string(),
    detail: z.string(),
    link: z.string(),
    at: z.iso.datetime({ offset: true }).nullable(),
  })
  .meta({ id: 'NeedsDecision' });

export const ActivityEntrySchema = z
  .object({
    id: z.number().int(),
    label: z.string(),
    recordId: z.string(),
    actor: z.string(),
    at: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'ActivityEntry' });
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;

export const SupervisorOverviewSchema = z
  .object({
    counts: z.object({
      inCustody: z.number().int(),
      claimsToReview: z.number().int(),
      returned30Days: z.number().int(),
      expiringThisWeek: z.number().int(),
    }),
    /** Sidebar badges. */
    badges: z.object({
      retention: z.number().int(),
      approvals: z.number().int(),
      disputes: z.number().int(),
      flags: z.number().int(),
    }),
    needsDecision: z.array(NeedsDecisionSchema),
    activity: z.array(ActivityEntrySchema),
    today: DeskTodaySchema,
  })
  .meta({ id: 'SupervisorOverview' });
export type SupervisorOverview = z.infer<typeof SupervisorOverviewSchema>;

// ── Staff (Figma 39:27640) ────────────────────────────────────────────────────────────────────────

export const STAFF_ROLES = ['desk_officer', 'supervisor'] as const;
export const StaffRoleSchema = z.enum(STAFF_ROLES, {
  error: 'Choose desk officer or supervisor.',
});

export const StaffMemberSchema = z
  .object({
    /** null while the person hasn't signed in yet (an invite). */
    userId: z.uuid().nullable(),
    email: z.string(),
    name: z.string(),
    role: StaffRoleSchema,
    status: z.enum(['active', 'invited']),
    /** The signed-in supervisor; they can't remove their own access. */
    you: z.boolean(),
  })
  .meta({ id: 'StaffMember' });
export type StaffMember = z.infer<typeof StaffMemberSchema>;

export const StaffListSchema = z
  .object({ staff: z.array(StaffMemberSchema) })
  .meta({ id: 'StaffList' });
export type StaffList = z.infer<typeof StaffListSchema>;

export const AddStaffSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, { error: "Type the person's full name." })
      .max(80, { error: 'Keep the name under 80 characters; shorten it.' }),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(z.email({ error: 'That email address looks incomplete; check it and try again.' })),
    role: StaffRoleSchema,
  })
  .meta({ id: 'AddStaff' });
export type AddStaff = z.infer<typeof AddStaffSchema>;

export const RemoveStaffSchema = z
  .object({ email: z.string().trim().toLowerCase().min(3) })
  .meta({ id: 'RemoveStaff' });
export type RemoveStaff = z.infer<typeof RemoveStaffSchema>;

// ── Dispatch directory (FR-16, FR-17, FR-18, Figma 39:22656) ─────────────────────────────────────

export const DispatchListQuerySchema = z.object({
  /** DSP ID, FND ID, claimant name or the last 4 of their ID. */
  q: z.string().trim().max(100).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  category: z.string().max(40).optional(),
});
export type DispatchListQuery = z.infer<typeof DispatchListQuerySchema>;

export const DispatchRowSchema = z
  .object({
    id: z.string(),
    foundItemId: z.string(),
    itemTitle: z.string(),
    category: z.string(),
    claimantName: z.string(),
    /** "••••5042": only the last 4 of the checked ID are ever stored. */
    idMasked: z.string(),
    createdAt: z.iso.datetime({ offset: true }),
    locked: z.boolean(),
    disputed: z.boolean(),
    amendments: z.number().int(),
  })
  .meta({ id: 'DispatchRow' });
export type DispatchRow = z.infer<typeof DispatchRowSchema>;

export const DispatchListSchema = z
  .object({ dispatches: z.array(DispatchRowSchema) })
  .meta({ id: 'DispatchList' });
export type DispatchList = z.infer<typeof DispatchListSchema>;

export const HistoryEntrySchema = z
  .object({
    label: z.string(),
    actor: z.string(),
    at: z.iso.datetime({ offset: true }),
    note: z.string().nullable(),
  })
  .meta({ id: 'HistoryEntry' });
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const AmendmentSchema = z
  .object({
    seq: z.number().int(),
    reason: z.string(),
    by: z.string(),
    at: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'Amendment' });

export const AddAmendmentSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(5, { error: 'Say what was wrong and what is correct, in a sentence.' })
      .max(500, { error: 'Keep the correction under 500 characters; shorten it.' }),
  })
  .meta({ id: 'AddAmendment' });
export type AddAmendment = z.infer<typeof AddAmendmentSchema>;

// ── Disputes (WF-06, CC-01, CC-14, Figma 39:23422) ───────────────────────────────────────────────

export const DisputeKindSchema = z.enum(['second_claimant', 'wrong_handover']);
export type DisputeKind = z.infer<typeof DisputeKindSchema>;

export const DisputeSchema = z
  .object({
    id: z.uuid(),
    state: z.enum(['OPEN', 'RESOLVED']),
    kind: DisputeKindSchema,
    foundItemId: z.string(),
    itemTitle: z.string(),
    claimId: z.string().nullable(),
    dispatchId: z.string().nullable(),
    raisedBy: z.string(),
    statement: z.string(),
    outcome: z.enum(['upheld', 'rejected']).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    /** Notes and the outcome, oldest first (append-only). */
    history: z.array(HistoryEntrySchema),
  })
  .meta({ id: 'Dispute' });
export type Dispute = z.infer<typeof DisputeSchema>;

export const DisputeListSchema = z
  .object({ disputes: z.array(DisputeSchema) })
  .meta({ id: 'DisputeList' });
export type DisputeList = z.infer<typeof DisputeListSchema>;

export const RaiseDisputeSchema = z
  .object({
    statement: z
      .string()
      .trim()
      .min(10, { error: 'Say why you think the item is yours, in a sentence or two.' })
      .max(1000, { error: 'Keep it under 1000 characters; shorten it.' }),
  })
  .meta({ id: 'RaiseDispute' });
export type RaiseDispute = z.infer<typeof RaiseDisputeSchema>;

export const MyDisputeSchema = z
  .object({ dispute: DisputeSchema.omit({ history: true }).nullable() })
  .meta({ id: 'MyDispute' });

export const DisputeNoteSchema = z
  .object({
    note: z
      .string()
      .trim()
      .min(3, { error: 'Write the note first.' })
      .max(500, { error: 'Keep the note under 500 characters; shorten it.' }),
  })
  .meta({ id: 'DisputeNote' });

export const ResolveDisputeSchema = z
  .object({
    outcome: z.enum(['upheld', 'rejected'], { error: 'Choose whether the dispute is upheld.' }),
    note: z
      .string()
      .trim()
      .min(3, { error: 'Record what was decided and why.' })
      .max(500, { error: 'Keep the note under 500 characters; shorten it.' }),
    /** CC-14: flag the account that received the wrong item. */
    flagRecipient: z.boolean(),
  })
  .meta({ id: 'ResolveDispute' });
export type ResolveDispute = z.infer<typeof ResolveDisputeSchema>;

export const DispatchRecordSchema = z
  .object({
    dispatch: DispatchSchema,
    locked: z.boolean(),
    history: z.array(HistoryEntrySchema),
    amendments: z.array(AmendmentSchema),
    disputes: z.array(DisputeSchema),
  })
  .meta({ id: 'DispatchRecord' });
export type DispatchRecord = z.infer<typeof DispatchRecordSchema>;

// ── Flags (CC-03, CC-14, CC-15, Figma 39:23882) ──────────────────────────────────────────────────

export const FLAG_KINDS = ['no_show_finder', 'failed_verifications', 'wrong_recipient'] as const;
export const FlagSchema = z
  .object({
    userId: z.uuid(),
    name: z.string(),
    kinds: z.array(z.enum(FLAG_KINDS)),
    /** One plain line per reason, e.g. "Repeat no-show: 2 found posts never handed in". */
    reasons: z.array(z.string()),
    since: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'Flag' });
export type Flag = z.infer<typeof FlagSchema>;

export const FlagListSchema = z.object({ flags: z.array(FlagSchema) }).meta({ id: 'FlagList' });
export type FlagList = z.infer<typeof FlagListSchema>;

// ── High-value approvals (CC-08, CC-10, Figma 39:21514) ──────────────────────────────────────────

export const ApprovalSchema = z
  .object({
    claimId: z.string(),
    foundItemId: z.string(),
    itemTitle: z.string(),
    category: z.string(),
    claimantName: z.string(),
    claimantRole: z.string(),
    requestedBy: z.string(),
    requestedAt: z.iso.datetime({ offset: true }),
    approved: z.boolean(),
  })
  .meta({ id: 'Approval' });
export type Approval = z.infer<typeof ApprovalSchema>;

export const ApprovalListSchema = z
  .object({ approvals: z.array(ApprovalSchema) })
  .meta({ id: 'ApprovalList' });
export type ApprovalList = z.infer<typeof ApprovalListSchema>;
