import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CHECK_ALPHABET,
  checkLetter,
  formatId,
  looksLikeId,
  normaliseId,
  parseId,
  RECORD_TYPES,
  type RecordId,
} from './ids';

const recordId = fc.record<RecordId>({
  type: fc.constantFrom(...RECORD_TYPES),
  year: fc.integer({ min: 0, max: 99 }),
  month: fc.integer({ min: 1, max: 12 }),
  seq: fc.integer({ min: 1, max: 9999 }),
});

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

describe('formatId', () => {
  it('formats type, Dhaka year-month and a 4-digit sequence with a check letter', () => {
    expect(formatId({ type: 'LST', year: 26, month: 11, seq: 219 })).toMatch(
      /^LST-2611-0219[A-Z]$/,
    );
    expect(formatId({ type: 'FND', year: 26, month: 1, seq: 42 })).toMatch(/^FND-2601-0042[A-Z]$/);
    expect(formatId({ type: 'DSP', year: 5, month: 12, seq: 9999 })).toMatch(
      /^DSP-0512-9999[A-Z]$/,
    );
  });

  it('computes the documented checksum', () => {
    // LST = type index 2; digits 2,6,1,1,0,2,1,9 with weights 1..9:
    // 2*1 + 2*2 + 6*3 + 1*4 + 1*5 + 0*6 + 2*7 + 1*8 + 9*9 = 136; 136 mod 23 = 21 → alphabet[21] = 'Y'
    expect(checkLetter('LST', '26110219')).toBe('Y');
    expect(formatId({ type: 'LST', year: 26, month: 11, seq: 219 })).toBe('LST-2611-0219Y');
  });

  it.each([
    { type: 'XYZ', year: 26, month: 11, seq: 1 },
    { type: 'LST', year: -1, month: 11, seq: 1 },
    { type: 'LST', year: 100, month: 11, seq: 1 },
    { type: 'LST', year: 26, month: 0, seq: 1 },
    { type: 'LST', year: 26, month: 13, seq: 1 },
    { type: 'LST', year: 26, month: 11, seq: 0 },
    { type: 'LST', year: 26, month: 11, seq: 10000 },
    { type: 'LST', year: 26.5, month: 11, seq: 1 },
    { type: 'LST', year: 26, month: 1.5, seq: 1 },
    { type: 'LST', year: 26, month: 11, seq: 1.5 },
  ])('rejects out-of-range parts %o', (id) => {
    expect(() => formatId(id as RecordId)).toThrow(RangeError);
  });

  it('never uses I, O or U as a check letter', () => {
    expect(CHECK_ALPHABET).toHaveLength(23);
    expect(CHECK_ALPHABET).not.toMatch(/[IOU]/);
  });
});

describe('parseId and normaliseId', () => {
  it('round-trips: normalise(format(x)) == format(x) and parse(format(x)) == x', () => {
    fc.assert(
      fc.property(recordId, (id) => {
        const formatted = formatId(id);
        expect(normaliseId(formatted)).toBe(formatted);
        expect(parseId(formatted)).toEqual(id);
      }),
    );
  });

  it('accepts any letter case and missing dashes or extra spaces', () => {
    fc.assert(
      fc.property(recordId, fc.boolean(), fc.boolean(), (id, lower, dashless) => {
        let typed = formatId(id);
        if (lower) typed = typed.toLowerCase();
        if (dashless) typed = typed.replaceAll('-', '');
        expect(normaliseId(` ${typed} `)).toBe(formatId(id));
      }),
    );
  });

  it('detects every single changed character', () => {
    fc.assert(
      fc.property(recordId, fc.nat(), fc.constantFrom(...ALNUM), (id, rawPos, replacement) => {
        const formatted = formatId(id);
        const pos = rawPos % formatted.length;
        fc.pre(formatted.charAt(pos) !== replacement);
        const mutated = formatted.slice(0, pos) + replacement + formatted.slice(pos + 1);
        expect(parseId(mutated)).toBeNull();
        expect(normaliseId(mutated)).toBeNull();
      }),
      { numRuns: 2000 },
    );
  });

  it('detects swapped neighbouring digits', () => {
    fc.assert(
      fc.property(recordId, fc.integer({ min: 0, max: 6 }), (id, i) => {
        const formatted = formatId(id);
        const digits = formatted.replaceAll('-', '').slice(3, 11);
        fc.pre(digits.charAt(i) !== digits.charAt(i + 1));
        const swapped =
          digits.slice(0, i) + digits.charAt(i + 1) + digits.charAt(i) + digits.slice(i + 2);
        expect(parseId(`${id.type}${swapped}${formatted.slice(-1)}`)).toBeNull();
      }),
    );
  });

  it.each([
    '',
    'LST',
    'LST-2611-0219',
    'LST-2611-219Y',
    'LST-26110-0219Y',
    'ABC-2611-0219Y',
    'LST-2600-0219Y',
    'LST-2613-0219Y',
    'LST-2611-0000A',
  ])('rejects %j', (input) => {
    expect(parseId(input)).toBeNull();
  });
});

describe('looksLikeId', () => {
  it.each(['LST-2611-0219Y', 'lst26110219y', 'FND 2611 0042K'])(
    'treats %j as an ID attempt',
    (s) => {
      expect(looksLikeId(s)).toBe(true);
    },
  );
  it.each(['black backpack', 'LST', '2611-0219', 'LST-2611-0219'])(
    'treats %j as free text',
    (s) => {
      expect(looksLikeId(s)).toBe(false);
    },
  );
});
