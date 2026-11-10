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
