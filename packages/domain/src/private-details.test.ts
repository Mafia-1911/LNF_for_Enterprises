import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CATEGORY_CODES } from './catalog';
import { privateTicksFor, validTicks } from './private-details';

describe('privateTicksFor', () => {
  it('gives devices a serial number tick and bags a contents tick (FR-04)', () => {
    expect(privateTicksFor('laptop').map((t) => t.code)).toContain('serial_recorded');
    expect(privateTicksFor('phone').map((t) => t.code)).toContain('lock_screen');
    expect(privateTicksFor('bag').map((t) => t.code)).toEqual([
      'contents_listed',
      'name_tag',
      'marks',
    ]);
    expect(privateTicksFor('cash').map((t) => t.code)).toEqual(['amount_counted']);
  });

  it('falls back to the common ticks for categories without their own list', () => {
    expect(privateTicksFor('umbrella').map((t) => t.code)).toEqual(['stickers_engraving', 'marks']);
  });

  it('never returns an empty list, and codes are unique per category (property)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CATEGORY_CODES), (category) => {
        const codes = privateTicksFor(category).map((t) => t.code);
        return codes.length > 0 && new Set(codes).size === codes.length;
      }),
    );
  });
});

describe('validTicks', () => {
  it("accepts the category's own ticks and nothing else", () => {
    expect(validTicks('laptop', ['serial_recorded', 'marks'])).toBe(true);
    expect(validTicks('laptop', [])).toBe(true);
    expect(validTicks('laptop', ['amount_counted'])).toBe(false);
    expect(validTicks('cash', ['amount_counted'])).toBe(true);
  });
});

describe('tick labels', () => {
  it('gives every tick a readable label, unique within its category', () => {
    for (const category of CATEGORY_CODES) {
      const labels = privateTicksFor(category).map((t) => t.label);
      expect(labels.every((l) => l.length >= 8 && /^[A-Z]/.test(l))).toBe(true);
      expect(new Set(labels).size).toBe(labels.length);
    }
    expect(privateTicksFor('laptop').map((t) => t.label)).toEqual([
      'Stickers or engraving',
      'Scratches, dents or marks',
      'Serial number recorded',
      'In a sleeve or bag',
    ]);
    expect(privateTicksFor('clothing').map((t) => t.label)).toEqual([
      'Size or brand label noted',
      'Stains, tears or marks',
    ]);
    expect(privateTicksFor('bank_card')[0]?.label).toBe(
      'Number recorded (only the last 4 are shown)',
    );
    expect(privateTicksFor('wallet').at(-1)?.label).toBe('Cards inside (not listed publicly)');
    expect(privateTicksFor('cash')[0]?.label).toBe('Amount counted with a witness');
    expect(privateTicksFor('keys').map((t) => t.label)).toEqual([
      'Number of keys noted',
      'Keychain or name tag',
    ]);
    expect(privateTicksFor('books_notes')[0]?.label).toBe('Name or notes written inside');
    expect(privateTicksFor('documents').at(-1)?.label).toBe('Contents listed');
    expect(privateTicksFor('phone').at(-1)?.label).toBe('Lock screen picture noted');
    expect(privateTicksFor('university_id')[1]?.label).toBe('Name printed on it');
  });
});
