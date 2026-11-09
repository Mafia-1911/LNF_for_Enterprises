// The only source of "now" on the server (plan §3.4). Lint bans Date.now() and new Date()
// everywhere else. Development and staging use an adjustable clock that the prototype toolbar
// can move forward ("+1 h", "+1 day"); production uses the system clock.

export interface Clock {
  now(): Date;
}

/** A clock that can be moved, for time travel in dev/staging and for tests. */
export interface AdjustableClock extends Clock {
  /** Milliseconds this clock is ahead of the real time it is based on. */
  offsetMs(): number;
  advance(ms: number): void;
  reset(): void;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Real time plus an offset. Used when dev tools are on. */
export function createOffsetClock(base: Clock = systemClock): AdjustableClock {
  let offset = 0;
  return {
    now: () => new Date(base.now().getTime() + offset),
    offsetMs: () => offset,
    advance(ms) {
      if (!Number.isFinite(ms) || ms < 0) throw new RangeError('A clock can only move forward.');
      offset += ms;
    },
    reset() {
      offset = 0;
    },
  };
}

/** A clock frozen at `start` until moved. For tests. */
export function createTestClock(start: Date | string): AdjustableClock {
  const startMs = new Date(start).getTime();
  return createOffsetClock({ now: () => new Date(startMs) });
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
