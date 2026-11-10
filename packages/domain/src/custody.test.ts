import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, CATEGORY_CODES } from './catalog';
import { binCode, maskLast4, shelfFor, shelfOfBin, suggestBin } from './custody';

describe('shelfFor', () => {
  it('puts small valuables on S, clothing on C, bags on B', () => {
    expect(shelfFor('laptop')).toBe('S');
    expect(shelfFor('university_id')).toBe('S');
    expect(shelfFor('clothing')).toBe('C');
    expect(shelfFor('umbrella')).toBe('B');
    expect(shelfFor('charger')).toBe('A');
  });

  it('never shelves restricted items (CC-12) and shelves everything else', () => {
    for (const c of CATEGORIES) {
      if (c.restricted) expect(shelfFor(c.code)).toBeNull();
      else expect(shelfFor(c.code)).not.toBeNull();
    }
  });
});

describe('bin codes', () => {
  it('formats and reads "S-06"', () => {
    expect(binCode('S', 6)).toBe('S-06');
    expect(binCode('C', 12)).toBe('C-12');
    expect(shelfOfBin('S-06')).toBe('S');
    expect(shelfOfBin('A1')).toBeNull();
    expect(shelfOfBin('Z-01')).toBeNull();
    expect(shelfOfBin('S-6')).toBeNull();
  });
});

describe('suggestBin', () => {
  const bins = [
    { code: 'S-01', itemCount: 4 },
    { code: 'S-02', itemCount: 1 },
    { code: 'S-03', itemCount: 1 },
    { code: 'C-01', itemCount: 0 },
  ];

  it('picks the least-full bin on the right shelf, lowest code on a tie', () => {
    expect(suggestBin('phone', bins)).toBe('S-02');
    expect(suggestBin('clothing', bins)).toBe('C-01');
  });

  it('returns null when the shelf has no bins or the item is restricted', () => {
    expect(suggestBin('bag', bins)).toBeNull();
    expect(suggestBin('weapon', bins)).toBeNull();
  });

  it('always suggests a bin on the category shelf when one exists (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CATEGORY_CODES),
        fc.array(fc.nat(20), { minLength: 1, maxLength: 12 }),
        (category, counts) => {
          const shelf = shelfFor(category);
          const all = ['S', 'A', 'B', 'C'].flatMap((s) =>
            counts.map((n, i) => ({
              code: `${s}-${String(i + 1).padStart(2, '0')}`,
              itemCount: n,
            })),
          );
          const pick = suggestBin(category, all);
          return shelf === null ? pick === null : pick !== null && pick.startsWith(`${shelf}-`);
        },
      ),
    );
  });
});

describe('maskLast4', () => {
  it('shows only the last four characters', () => {
    expect(maskLast4('2112345 042')).toBe('••••5042');
    expect(maskLast4('1234')).toBe('••••');
    expect(maskLast4('')).toBe('••••');
  });

  it('never reveals more than four characters (property)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 30 }), (s) => {
        const masked = maskLast4(s);
        return masked.startsWith('••••') && masked.length <= 8;
      }),
    );
  });
});
