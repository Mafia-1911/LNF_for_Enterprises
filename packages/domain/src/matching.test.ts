import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CATEGORY_CODES } from './catalog';
import {
  MATCH_REASON_LABEL,
  scoreMatch,
  significantWords,
  topMatches,
  type FoundSide,
  type LostSide,
} from './matching';

const T0 = new Date('2026-11-08T08:00:00.000Z');
const hours = (h: number) => new Date(T0.getTime() + h * 3_600_000);

const lost: LostSide = {
  category: 'bag',
  colour: 'black',
  brand: 'Herschel',
  buildingCode: 'LIB',
  floorId: 'f-2',
  zoneId: 'z-reading',
  words: 'Black backpack with a yellow logo',
  timeFrom: T0,
  timeTo: hours(3),
};
const found: FoundSide = {
  category: 'bag',
  colour: 'black',
  brand: 'herschel ',
  buildingCode: 'LIB',
  floorId: 'f-2',
  zoneId: 'z-reading',
  words: 'Backpack, yellow logo on the front',
  foundAt: hours(4),
};

describe('scoreMatch', () => {
  it('scores every matching attribute with a plain reason', () => {
    const m = scoreMatch(lost, found);
    expect(m?.reasons).toEqual([
      'same_colour',
      'same_brand',
      'same_building',
      'same_floor',
      'same_zone',
      'found_soon_after',
      'shared_words',
    ]);
    expect(m?.score).toBe(3 + 3 + 2 + 1 + 2 + 2 + 2);
    expect(m?.reasons.map((r) => MATCH_REASON_LABEL[r])).toContain('Same colour');
  });

  it('requires the same category', () => {
    expect(scoreMatch(lost, { ...found, category: 'wallet' })).toBeNull();
  });

  it('rejects an item found well before the loss started', () => {
    expect(scoreMatch(lost, { ...found, foundAt: hours(-3) })).toBeNull();
    expect(scoreMatch(lost, { ...found, foundAt: hours(-1) })).not.toBeNull();
  });

  it('gives fewer time points the later the item was found', () => {
    expect(scoreMatch(lost, { ...found, foundAt: hours(3 + 24 * 10) })?.reasons).toContain(
      'found_within_two_weeks',
    );
    const late = scoreMatch(lost, { ...found, foundAt: hours(3 + 24 * 20) });
    expect(late?.reasons).not.toContain('found_soon_after');
    expect(late?.reasons).not.toContain('found_within_two_weeks');
  });

  it('only counts floor and zone inside the same building', () => {
    const m = scoreMatch(lost, { ...found, buildingCode: 'NAC' });
    expect(m?.reasons).not.toContain('same_building');
    expect(m?.reasons).not.toContain('same_zone');
    expect(m?.reasons).not.toContain('same_floor');
  });

  it('ignores missing values instead of counting them as equal', () => {
    const blank = {
      colour: null,
      brand: null,
      buildingCode: null,
      floorId: null,
      zoneId: null,
      words: null,
    };
    expect(scoreMatch({ ...lost, ...blank }, { ...found, ...blank })?.reasons).toEqual([
      'found_soon_after',
    ]);
  });

  it('never scores a different category, whatever else matches (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CATEGORY_CODES),
        fc.constantFrom(...CATEGORY_CODES),
        (a, b) => {
          fc.pre(a !== b);
          return scoreMatch({ ...lost, category: a }, { ...found, category: b }) === null;
        },
      ),
    );
  });

  it('never gives a negative score, whenever the item was found (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -2, max: 24 * 30 }), (h) => {
        const m = scoreMatch(lost, { ...found, foundAt: hours(h) });
        return m === null || m.score >= 0;
      }),
    );
  });
});

describe('significantWords', () => {
  it('drops short words, stop words and colour names', () => {
    expect([...significantWords('My black Herschel bag, with a yellow logo')]).toEqual([
      'herschel',
      'bag',
      'yellow',
      'logo',
    ]);
    expect(significantWords(null).size).toBe(0);
  });
});

describe('topMatches', () => {
  it('keeps the best five with a score of at least 1, highest first, stable on ties', () => {
    const scores = [0, 5, 3, 5, 1, 9, 2, 7];
    const result = topMatches(
      scores.map((s, i) => ({ s, i })),
      (c) => (c.s === 0 ? null : { score: c.s, reasons: [] }),
    );
    expect(result.map((r) => r.candidate.i)).toEqual([5, 7, 1, 3, 2]);
  });

  it('drops candidates that scored zero', () => {
    expect(topMatches([1], () => ({ score: 0, reasons: [] }))).toEqual([]);
  });
});
