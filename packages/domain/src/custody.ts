// Custody rules: which shelf a category goes on, which bin to suggest, and masking of card numbers.
import { CATEGORIES, type CategoryCode } from './catalog';

/** Shelves at the Lost & Found office (Figma bin codes): small valuables, accessories, bags, clothing. */
export const SHELVES = ['S', 'A', 'B', 'C'] as const;
export type Shelf = (typeof SHELVES)[number];

const SHELF_OF: Partial<Record<CategoryCode, Shelf>> = {
  phone: 'S',
  laptop: 'S',
  tablet: 'S',
  wallet: 'S',
  university_id: 'S',
  bank_card: 'S',
  cash: 'S',
  documents: 'S',
  keys: 'S',
  watch: 'S',
  jewellery: 'S',
  glasses: 'A',
  bottle: 'A',
  charger: 'A',
  headphones: 'A',
  calculator: 'A',
  other: 'A',
  bag: 'B',
  umbrella: 'B',
  books_notes: 'B',
  clothing: 'C',
};

/** The shelf for a category, or null for restricted items, which are never shelved (CC-12). */
export function shelfFor(category: CategoryCode): Shelf | null {
  const def = CATEGORIES.find((c) => c.code === category);
  if (!def || def.restricted) return null;
  return SHELF_OF[category] ?? 'A';
}

/** "S-06": shelf letter, dash, two digits. */
export function binCode(shelf: Shelf, n: number): string {
  return `${shelf}-${String(n).padStart(2, '0')}`;
}

export function shelfOfBin(code: string): Shelf | null {
  const letter = code.charAt(0);
  return (SHELVES as readonly string[]).includes(letter) && /^[A-Z]-\d{2}$/.test(code)
    ? (letter as Shelf)
    : null;
}

/** The least-full bin on the category's shelf (ties: lowest code). Null if none fits. */
export function suggestBin(
  category: CategoryCode,
  bins: readonly { code: string; itemCount: number }[],
): string | null {
  const shelf = shelfFor(category);
  if (!shelf) return null;
  const onShelf = bins.filter((b) => shelfOfBin(b.code) === shelf);
  if (onShelf.length === 0) return null;
  const best = [...onShelf].sort(
    (a, b) => a.itemCount - b.itemCount || a.code.localeCompare(b.code),
  )[0];
  return best?.code ?? null;
}

/** "••••1234": only the last 4 characters of an ID or card number are ever shown (CC-06). */
export function maskLast4(value: string): string {
  const compact = value.replace(/\s+/g, '');
  if (compact.length <= 4) return '••••';
  return `••••${compact.slice(-4)}`;
}
