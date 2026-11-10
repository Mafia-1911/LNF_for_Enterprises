// Tick boxes for private details (authority interface: "tick boxes plus one optional short note").
// They depend on the category (FR-04) and later become claim questions (NF-03). Labels are from Figma.
import type { CategoryCode } from './catalog';

export type PrivateTick = { code: string; label: string };

const COMMON: PrivateTick[] = [
  { code: 'stickers_engraving', label: 'Stickers or engraving' },
  { code: 'marks', label: 'Scratches, dents or marks' },
];
const DEVICE: PrivateTick[] = [
  ...COMMON,
  { code: 'serial_recorded', label: 'Serial number recorded' },
  { code: 'in_case', label: 'In a sleeve or bag' },
];
const CONTAINER: PrivateTick[] = [
  { code: 'contents_listed', label: 'Contents listed' },
  { code: 'name_tag', label: 'Keychain or name tag' },
  { code: 'marks', label: 'Scratches, dents or marks' },
];
const CARD: PrivateTick[] = [
  { code: 'number_recorded', label: 'Number recorded (only the last 4 are shown)' },
  { code: 'name_on_it', label: 'Name printed on it' },
];

const BY_CATEGORY: Partial<Record<CategoryCode, PrivateTick[]>> = {
  phone: [...DEVICE, { code: 'lock_screen', label: 'Lock screen picture noted' }],
  laptop: DEVICE,
  tablet: DEVICE,
  headphones: DEVICE,
  calculator: DEVICE,
  watch: DEVICE,
  charger: COMMON,
  bag: CONTAINER,
  wallet: [...CONTAINER, { code: 'cards_inside', label: 'Cards inside (not listed publicly)' }],
  cash: [{ code: 'amount_counted', label: 'Amount counted with a witness' }],
  university_id: CARD,
  bank_card: CARD,
  documents: [...CARD, { code: 'contents_listed', label: 'Contents listed' }],
  keys: [
    { code: 'key_count', label: 'Number of keys noted' },
    { code: 'name_tag', label: 'Keychain or name tag' },
  ],
  books_notes: [
    { code: 'name_inside', label: 'Name or notes written inside' },
    { code: 'marks', label: 'Scratches, dents or marks' },
  ],
  clothing: [
    { code: 'size_label', label: 'Size or brand label noted' },
    { code: 'marks', label: 'Stains, tears or marks' },
  ],
};

/** The tick boxes to show for a category (never empty). */
export function privateTicksFor(category: CategoryCode): readonly PrivateTick[] {
  return BY_CATEGORY[category] ?? COMMON;
}

/** True when every code is one of this category's ticks. */
export function validTicks(category: CategoryCode, codes: readonly string[]): boolean {
  const allowed = new Set(privateTicksFor(category).map((t) => t.code));
  return codes.every((c) => allowed.has(c));
}
