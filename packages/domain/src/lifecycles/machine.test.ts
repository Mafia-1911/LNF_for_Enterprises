import { describe, expect, it } from 'vitest';
import { ROLES } from '../roles';
import { claimMachine, CLAIM_EVENTS, CLAIM_STATES, MAX_ACTIVE_CLAIMS } from './claim';
import { disputeMachine, DISPUTE_WINDOW_DAYS } from './dispute';
import { foundItemMachine, FOUND_ITEM_EVENTS, FOUND_ITEM_STATES } from './found-item';
import { availableEvents, defineMachine, step, type Machine } from './machine';

type S = 'A' | 'B' | 'C';
type E = 'GO' | 'STOP';

describe('defineMachine', () => {
  it('rejects duplicate transitions', () => {
    expect(() =>
      defineMachine<S, E>({
        name: 'dup',
        states: ['A', 'B', 'C'],
        events: ['GO', 'STOP'],
        finalStates: [],
        transitions: [
          { from: 'A', event: 'GO', to: 'B', by: { system: true } },
          { from: 'A', event: 'GO', to: 'C', by: { system: true } },
        ],
      }),
    ).toThrow('dup: duplicate transition A|GO');
  });

  it('rejects duplicate creation transitions', () => {
    expect(() =>
      defineMachine<S, E>({
        name: 'dup-new',
        states: ['A', 'B', 'C'],
        events: ['GO', 'STOP'],
        finalStates: [],
        transitions: [
          { from: null, event: 'GO', to: 'A', by: { system: true } },
          { from: null, event: 'GO', to: 'B', by: { system: true } },
        ],
      }),
    ).toThrow('dup-new: duplicate transition ∅|GO');
  });

  it('rejects transitions out of a final state', () => {
    expect(() =>
      defineMachine<S, E>({
        name: 'final',
        states: ['A', 'B', 'C'],
        events: ['GO', 'STOP'],
        finalStates: ['C'],
        transitions: [{ from: 'C', event: 'GO', to: 'A', by: { system: true } }],
      }),
    ).toThrow('final: final state C has an outgoing transition');
  });

  it('allows the same event from different states', () => {
    const m = defineMachine<S, E>({
      name: 'ok',
      states: ['A', 'B', 'C'],
      events: ['GO', 'STOP'],
      finalStates: ['C'],
      transitions: [
        { from: 'A', event: 'GO', to: 'B', by: { roles: ['student'] } },
        { from: 'B', event: 'GO', to: 'C', by: { roles: ['student'], system: true } },
      ],
    });
    expect(step(m, 'A', 'GO', { kind: 'user', role: 'student' })).toEqual({ ok: true, to: 'B' });
    expect(step(m, 'A', 'GO', { kind: 'system' })).toEqual({ ok: false, reason: 'forbidden' });
    expect(step(m, 'B', 'GO', { kind: 'system' })).toEqual({ ok: true, to: 'C' });
    expect(step(m, 'C', 'GO', { kind: 'system' })).toEqual({
      ok: false,
      reason: 'invalid_transition',
    });
    expect(availableEvents(m, 'B', { kind: 'system' })).toEqual(['GO']);
    expect(availableEvents(m, 'A', { kind: 'system' })).toEqual([]);
  });
});

function checkWellFormed(m: Machine<string, string>) {
  for (const t of m.transitions) {
    expect(m.events).toContain(t.event);
    expect(m.states).toContain(t.to);
    if (t.from !== null) expect(m.states).toContain(t.from);
  }
  // Every non-final state can be left by someone, and every state can be reached.
  for (const s of m.states) {
    if (!m.finalStates.includes(s)) expect(m.transitions.some((t) => t.from === s)).toBe(true);
    expect(m.transitions.some((t) => t.to === s)).toBe(true);
  }
}

