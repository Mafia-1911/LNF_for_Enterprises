// Dispute lifecycle (WF-06, CC-01, CC-14). Raised by a losing claimant within 7 days, an owner who
// got the wrong item, or desk staff on someone's behalf. The supervisor resolves it; notes and the
// outcome are appended to the audit trail, never edited.
//   (new) -> OPEN by RAISE
//   OPEN -> RESOLVED by RESOLVE (supervisor)
import { DESK_ROLES, OWNER_ROLES } from '../roles';
import { defineMachine } from './machine';

export const DISPUTE_STATES = ['OPEN', 'RESOLVED'] as const;
export type DisputeState = (typeof DISPUTE_STATES)[number];

export const DISPUTE_EVENTS = ['RAISE', 'RESOLVE'] as const;
export type DisputeEvent = (typeof DISPUTE_EVENTS)[number];

/** A losing claimant may dispute within this many days (CC-01). */
export const DISPUTE_WINDOW_DAYS = 7;

export const disputeMachine = defineMachine<DisputeState, DisputeEvent>({
  name: 'dispute',
  states: DISPUTE_STATES,
  events: DISPUTE_EVENTS,
  finalStates: ['RESOLVED'],
  transitions: [
    { from: null, event: 'RAISE', to: 'OPEN', by: { roles: [...OWNER_ROLES, ...DESK_ROLES] } },
    { from: 'OPEN', event: 'RESOLVE', to: 'RESOLVED', by: { roles: ['supervisor'] } },
  ],
});
