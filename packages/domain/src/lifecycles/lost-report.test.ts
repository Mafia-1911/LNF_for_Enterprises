// Every allowed and every forbidden lost-report transition, for every actor. The expected table is
// written out by hand from the SRS (not derived from the machine), so a change to the machine that
// isn't also made here fails the test.
import { describe, expect, it } from 'vitest';
import { ROLES, type Role } from '../roles';
import { availableEvents, step, type TransitionActor } from './machine';
import {
  LOST_REPORT_EVENTS,
  LOST_REPORT_MAX_RENEWALS,
  LOST_REPORT_OPEN_DAYS,
  LOST_REPORT_STATES,
  lostReportMachine,
  type LostReportEvent,
  type LostReportState,
} from './lost-report';

type Who = Role | 'system';
const OWNERS_AND_DESK: Who[] = ['student', 'visitor', 'desk_officer', 'supervisor'];

const EXPECTED: {
  from: LostReportState | null;
  event: LostReportEvent;
  to: LostReportState;
  who: Who[];
}[] = [
  { from: null, event: 'SUBMIT', to: 'OPEN', who: OWNERS_AND_DESK },
  { from: 'OPEN', event: 'MATCH_FOUND', to: 'POSSIBLE_MATCH', who: ['system'] },
  { from: 'POSSIBLE_MATCH', event: 'CLAIM', to: 'CLAIMED', who: OWNERS_AND_DESK },
  {
    from: 'CLAIMED',
    event: 'RESOLVE',
    to: 'RESOLVED',
    who: ['desk_officer', 'supervisor', 'system'],
  },
  { from: 'OPEN', event: 'EXPIRE', to: 'EXPIRED', who: ['system'] },
  { from: 'OPEN', event: 'RENEW', to: 'OPEN', who: OWNERS_AND_DESK },
  { from: 'EXPIRED', event: 'RENEW', to: 'OPEN', who: OWNERS_AND_DESK },
  { from: 'OPEN', event: 'WITHDRAW', to: 'WITHDRAWN', who: OWNERS_AND_DESK },
  { from: 'POSSIBLE_MATCH', event: 'WITHDRAW', to: 'WITHDRAWN', who: OWNERS_AND_DESK },
  { from: 'CLAIMED', event: 'WITHDRAW', to: 'WITHDRAWN', who: OWNERS_AND_DESK },
];

const actorOf = (who: Who): TransitionActor =>
  who === 'system' ? { kind: 'system' } : { kind: 'user', role: who };
const EVERYONE: Who[] = [...ROLES, 'system'];

const cases = [null, ...LOST_REPORT_STATES].flatMap((from) =>
  LOST_REPORT_EVENTS.flatMap((event) => EVERYONE.map((who) => ({ from, event, who }))),
);

describe('lost report transitions', () => {
  it('covers 7 starting points × 7 events × 6 actors', () => {
    expect(cases).toHaveLength(7 * 7 * 6);
  });

  it.each(cases)('$from --$event--> as $who', ({ from, event, who }) => {
    const rule = EXPECTED.find((r) => r.from === from && r.event === event);
    const result = step(lostReportMachine, from, event, actorOf(who));
    if (!rule) expect(result).toEqual({ ok: false, reason: 'invalid_transition' });
    else if (rule.who.includes(who)) expect(result).toEqual({ ok: true, to: rule.to });
    else expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('never lets the IT admin change a report (no item decisions)', () => {
    for (const from of [null, ...LOST_REPORT_STATES]) {
      expect(availableEvents(lostReportMachine, from, { kind: 'user', role: 'it_admin' })).toEqual(
        [],
      );
    }
  });

  it('has no way out of RESOLVED or WITHDRAWN', () => {
    for (const from of ['RESOLVED', 'WITHDRAWN'] as const) {
      expect(availableEvents(lostReportMachine, from, { kind: 'system' })).toEqual([]);
      expect(
        availableEvents(lostReportMachine, from, { kind: 'user', role: 'supervisor' }),
      ).toEqual([]);
    }
  });

  it('lists what a student can do with an open report', () => {
    expect(availableEvents(lostReportMachine, 'OPEN', { kind: 'user', role: 'student' })).toEqual([
      'RENEW',
      'WITHDRAW',
    ]);
  });

  it('keeps reports open 30 days and allows two renewals (SRS)', () => {
    expect(LOST_REPORT_OPEN_DAYS).toBe(30);
    expect(LOST_REPORT_MAX_RENEWALS).toBe(2);
  });
});
