// A small, explicit state machine: a table of allowed transitions and who may trigger each one.
// `from: null` means "creating a new record".
import type { Role } from '../roles';

/** Who may trigger a transition: listed roles, or only the system (jobs and timers). */
export type Actors = { roles: readonly Role[]; system?: boolean } | { roles?: never; system: true };

export type TransitionRule<S extends string, E extends string> = {
  from: S | null;
  event: E;
  to: S;
  by: Actors;
};

export type Machine<S extends string, E extends string> = {
  name: string;
  states: readonly S[];
  events: readonly E[];
  finalStates: readonly S[];
  transitions: readonly TransitionRule<S, E>[];
};

/** The actor attempting a transition. */
export type TransitionActor = { kind: 'user'; role: Role } | { kind: 'system' };

export type StepResult<S extends string> =
  { ok: true; to: S } | { ok: false; reason: 'invalid_transition' | 'forbidden' };

export function defineMachine<S extends string, E extends string>(
  machine: Machine<S, E>,
): Machine<S, E> {
  const seen = new Set<string>();
  for (const t of machine.transitions) {
    const key = `${t.from ?? '∅'}|${t.event}`;
    if (seen.has(key)) throw new Error(`${machine.name}: duplicate transition ${key}`);
    seen.add(key);
    if (t.from !== null && machine.finalStates.includes(t.from)) {
      throw new Error(`${machine.name}: final state ${t.from} has an outgoing transition`);
    }
  }
  return machine;
}

function allowed(by: Actors, actor: TransitionActor): boolean {
  if (actor.kind === 'system') return by.system === true;
  return (by.roles ?? []).includes(actor.role);
}

/** Checks one step: is `event` allowed from `from`, and may `actor` trigger it? */
export function step<S extends string, E extends string>(
  machine: Machine<S, E>,
  from: S | null,
  event: E,
  actor: TransitionActor,
): StepResult<S> {
  const rule = machine.transitions.find((t) => t.from === from && t.event === event);
  if (!rule) return { ok: false, reason: 'invalid_transition' };
  if (!allowed(rule.by, actor)) return { ok: false, reason: 'forbidden' };
  return { ok: true, to: rule.to };
}

/** Events that `actor` may trigger from `from` (for showing the right buttons). */
export function availableEvents<S extends string, E extends string>(
  machine: Machine<S, E>,
  from: S | null,
  actor: TransitionActor,
): E[] {
  return machine.transitions
    .filter((t) => t.from === from && allowed(t.by, actor))
    .map((t) => t.event);
}
