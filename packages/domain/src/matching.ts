// Rule-based match score between a lost report and a found item (FR-07). Category must match;
// colour, brand, place, time and shared words add points. Every point comes with a plain reason
// ("Same colour") so people can see why something was suggested. Pure: no I/O, no clock.

export type MatchSide = {
  category: string;
  colour: string | null;
  brand: string | null;
  buildingCode: string | null;
  floorId: string | null;
  zoneId: string | null;
  /** Free text that may share words: short name, model, public description. */
  words: string | null;
};

export type LostSide = MatchSide & { timeFrom: Date; timeTo: Date };
export type FoundSide = MatchSide & { foundAt: Date };

export type MatchReason =
  | 'same_colour'
  | 'same_brand'
  | 'same_building'
  | 'same_floor'
  | 'same_zone'
  | 'found_soon_after'
  | 'found_within_two_weeks'
  | 'shared_words';

export const MATCH_REASON_LABEL: Record<MatchReason, string> = {
  same_colour: 'Same colour',
  same_brand: 'Same brand',
  same_building: 'Same building',
  same_floor: 'Same floor',
  same_zone: 'Same room or zone',
  found_soon_after: 'Found soon after it was lost',
  found_within_two_weeks: 'Found within two weeks',
  shared_words: 'Similar description',
};

export type MatchScore = { score: number; reasons: MatchReason[] };

const POINTS: Record<MatchReason, number> = {
  same_colour: 3,
  same_brand: 3,
  same_building: 2,
  same_floor: 1,
  same_zone: 2,
  found_soon_after: 2,
  found_within_two_weeks: 1,
  shared_words: 2,
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A found item logged more than this long before the loss started can't be the lost item. */
const EARLY_SLACK_MS = 2 * HOUR;
const SOON_AFTER_MS = 3 * DAY;
const TWO_WEEKS_MS = 14 * DAY;

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'with',
  'of',
  'in',
  'on',
  'my',
  'it',
  'is',
  'to',
  'for',
  'at',
  'from',
  'black',
  'white',
  'grey',
  'gray',
  'blue',
  'red',
  'green',
]);

/** Lower-case words of 3+ letters, minus stop words and colour names (colour is scored separately). */
export function significantWords(text: string | null): Set<string> {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w)),
  );
}

function same(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Score one pair, or null when they can't be the same item. */
export function scoreMatch(lost: LostSide, found: FoundSide): MatchScore | null {
  if (lost.category !== found.category) return null;
  const found_ = found.foundAt.getTime();
  if (found_ < lost.timeFrom.getTime() - EARLY_SLACK_MS) return null;

  const reasons: MatchReason[] = [];
  if (same(lost.colour, found.colour)) reasons.push('same_colour');
  if (same(lost.brand, found.brand)) reasons.push('same_brand');
  if (same(lost.buildingCode, found.buildingCode)) {
    reasons.push('same_building');
    if (same(lost.floorId, found.floorId)) reasons.push('same_floor');
    if (same(lost.zoneId, found.zoneId)) reasons.push('same_zone');
  }
  const after = found_ - lost.timeTo.getTime();
  if (after <= SOON_AFTER_MS) reasons.push('found_soon_after');
  else if (after <= TWO_WEEKS_MS) reasons.push('found_within_two_weeks');

  const lostWords = significantWords(lost.words);
  for (const w of significantWords(found.words)) {
    if (lostWords.has(w)) {
      reasons.push('shared_words');
      break;
    }
  }
  return { score: reasons.reduce((sum, r) => sum + POINTS[r], 0), reasons };
}

/** The best `limit` candidates (score ≥ 1), highest score first; ties keep the input order. */
export function topMatches<T>(
  candidates: readonly T[],
  score: (candidate: T) => MatchScore | null,
  limit = 5,
): { candidate: T; match: MatchScore }[] {
  return candidates
    .map((candidate, index) => ({ candidate, index, match: score(candidate) }))
    .filter(
      (r): r is { candidate: T; index: number; match: MatchScore } =>
        r.match !== null && r.match.score >= 1,
    )
    .sort((a, b) => b.match.score - a.match.score || a.index - b.index)
    .slice(0, limit)
    .map(({ candidate, match }) => ({ candidate, match }));
}
