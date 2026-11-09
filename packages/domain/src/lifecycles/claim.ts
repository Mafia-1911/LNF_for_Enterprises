// Claim lifecycle. The SRS describes claims in WF-04, FR-11, CC-01, CC-11 and CC-15 but gives no
// state list, so this table is derived from those rules:
//   SUBMITTED -> APPROVED | REJECTED | MORE_INFO_REQUESTED          (officer review, WF-04)
//   MORE_INFO_REQUESTED -> SUBMITTED                                  (claimant answers)
//   APPROVED -> COLLECTED (handover) | LAPSED (pickup window missed, CC-11)
//   LAPSED -> SUBMITTED                                               (owner may re-request once, CC-11)
//   SUBMITTED | MORE_INFO_REQUESTED -> WITHDRAWN (claimant) | CANCELLED (system: item went to a
//   verified owner, CC-01, or the lost report was withdrawn, CC-16)
import { DESK_ROLES, OWNER_ROLES } from '../roles';
import { defineMachine } from './machine';

export const CLAIM_STATES = [
  'SUBMITTED',
  'MORE_INFO_REQUESTED',
  'APPROVED',
  'REJECTED',
  'COLLECTED',
  'LAPSED',
  'WITHDRAWN',
  'CANCELLED',
] as const;
export type ClaimState = (typeof CLAIM_STATES)[number];

export const CLAIM_EVENTS = [
  'SUBMIT',
  'ASK_FOR_MORE',
  'PROVIDE_MORE',
  'APPROVE',
  'REJECT',
  'HAND_OVER',
  'LAPSE',
  'RE_REQUEST',
  'WITHDRAW',
  'CANCEL',
] as const;
export type ClaimEvent = (typeof CLAIM_EVENTS)[number];

/** Most claims a person may have open at once (FR-11, CC-15). */
export const MAX_ACTIVE_CLAIMS = 3;

const ownersAndDesk = { roles: [...OWNER_ROLES, ...DESK_ROLES] };
const desk = { roles: DESK_ROLES };

export const claimMachine = defineMachine<ClaimState, ClaimEvent>({
  name: 'claim',
  states: CLAIM_STATES,
  events: CLAIM_EVENTS,
  finalStates: ['REJECTED', 'COLLECTED', 'WITHDRAWN', 'CANCELLED'],
  transitions: [
    { from: null, event: 'SUBMIT', to: 'SUBMITTED', by: ownersAndDesk },
    { from: 'SUBMITTED', event: 'ASK_FOR_MORE', to: 'MORE_INFO_REQUESTED', by: desk },
    { from: 'SUBMITTED', event: 'APPROVE', to: 'APPROVED', by: desk },
    { from: 'SUBMITTED', event: 'REJECT', to: 'REJECTED', by: desk },
    { from: 'SUBMITTED', event: 'WITHDRAW', to: 'WITHDRAWN', by: ownersAndDesk },
    { from: 'SUBMITTED', event: 'CANCEL', to: 'CANCELLED', by: { system: true } },
    { from: 'MORE_INFO_REQUESTED', event: 'PROVIDE_MORE', to: 'SUBMITTED', by: ownersAndDesk },
    { from: 'MORE_INFO_REQUESTED', event: 'REJECT', to: 'REJECTED', by: desk },
    { from: 'MORE_INFO_REQUESTED', event: 'WITHDRAW', to: 'WITHDRAWN', by: ownersAndDesk },
    { from: 'MORE_INFO_REQUESTED', event: 'CANCEL', to: 'CANCELLED', by: { system: true } },
    { from: 'APPROVED', event: 'HAND_OVER', to: 'COLLECTED', by: desk },
    { from: 'APPROVED', event: 'LAPSE', to: 'LAPSED', by: { system: true } },
    { from: 'LAPSED', event: 'RE_REQUEST', to: 'SUBMITTED', by: ownersAndDesk },
  ],
});
