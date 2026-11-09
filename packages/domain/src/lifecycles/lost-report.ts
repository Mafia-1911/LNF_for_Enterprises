// Lost report lifecycle (SRS lifecycles.lost_report):
//   OPEN -> POSSIBLE_MATCH -> CLAIMED -> RESOLVED
//   OPEN -> EXPIRED (30 days, one-tap renew up to twice)
//   OPEN -> WITHDRAWN (owner found it)
// Additions, so the SRS rules can be expressed as events:
//   (new) -> OPEN by SUBMIT; desk staff may file for a walk-in student (US-10).
//   RENEW keeps an OPEN report open or reopens an EXPIRED one; the 2-renewal cap is a record rule
//   checked by the service (renew_count), not by the table.
//   WITHDRAW is also allowed from POSSIBLE_MATCH and CLAIMED, because CC-16 says withdrawing cancels
//   open claims and alerts.
import { DESK_ROLES, OWNER_ROLES } from '../roles';
import { defineMachine } from './machine';

export const LOST_REPORT_STATES = [
  'OPEN',
  'POSSIBLE_MATCH',
  'CLAIMED',
  'RESOLVED',
  'EXPIRED',
  'WITHDRAWN',
] as const;
export type LostReportState = (typeof LOST_REPORT_STATES)[number];

export const LOST_REPORT_EVENTS = [
  'SUBMIT',
  'MATCH_FOUND',
  'CLAIM',
  'RESOLVE',
  'EXPIRE',
  'RENEW',
  'WITHDRAW',
] as const;
export type LostReportEvent = (typeof LOST_REPORT_EVENTS)[number];

/** Days a report stays open after it is submitted or renewed. */
export const LOST_REPORT_OPEN_DAYS = 30;
/** How many times an owner may renew a report. */
export const LOST_REPORT_MAX_RENEWALS = 2;

const ownersAndDesk = { roles: [...OWNER_ROLES, ...DESK_ROLES] };

export const lostReportMachine = defineMachine<LostReportState, LostReportEvent>({
  name: 'lost_report',
  states: LOST_REPORT_STATES,
  events: LOST_REPORT_EVENTS,
  finalStates: ['RESOLVED', 'WITHDRAWN'],
  transitions: [
    { from: null, event: 'SUBMIT', to: 'OPEN', by: ownersAndDesk },
    { from: 'OPEN', event: 'MATCH_FOUND', to: 'POSSIBLE_MATCH', by: { system: true } },
    { from: 'POSSIBLE_MATCH', event: 'CLAIM', to: 'CLAIMED', by: ownersAndDesk },
    { from: 'CLAIMED', event: 'RESOLVE', to: 'RESOLVED', by: { roles: DESK_ROLES, system: true } },
    { from: 'OPEN', event: 'EXPIRE', to: 'EXPIRED', by: { system: true } },
    { from: 'OPEN', event: 'RENEW', to: 'OPEN', by: ownersAndDesk },
    { from: 'EXPIRED', event: 'RENEW', to: 'OPEN', by: ownersAndDesk },
    { from: 'OPEN', event: 'WITHDRAW', to: 'WITHDRAWN', by: ownersAndDesk },
    { from: 'POSSIBLE_MATCH', event: 'WITHDRAW', to: 'WITHDRAWN', by: ownersAndDesk },
    { from: 'CLAIMED', event: 'WITHDRAW', to: 'WITHDRAWN', by: ownersAndDesk },
  ],
});
