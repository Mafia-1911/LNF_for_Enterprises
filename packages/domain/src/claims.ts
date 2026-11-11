// Claim rules (WF-04, FR-11, NF-03, CC-07, CC-08, CC-15): the questions an owner answers, which items
// need a second check at handover, and the review and pickup deadlines in working days.
import { dhakaDate, type WorkingCalendar } from './calendar';

/** The question asked for each private-detail tick recorded at intake (Figma 39:15356). */
export const CLAIM_QUESTION: Record<string, string> = {
  stickers_engraving: 'Are there stickers or engraving? Describe them.',
  marks: 'Describe any scratches, dents or marks.',
  serial_recorded: 'What are the last 4 characters of the serial number?',
  in_case: 'Was it in a sleeve or bag? Describe it.',
  lock_screen: 'What is on the lock screen?',
  contents_listed: 'What was inside?',
  name_tag: 'Describe the keychain or name tag.',
  cards_inside: 'Which cards were inside?',
  amount_counted: 'How much money was there, exactly?',
  number_recorded: 'What are the last 4 digits of the number on it?',
  name_on_it: 'Whose name is printed on it?',
  key_count: 'How many keys are there, and what else is on the ring?',
  name_inside: 'What is written inside?',
  size_label: 'What size or brand label does it have?',
};

const GENERIC = [
  'Describe something about it that is not in the public description.',
  'Where and when did you last have it?',
];

export type ClaimQuestion = { key: string; question: string };

/** 2–3 questions built from the ticked private details, topped up with general ones (WF-04). */
export function claimQuestions(ticks: readonly string[]): ClaimQuestion[] {
  const fromTicks = ticks
    .flatMap((t) => {
      const question = CLAIM_QUESTION[t];
      return question ? [{ key: t, question }] : [];
    })
    .slice(0, 3);
  const generic = GENERIC.map((q, i) => ({ key: `general_${i + 1}`, question: q }));
  return [...fromTicks, ...generic].slice(0, Math.max(2, Math.min(3, fromTicks.length + 1)));
}

/** Items that need a second check at handover: device unlock, serial or IMEI, or a supervisor (CC-08). */
const HIGH_VALUE = new Set([
  'phone',
  'laptop',
  'tablet',
  'cash',
  'watch',
  'jewellery',
  'bank_card',
]);
export function isHighValue(category: string): boolean {
  return HIGH_VALUE.has(category);
}

export const SECOND_CHECKS = [
  'device_unlocked',
  'serial_matched',
  'cash_recounted',
  'supervisor_approved',
] as const;
export type SecondCheck = (typeof SECOND_CHECKS)[number];

/** Pickup codes are 6 digits (WF-04). */
export function isPickupCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

/** 5 p.m. Dhaka on the given local date, when the office closes. */
function officeClose(date: string): Date {
  return new Date(`${date}T17:00:00+06:00`);
}

/** Decide within 2 working days of submission (WF-04). */
export function reviewDue(submittedAt: Date, calendar: WorkingCalendar): Date {
  return officeClose(calendar.addWorkingDays(dhakaDate(submittedAt), 2));
}

/** Working days an approved owner has to collect (WF-04); supervisors can change it (Policies). */
export const PICKUP_WINDOW_DAYS = 3;

/** The pickup window closes `days` working days after approval, at the office's closing time. */
export function pickupWindowEnd(
  approvedAt: Date,
  calendar: WorkingCalendar,
  days = PICKUP_WINDOW_DAYS,
): Date {
  return officeClose(calendar.addWorkingDays(dhakaDate(approvedAt), days));
}

/** CC-15: three failed verifications in 7 days pause claim rights. */
export const FAILED_VERIFICATION_LIMIT = 3;
export const FAILED_VERIFICATION_WINDOW_DAYS = 7;
