import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  addDaysToInstant,
  createWorkingCalendar,
  dhakaDate,
  dhakaParts,
  dhakaTime,
  dhakaYearMonth,
  isWeekend,
  weekday,
} from './calendar';

describe('Dhaka time (UTC+6, no daylight saving)', () => {
  it('converts an instant near midnight to the Dhaka date', () => {
    // 2026-10-31T18:30Z is 1 Nov 00:30 in Dhaka.
    const instant = new Date('2026-10-31T18:30:00Z');
    expect(dhakaDate(instant)).toBe('2026-11-01');
    expect(dhakaYearMonth(instant)).toEqual({ year: 26, month: 11 });
    expect(dhakaTime(instant)).toBe('00:30');
    expect(dhakaParts(instant)).toEqual({ year: 2026, month: 11, day: 1, hour: 0, minute: 30 });
  });

  it('uses the previous month until Dhaka midnight', () => {
    const instant = new Date('2026-10-31T17:59:00Z');
    expect(dhakaYearMonth(instant)).toEqual({ year: 26, month: 10 });
    expect(dhakaTime(instant)).toBe('23:59');
  });

  it('formats single-digit hours and minutes with a leading zero', () => {
    expect(dhakaTime(new Date('2026-11-08T03:05:00Z'))).toBe('09:05');
  });

  it('adds exact days to an instant', () => {
    expect(addDaysToInstant(new Date('2026-11-08T10:00:00Z'), 30).toISOString()).toBe(
      '2026-12-08T10:00:00.000Z',
    );
  });
});

describe('local dates', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('rejects malformed dates', () => {
    expect(() => addDays('8 Nov 2026', 1)).toThrow(RangeError);
    expect(() => weekday('2026-11-8')).toThrow(RangeError);
  });

  it('knows the Bangladesh weekend is Friday and Saturday', () => {
    // 2026-11-06 is a Friday.
    expect(weekday('2026-11-06')).toBe(5);
    expect(isWeekend('2026-11-06')).toBe(true);
    expect(isWeekend('2026-11-07')).toBe(true);
    expect(isWeekend('2026-11-08')).toBe(false);
    expect(isWeekend('2026-11-05')).toBe(false);
  });
});

describe('working calendar', () => {
  const cal = createWorkingCalendar(['2026-12-16']); // Victory Day, a Wednesday

  it('counts Sunday–Thursday as working days, minus holidays', () => {
    expect(cal.isWorkingDay('2026-11-08')).toBe(true); // Sunday
    expect(cal.isWorkingDay('2026-11-12')).toBe(true); // Thursday
    expect(cal.isWorkingDay('2026-11-13')).toBe(false); // Friday
    expect(cal.isWorkingDay('2026-12-16')).toBe(false); // holiday
  });

  it('adds working days, skipping weekends and holidays', () => {
    expect(cal.addWorkingDays('2026-11-12', 1)).toBe('2026-11-15'); // Thu + 1 → Sun
    expect(cal.addWorkingDays('2026-12-15', 1)).toBe('2026-12-17'); // skips the holiday
    expect(cal.addWorkingDays('2026-11-08', 3)).toBe('2026-11-11');
  });

  it('starts from the next working day when the start is closed', () => {
    expect(cal.addWorkingDays('2026-11-13', 0)).toBe('2026-11-15');
    expect(cal.addWorkingDays('2026-11-13', 2)).toBe('2026-11-17');
  });

  it('rejects negative or fractional counts', () => {
    expect(() => cal.addWorkingDays('2026-11-08', -1)).toThrow(RangeError);
    expect(() => cal.addWorkingDays('2026-11-08', 1.5)).toThrow(RangeError);
  });

  it('counts working days between two dates', () => {
    expect(cal.workingDaysBetween('2026-11-12', '2026-11-15')).toBe(1);
    expect(cal.workingDaysBetween('2026-11-08', '2026-11-08')).toBe(0);
    expect(cal.workingDaysBetween('2026-12-13', '2026-12-17')).toBe(3);
  });

  it('agrees with itself: n working days later is exactly n working days between', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 30 }),
        (offset, n) => {
          const start = cal.addWorkingDays(addDays('2026-01-01', offset), 0);
          const end = cal.addWorkingDays(start, n);
          expect(cal.isWorkingDay(end)).toBe(true);
          expect(cal.workingDaysBetween(start, end)).toBe(n);
        },
      ),
    );
  });
});
