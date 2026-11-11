import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createWorkingCalendar } from './calendar';
import {
  claimQuestions,
  CLAIM_QUESTION,
  isHighValue,
  isPickupCode,
  pickupWindowEnd,
  reviewDue,
} from './claims';
import { CATEGORIES, CATEGORY_CODES } from './catalog';
import { privateTicksFor } from './private-details';

describe('claimQuestions', () => {
  it('asks about each ticked detail, up to three', () => {
    expect(
      claimQuestions(['stickers_engraving', 'serial_recorded', 'in_case']).map((q) => q.question),
    ).toEqual([
      'Are there stickers or engraving? Describe them.',
      'What are the last 4 characters of the serial number?',
      'Was it in a sleeve or bag? Describe it.',
    ]);
    expect(
      claimQuestions(['marks', 'in_case', 'serial_recorded', 'stickers_engraving']),
    ).toHaveLength(3);
  });

  it('always asks at least two questions, topping up with general ones', () => {
    expect(claimQuestions([]).map((q) => q.key)).toEqual(['general_1', 'general_2']);
    expect(claimQuestions(['marks']).map((q) => q.key)).toEqual(['marks', 'general_1']);
    expect(claimQuestions(['unknown_tick']).map((q) => q.key)).toEqual(['general_1', 'general_2']);
  });

  it('has a question for every tick any category can record', () => {
    for (const c of CATEGORIES)
      for (const t of privateTicksFor(c.code)) expect(CLAIM_QUESTION[t.code]).toBeDefined();
  });

  it('asks 2 or 3 questions with unique keys, whatever was ticked (property)', () => {
    fc.assert(
      fc.property(fc.subarray(Object.keys(CLAIM_QUESTION)), (ticks) => {
        const qs = claimQuestions(ticks);
        return qs.length >= 2 && qs.length <= 3 && new Set(qs.map((q) => q.key)).size === qs.length;
      }),
    );
  });
});

describe('isHighValue', () => {
  it('flags devices, cash and jewellery (CC-07, CC-08)', () => {
    expect(isHighValue('phone')).toBe(true);
    expect(isHighValue('cash')).toBe(true);
    expect(isHighValue('umbrella')).toBe(false);
    expect(isHighValue('spaceship')).toBe(false);
    expect(CATEGORY_CODES.filter(isHighValue).sort()).toEqual([
      'bank_card',
      'cash',
      'jewellery',
      'laptop',
      'phone',
      'tablet',
      'watch',
    ]);
  });
});

describe('isPickupCode', () => {
  it('accepts exactly six digits', () => {
    expect(isPickupCode('482913')).toBe(true);
    expect(isPickupCode('48291')).toBe(false);
    expect(isPickupCode('4829134')).toBe(false);
    expect(isPickupCode('48a913')).toBe(false);
  });
});

describe('deadlines in working days', () => {
  const calendar = createWorkingCalendar(['2026-11-12']);
  it('gives 2 working days to decide and 3 to collect, skipping Fri, Sat and holidays', () => {
    // Sunday 8 Nov 2026, 16:39 Dhaka.
    const sunday = new Date('2026-11-08T10:39:00.000Z');
    expect(reviewDue(sunday, calendar).toISOString()).toBe('2026-11-10T11:00:00.000Z');
    // 9 Nov (Mon) +3 working days, skipping the 12th: 10, 11, 15 Nov.
    expect(pickupWindowEnd(new Date('2026-11-09T05:00:00.000Z'), calendar).toISOString()).toBe(
      '2026-11-15T11:00:00.000Z',
    );
  });

  it('starts counting from the next working day when approved on a weekend', () => {
    // Friday 13 Nov: next working day is Sunday 15 Nov, +3 → 18 Nov.
    expect(pickupWindowEnd(new Date('2026-11-13T05:00:00.000Z'), calendar).toISOString()).toBe(
      '2026-11-18T11:00:00.000Z',
    );
  });
});

describe('question wording', () => {
  it('words every question plainly, ending in a full stop or question mark', () => {
    for (const q of Object.values(CLAIM_QUESTION)) expect(q).toMatch(/^[A-Z].{8,}[.?]$/);
    expect(claimQuestions([]).map((q) => q.question)).toEqual([
      'Describe something about it that is not in the public description.',
      'Where and when did you last have it?',
    ]);
    expect(CLAIM_QUESTION['contents_listed']).toBe('What was inside?');
    expect(CLAIM_QUESTION['amount_counted']).toBe('How much money was there, exactly?');
    expect(CLAIM_QUESTION['number_recorded']).toBe(
      'What are the last 4 digits of the number on it?',
    );
    expect(CLAIM_QUESTION['lock_screen']).toBe('What is on the lock screen?');
    expect(CLAIM_QUESTION['name_tag']).toBe('Describe the keychain or name tag.');
    expect(CLAIM_QUESTION['marks']).toBe('Describe any scratches, dents or marks.');
    expect(CLAIM_QUESTION['cards_inside']).toBe('Which cards were inside?');
    expect(CLAIM_QUESTION['name_on_it']).toBe('Whose name is printed on it?');
    expect(CLAIM_QUESTION['key_count']).toBe(
      'How many keys are there, and what else is on the ring?',
    );
    expect(CLAIM_QUESTION['name_inside']).toBe('What is written inside?');
    expect(CLAIM_QUESTION['size_label']).toBe('What size or brand label does it have?');
  });
});
