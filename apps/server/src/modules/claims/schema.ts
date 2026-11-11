// Claims (WF-04, FR-11, NF-03). Answers and pickup codes are AES-256-GCM encrypted (FR-06, NF-03):
// only the claimant and desk staff ever see them. Only claimTransition() changes `state`.
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../../platform/auth/schema';
import { tenants } from '../../platform/tenancy/schema';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const claims = pgTable(
  'claims',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    /** CLM-YYMM-NNNNX (ADR-0012). */
    id: text('id').notNull(),
    foundItemId: text('found_item_id').notNull(),
    claimantId: uuid('claimant_id')
      .notNull()
      .references(() => users.id),
    lostReportId: text('lost_report_id'),
    state: text('state').notNull(),
    /** The questions asked, in order: [{ key, question }]. Not secret. */
    questions: jsonb('questions').$type<{ key: string; question: string }[]>().notNull(),
    /** Encrypted JSON [{ key, question, answer }], including answers given after "Ask for more". */
    answersCiphertext: text('answers_ciphertext').notNull(),
    keyVersion: bigint('key_version', { mode: 'number' }).notNull(),
    /** Officer's Pass/Fail per question key. */
    verdicts: jsonb('verdicts').$type<Record<string, 'pass' | 'fail'>>().notNull().default({}),
    moreInfoRequest: text('more_info_request'),
    /** Shown to the claimant with the decision. */
    decisionNote: text('decision_note'),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: ts('decided_at'),
    reviewDueAt: ts('review_due_at').notNull(),
    /** Encrypted 6-digit code, set on approval (WF-04). */
    pickupCodeCiphertext: text('pickup_code_ciphertext'),
    pickupKeyVersion: bigint('pickup_key_version', { mode: 'number' }),
    pickupEndsAt: ts('pickup_ends_at'),
    reminderSentAt: ts('reminder_sent_at'),
    /** CC-11: a lapsed claim may be re-requested once. */
    reRequested: boolean('re_requested').notNull().default(false),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index('claims_item_idx').on(t.tenantId, t.foundItemId),
    index('claims_claimant_idx').on(t.tenantId, t.claimantId, t.state),
    index('claims_state_idx').on(t.tenantId, t.state, t.pickupEndsAt),
  ],
);
