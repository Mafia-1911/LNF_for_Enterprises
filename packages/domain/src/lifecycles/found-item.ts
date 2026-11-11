// Found item lifecycle (SRS lifecycles.found_item). Used from phase 1; defined now so every module
// shares one table.
//   REPORTED_BY_FINDER -> IN_CUSTODY | NOT_RECEIVED
//   IN_CUSTODY -> CLAIM_PENDING -> READY_FOR_PICKUP -> DISPATCHED
//   CLAIM_PENDING -> IN_CUSTODY (all claims rejected)
//   READY_FOR_PICKUP -> IN_CUSTODY (pickup window lapsed)
//   IN_CUSTODY -> EXPIRED -> DONATED | DISPOSED | TRANSFERRED
//   EXPIRED -> IN_CUSTODY by KEEP: a supervisor keeps an expired item longer (Figma 39:21973).
// Additions: creation by a finder (POST) or at the desk (LOG_INTAKE); NOT_RECEIVED can be reopened
// ("Final, can be reopened"); restricted items go IN_CUSTODY -> TRANSFERRED the same day (CC-12);
// records created in error become VOID (identifiers rule).
import { DESK_ROLES } from '../roles';
import { defineMachine } from './machine';

export const FOUND_ITEM_STATES = [
  'REPORTED_BY_FINDER',
  'IN_CUSTODY',
  'CLAIM_PENDING',
  'READY_FOR_PICKUP',
  'DISPATCHED',
  'NOT_RECEIVED',
  'EXPIRED',
  'DONATED',
  'DISPOSED',
  'TRANSFERRED',
  'VOID',
] as const;
export type FoundItemState = (typeof FOUND_ITEM_STATES)[number];

export const FOUND_ITEM_EVENTS = [
  'POST',
  'LOG_INTAKE',
  'RECEIVE_AT_DESK',
  'MARK_NOT_RECEIVED',
  'REOPEN',
  'CLAIM_SUBMITTED',
  'APPROVE_CLAIM',
  'ALL_CLAIMS_REJECTED',
  'HAND_OVER',
  'PICKUP_LAPSED',
  'EXPIRE',
  'DONATE',
  'DISPOSE',
  'TRANSFER',
  'KEEP',
  'VOID',
] as const;
export type FoundItemEvent = (typeof FOUND_ITEM_EVENTS)[number];

const desk = { roles: DESK_ROLES };
const supervisor = { roles: ['supervisor'] as const };

export const foundItemMachine = defineMachine<FoundItemState, FoundItemEvent>({
  name: 'found_item',
  states: FOUND_ITEM_STATES,
  events: FOUND_ITEM_EVENTS,
  // NOT_RECEIVED is final in the SRS but "can be reopened", so it is not listed here.
  finalStates: ['DISPATCHED', 'DONATED', 'DISPOSED', 'TRANSFERRED', 'VOID'],
  transitions: [
    {
      from: null,
      event: 'POST',
      to: 'REPORTED_BY_FINDER',
      by: { roles: ['student', ...DESK_ROLES] },
    },
    { from: null, event: 'LOG_INTAKE', to: 'IN_CUSTODY', by: desk },
    { from: 'REPORTED_BY_FINDER', event: 'RECEIVE_AT_DESK', to: 'IN_CUSTODY', by: desk },
    {
      from: 'REPORTED_BY_FINDER',
      event: 'MARK_NOT_RECEIVED',
      to: 'NOT_RECEIVED',
      by: { system: true },
    },
    { from: 'REPORTED_BY_FINDER', event: 'VOID', to: 'VOID', by: desk },
    { from: 'NOT_RECEIVED', event: 'REOPEN', to: 'REPORTED_BY_FINDER', by: desk },
    { from: 'IN_CUSTODY', event: 'CLAIM_SUBMITTED', to: 'CLAIM_PENDING', by: { system: true } },
    { from: 'IN_CUSTODY', event: 'EXPIRE', to: 'EXPIRED', by: { system: true } },
    { from: 'IN_CUSTODY', event: 'TRANSFER', to: 'TRANSFERRED', by: desk },
    { from: 'IN_CUSTODY', event: 'VOID', to: 'VOID', by: supervisor },
    { from: 'CLAIM_PENDING', event: 'APPROVE_CLAIM', to: 'READY_FOR_PICKUP', by: desk },
    {
      from: 'CLAIM_PENDING',
      event: 'ALL_CLAIMS_REJECTED',
      to: 'IN_CUSTODY',
      by: { roles: DESK_ROLES, system: true },
    },
    { from: 'READY_FOR_PICKUP', event: 'HAND_OVER', to: 'DISPATCHED', by: desk },
    { from: 'READY_FOR_PICKUP', event: 'PICKUP_LAPSED', to: 'IN_CUSTODY', by: { system: true } },
    { from: 'EXPIRED', event: 'DONATE', to: 'DONATED', by: supervisor },
    { from: 'EXPIRED', event: 'DISPOSE', to: 'DISPOSED', by: supervisor },
    { from: 'EXPIRED', event: 'TRANSFER', to: 'TRANSFERRED', by: supervisor },
    { from: 'EXPIRED', event: 'KEEP', to: 'IN_CUSTODY', by: supervisor },
  ],
});
