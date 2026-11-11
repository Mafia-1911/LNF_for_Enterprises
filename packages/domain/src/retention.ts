// Retention rules (WF-05, CC-02, NF-09): how long an item stays in custody, which items are
// look-alikes with a shorter period, and how official closures pause the countdown. Also the
// reminder points: the last-chance alert 7 days before an item leaves custody, and the "your report
// expires in 2 days" alert for lost reports.
import { addDays, addDaysToInstant, dhakaDate, type LocalDate } from './calendar';

/** Look-alike items (CC-02): umbrellas, bottles, chargers, keys and calculators (Figma 39:26930). */
const LOOK_ALIKE = new Set(['umbrella', 'bottle', 'charger', 'keys', 'calculator']);

export function isLookAlike(category: string): boolean {
  return LOOK_ALIKE.has(category);
}

export type RetentionPolicy = { days: number; lookAlikeDays: number };

/** SRS defaults: 60 days, 30 for look-alikes. Supervisors change them on the Policies page. */
export const DEFAULT_RETENTION: RetentionPolicy = { days: 60, lookAlikeDays: 30 };

/** "Keep longer" on an expired item adds this many days (US-08). */
export const KEEP_LONGER_DAYS = 30;

/** Owners with similar open reports get a last-chance alert this many days before expiry (WF-05). */
export const LAST_CHANCE_DAYS = 7;

/** Owners are reminded this many days before their lost report expires (Figma 39:7532). */
export const REPORT_EXPIRY_REMINDER_DAYS = 2;

/** Retention days for one item: the look-alike period or the standard one, plus any extension. */
export function retentionDays(category: string, policy: RetentionPolicy, extraDays = 0): number {
  return (isLookAlike(category) ? policy.lookAlikeDays : policy.days) + extraDays;
}

/**
 * When retention ends: `days` calendar days after intake, not counting paused days (closures and
 * semester breaks, NF-09). Each paused Dhaka date after the intake date adds one day. The time of
 * day stays the intake time.
 */
export function retentionEnd(intakeAt: Date, days: number, paused: ReadonlySet<LocalDate>): Date {
  if (!Number.isInteger(days) || days < 0) throw new RangeError('days must be a whole number ≥ 0');
  let date = dhakaDate(intakeAt);
  let left = days;
  let stepped = 0;
  while (left > 0) {
    date = addDays(date, 1);
    stepped += 1;
    if (!paused.has(date)) left -= 1;
  }
  return addDaysToInstant(intakeAt, stepped);
}

/** True once `now` is within `daysBefore` days of `endsAt` but not past it. */
export function isWithinDaysOf(endsAt: Date, now: Date, daysBefore: number): boolean {
  return now < endsAt && now >= addDaysToInstant(endsAt, -daysBefore);
}

/** What a supervisor can decide for an expired item (WF-05). */
export const DISPOSAL_DECISIONS = ['donate', 'dispose', 'transfer'] as const;
export type DisposalDecision = (typeof DISPOSAL_DECISIONS)[number];
