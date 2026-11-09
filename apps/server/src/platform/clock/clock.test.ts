import { describe, expect, it } from 'vitest';
import { createOffsetClock, createTestClock, DAY_MS, HOUR_MS, systemClock } from './index';

describe('clock', () => {
  it('moves a test clock forward and back to its start', () => {
    const clock = createTestClock('2026-11-08T10:39:00Z');
    expect(clock.now().toISOString()).toBe('2026-11-08T10:39:00.000Z');
    clock.advance(HOUR_MS);
    clock.advance(DAY_MS);
    expect(clock.now().toISOString()).toBe('2026-11-09T11:39:00.000Z');
    expect(clock.offsetMs()).toBe(25 * HOUR_MS);
    clock.reset();
    expect(clock.now().toISOString()).toBe('2026-11-08T10:39:00.000Z');
  });

  it('only moves forward', () => {
    const clock = createOffsetClock(systemClock);
    expect(() => clock.advance(-1)).toThrow('A clock can only move forward.');
    expect(() => clock.advance(Number.NaN)).toThrow(RangeError);
  });

  it('follows real time plus the offset', () => {
    const clock = createOffsetClock();
    const before = systemClock.now().getTime();
    clock.advance(DAY_MS);
    expect(clock.now().getTime()).toBeGreaterThanOrEqual(before + DAY_MS);
  });
});