describe('found item lifecycle (SRS)', () => {
  it('is well formed', () => checkWellFormed(foundItemMachine));

  it.each([
    ['REPORTED_BY_FINDER', 'RECEIVE_AT_DESK', 'desk_officer', 'IN_CUSTODY'],
    ['REPORTED_BY_FINDER', 'MARK_NOT_RECEIVED', 'system', 'NOT_RECEIVED'],
    ['IN_CUSTODY', 'CLAIM_SUBMITTED', 'system', 'CLAIM_PENDING'],
    ['CLAIM_PENDING', 'APPROVE_CLAIM', 'supervisor', 'READY_FOR_PICKUP'],
    ['READY_FOR_PICKUP', 'HAND_OVER', 'desk_officer', 'DISPATCHED'],
    ['CLAIM_PENDING', 'ALL_CLAIMS_REJECTED', 'desk_officer', 'IN_CUSTODY'],
    ['READY_FOR_PICKUP', 'PICKUP_LAPSED', 'system', 'IN_CUSTODY'],
    ['IN_CUSTODY', 'EXPIRE', 'system', 'EXPIRED'],
    ['EXPIRED', 'DONATE', 'supervisor', 'DONATED'],
    ['EXPIRED', 'DISPOSE', 'supervisor', 'DISPOSED'],
    ['EXPIRED', 'TRANSFER', 'supervisor', 'TRANSFERRED'],
    ['EXPIRED', 'KEEP', 'supervisor', 'IN_CUSTODY'],
  ] as const)('%s --%s--> as %s gives %s', (from, event, who, to) => {
    const actor =
      who === 'system' ? ({ kind: 'system' } as const) : ({ kind: 'user', role: who } as const);
    expect(step(foundItemMachine, from, event, actor)).toEqual({ ok: true, to });
  });

  it('only supervisors approve disposal or keep an expired item longer (US-08)', () => {
    for (const role of ROLES.filter((r) => r !== 'supervisor')) {
      for (const event of ['DISPOSE', 'DONATE', 'KEEP'] as const)
        expect(step(foundItemMachine, 'EXPIRED', event, { kind: 'user', role })).toEqual({
          ok: false,
          reason: 'forbidden',
        });
    }
  });

  it('lets a student post a found item but not log desk intake', () => {
    expect(step(foundItemMachine, null, 'POST', { kind: 'user', role: 'student' })).toEqual({
      ok: true,
      to: 'REPORTED_BY_FINDER',
    });
    expect(step(foundItemMachine, null, 'LOG_INTAKE', { kind: 'user', role: 'student' })).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(step(foundItemMachine, null, 'POST', { kind: 'user', role: 'visitor' })).toEqual({
      ok: false,
      reason: 'forbidden',
    });
  });

  it('keeps final states final', () => {
    for (const s of ['DISPATCHED', 'DONATED', 'DISPOSED', 'TRANSFERRED', 'VOID'] as const) {
      for (const e of FOUND_ITEM_EVENTS) {
        expect(step(foundItemMachine, s, e, { kind: 'system' }).ok).toBe(false);
      }
    }
    expect(FOUND_ITEM_STATES).toHaveLength(11);
  });
});

describe('claim lifecycle', () => {
  it('is well formed', () => checkWellFormed(claimMachine));

  it('lets an owner re-request a lapsed pickup once the window passes (CC-11)', () => {
    expect(step(claimMachine, 'APPROVED', 'LAPSE', { kind: 'system' })).toEqual({
      ok: true,
      to: 'LAPSED',
    });
    expect(step(claimMachine, 'LAPSED', 'RE_REQUEST', { kind: 'user', role: 'visitor' })).toEqual({
      ok: true,
      to: 'SUBMITTED',
    });
  });

  it('only desk staff decide claims', () => {
    for (const event of ['APPROVE', 'REJECT', 'ASK_FOR_MORE'] as const) {
      expect(step(claimMachine, 'SUBMITTED', event, { kind: 'user', role: 'student' })).toEqual({
        ok: false,
        reason: 'forbidden',
      });
      expect(step(claimMachine, 'SUBMITTED', event, { kind: 'user', role: 'it_admin' })).toEqual({
        ok: false,
        reason: 'forbidden',
      });
      expect(
        step(claimMachine, 'SUBMITTED', event, { kind: 'user', role: 'desk_officer' }).ok,
      ).toBe(true);
    }
  });

  it('caps active claims at 3 (FR-11)', () => {
    expect(MAX_ACTIVE_CLAIMS).toBe(3);
    expect(CLAIM_STATES).toHaveLength(8);
    expect(CLAIM_EVENTS).toHaveLength(10);
  });
});

describe('dispute lifecycle (WF-06)', () => {
  it('is well formed', () => checkWellFormed(disputeMachine));

  it('lets owners and desk staff raise, and only supervisors resolve', () => {
    for (const role of ['student', 'visitor', 'desk_officer', 'supervisor'] as const)
      expect(step(disputeMachine, null, 'RAISE', { kind: 'user', role })).toEqual({
        ok: true,
        to: 'OPEN',
      });
    expect(step(disputeMachine, null, 'RAISE', { kind: 'user', role: 'it_admin' }).ok).toBe(false);
    for (const role of ROLES.filter((r) => r !== 'supervisor'))
      expect(step(disputeMachine, 'OPEN', 'RESOLVE', { kind: 'user', role }).ok).toBe(false);
    expect(step(disputeMachine, 'OPEN', 'RESOLVE', { kind: 'user', role: 'supervisor' })).toEqual({
      ok: true,
      to: 'RESOLVED',
    });
    expect(step(disputeMachine, 'RESOLVED', 'RESOLVE', { kind: 'system' }).ok).toBe(false);
    expect(DISPUTE_WINDOW_DAYS).toBe(7);
  });
});
