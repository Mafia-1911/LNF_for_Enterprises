import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addDays, dhakaDate } from './calendar';
import { CATEGORY_CODES } from './catalog';
import {
  DEFAULT_RETENTION,
  DISPOSAL_DECISIONS,
  isLookAlike,
  isWithinDaysOf,
  KEEP_LONGER_DAYS,
  LAST_CHANCE_DAYS,
  REPORT_EXPIRY_REMINDER_DAYS,
  retentionDays,
  retentionEnd,
} from './retention';

const DAY = 86_400_000;
// 10:30 Dhaka on 8 Nov 2026.
const intake = new Date('2026-11-08T04:30:00.000Z');

describe('look-alikes (CC-02)', () => {
  it('treats umbrellas, bottles, chargers, keys and calculators as look-alikes', () => {
    expect(CATEGORY_CODES.filter((c) => isLookAlike(c))).toEqual([
      'keys',
      'bottle',
      'umbrella',
      'charger',
      'calculator',
    ]);
  });

  it('gives look-alikes the shorter period, plus any extension', () => {
    expect(retentionDays('umbrella', DEFAULT_RETENTION)).toBe(30);
    expect(retentionDays('laptop', DEFAULT_RETENTION)).toBe(60);
    expect(retentionDays('laptop', DEFAULT_RETENTION, KEEP_LONGER_DAYS)).toBe(90);
    expect(retentionDays('keys', { days: 45, lookAlikeDays: 10 }, 5)).toBe(15);
  });
});

describe('retentionEnd', () => {
  it('counts calendar days from intake and keeps the time of day', () => {
    expect(retentionEnd(intake, 60, new Set())).toEqual(new Date(intake.getTime() + 60 * DAY));
    expect(retentionEnd(intake, 0, new Set())).toEqual(intake);
  });

  it('adds one day for every paused date after the intake date (NF-09)', () => {
    const closure = new Set(['2026-11-10', '2026-11-11', '2026-11-12']);
    expect(retentionEnd(intake, 5, closure)).toEqual(new Date(intake.getTime() + 8 * DAY));
    // A pause on the intake date itself doesn't count: the countdown starts the next day.
    expect(retentionEnd(intake, 5, new Set(['2026-11-08']))).toEqual(
      new Date(intake.getTime() + 5 * DAY),
    );
    // A pause after the end changes nothing.
    expect(retentionEnd(intake, 2, new Set(['2026-11-11']))).toEqual(
      new Date(intake.getTime() + 2 * DAY),
    );
  });

  it('rejects a negative or fractional period', () => {
    expect(() => retentionEnd(intake, -1, new Set())).toThrow(RangeError);
    expect(() => retentionEnd(intake, 1.5, new Set())).toThrow(RangeError);
  });

  it('never ends earlier because of pauses, and pauses add exactly their days (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 120 }),
        fc.uniqueArray(fc.integer({ min: 1, max: 200 }), { maxLength: 30 }),
        (days, offsets) => {
          const start = dhakaDate(intake);
          const paused = new Set(offsets.map((o) => addDays(start, o)));
          const end = retentionEnd(intake, days, paused);
          const plain = retentionEnd(intake, days, new Set());
          const extra = Math.round((end.getTime() - plain.getTime()) / DAY);
          const endDate = dhakaDate(end);
          const pausedInside = [...paused].filter((d) => d > start && d <= endDate).length;
          return extra >= 0 && extra === pausedInside && !paused.has(endDate);
        },
      ),
    );
  });
});

describe('reminder points', () => {
  const ends = new Date(intake.getTime() + 30 * DAY);

  it('is due from exactly N days before the end until the end', () => {
    expect(isWithinDaysOf(ends, new Date(ends.getTime() - 7 * DAY), LAST_CHANCE_DAYS)).toBe(true);
    expect(isWithinDaysOf(ends, new Date(ends.getTime() - 7 * DAY - 1), LAST_CHANCE_DAYS)).toBe(
      false,
    );
    expect(isWithinDaysOf(ends, new Date(ends.getTime() - 1), LAST_CHANCE_DAYS)).toBe(true);
    expect(isWithinDaysOf(ends, ends, LAST_CHANCE_DAYS)).toBe(false);
    expect(isWithinDaysOf(ends, new Date(ends.getTime() - DAY), REPORT_EXPIRY_REMINDER_DAYS)).toBe(
      true,
    );
    expect(
      isWithinDaysOf(ends, new Date(ends.getTime() - 3 * DAY), REPORT_EXPIRY_REMINDER_DAYS),
    ).toBe(false);
  });

  it('lists the three disposal decisions', () => {
    expect(DISPOSAL_DECISIONS).toEqual(['donate', 'dispose', 'transfer']);
    expect(LAST_CHANCE_DAYS).toBe(7);
    expect(REPORT_EXPIRY_REMINDER_DAYS).toBe(2);
    expect(KEEP_LONGER_DAYS).toBe(30);
  });
});
