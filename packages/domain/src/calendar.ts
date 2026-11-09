// Calendar rules. Instants are stored in UTC; anything shown to people or used in IDs is computed
// in Asia/Dhaka. Working days are Sunday–Thursday, minus holidays and closures.

export const TIME_ZONE = 'Asia/Dhaka';

/** A calendar date in Dhaka, formatted YYYY-MM-DD. */
export type LocalDate = string;

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export type DhakaParts = { year: number; month: number; day: number; hour: number; minute: number };

export function dhakaParts(instant: Date): DhakaParts {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(instant).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts['year']),
    month: Number(parts['month']),
    day: Number(parts['day']),
    hour: Number(parts['hour']),
    minute: Number(parts['minute']),
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** The Dhaka calendar date of an instant. */
export function dhakaDate(instant: Date): LocalDate {
  const p = dhakaParts(instant);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Year (two digits) and month of an instant in Dhaka, as used in record IDs. */
export function dhakaYearMonth(instant: Date): { year: number; month: number } {
  const p = dhakaParts(instant);
  return { year: p.year % 100, month: p.month };
}

/** "HH:MM" in Dhaka, e.g. for "Draft saved 16:39". */
export function dhakaTime(instant: Date): string {
  const p = dhakaParts(instant);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

function parseLocalDate(date: LocalDate): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatLocalDate(utcMidnight: Date): LocalDate {
  return `${utcMidnight.getUTCFullYear()}-${pad2(utcMidnight.getUTCMonth() + 1)}-${pad2(utcMidnight.getUTCDate())}`;
}

/** Adds whole calendar days to a local date. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const d = parseLocalDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return formatLocalDate(d);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: LocalDate): number {
  return parseLocalDate(date).getUTCDay();
}

/** Bangladesh weekend: Friday and Saturday. */
export function isWeekend(date: LocalDate): boolean {
  const d = weekday(date);
  return d === 5 || d === 6;
}

export type WorkingCalendar = {
  isWorkingDay(date: LocalDate): boolean;
  /** The date `n` working days after `date` (n ≥ 0). With n = 0, the next working day on or after `date`. */
  addWorkingDays(date: LocalDate, n: number): LocalDate;
  /** Working days strictly after `from` up to and including `to`. */
  workingDaysBetween(from: LocalDate, to: LocalDate): number;
};

/** A calendar for one tenant: Sunday–Thursday, minus the given holidays and closures. */
export function createWorkingCalendar(holidays: Iterable<LocalDate>): WorkingCalendar {
  const closed = new Set(holidays);
  const isWorkingDay = (date: LocalDate) => !isWeekend(date) && !closed.has(date);
  return {
    isWorkingDay,
    addWorkingDays(date, n) {
      if (!Number.isInteger(n) || n < 0) throw new RangeError('n must be a whole number ≥ 0');
      let current = date;
      while (!isWorkingDay(current)) current = addDays(current, 1);
      let remaining = n;
      while (remaining > 0) {
        current = addDays(current, 1);
        if (isWorkingDay(current)) remaining -= 1;
      }
      return current;
    },
    workingDaysBetween(from, to) {
      let count = 0;
      for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isWorkingDay(d)) count += 1;
      return count;
    },
  };
}

/** Adds a number of days to an instant (exact 24 h steps; Dhaka has no daylight saving). */
export function addDaysToInstant(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * 24 * 60 * 60 * 1000);
}
