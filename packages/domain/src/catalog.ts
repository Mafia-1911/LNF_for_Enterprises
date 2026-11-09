// Canonical category and colour codes. Codes are stable across tenants (matching and reports rely
// on them); each tenant's catalog tables decide which are enabled and how they are labelled.

export type CategoryDef = {
  code: string;
  label: string;
  /** ID cards, bank cards, cash, documents: photo hidden, numbers masked (CC-06, CC-07). */
  sensitive: boolean;
  /** Weapons, drugs, university keys, hazardous: desk only, never shelved (CC-12). */
  restricted: boolean;
};

export const CATEGORIES = [
  { code: 'phone', label: 'Phone', sensitive: false, restricted: false },
  { code: 'laptop', label: 'Laptop', sensitive: false, restricted: false },
  { code: 'tablet', label: 'Tablet', sensitive: false, restricted: false },
  { code: 'bag', label: 'Bag', sensitive: false, restricted: false },
  { code: 'wallet', label: 'Wallet', sensitive: false, restricted: false },
  { code: 'university_id', label: 'University ID', sensitive: true, restricted: false },
  { code: 'bank_card', label: 'Bank card', sensitive: true, restricted: false },
  { code: 'cash', label: 'Cash', sensitive: true, restricted: false },
  { code: 'documents', label: 'Documents', sensitive: true, restricted: false },
  { code: 'keys', label: 'Keys', sensitive: false, restricted: false },
  { code: 'bottle', label: 'Bottle', sensitive: false, restricted: false },
  { code: 'umbrella', label: 'Umbrella', sensitive: false, restricted: false },
  { code: 'charger', label: 'Charger', sensitive: false, restricted: false },
  { code: 'headphones', label: 'Headphones', sensitive: false, restricted: false },
  { code: 'clothing', label: 'Clothing', sensitive: false, restricted: false },
  { code: 'glasses', label: 'Glasses', sensitive: false, restricted: false },
  { code: 'watch', label: 'Watch', sensitive: false, restricted: false },
  { code: 'jewellery', label: 'Jewellery', sensitive: false, restricted: false },
  { code: 'books_notes', label: 'Books & notes', sensitive: false, restricted: false },
  { code: 'calculator', label: 'Calculator', sensitive: false, restricted: false },
  { code: 'other', label: 'Other', sensitive: false, restricted: false },
  { code: 'weapon', label: 'Weapon', sensitive: false, restricted: true },
  { code: 'drugs', label: 'Drugs', sensitive: false, restricted: true },
  { code: 'university_keys', label: 'University keys', sensitive: false, restricted: true },
  { code: 'hazardous', label: 'Hazardous item', sensitive: false, restricted: true },
] as const satisfies readonly CategoryDef[];

export type CategoryCode = (typeof CATEGORIES)[number]['code'];
export const CATEGORY_CODES = CATEGORIES.map((c) => c.code) as unknown as readonly [
  CategoryCode,
  ...CategoryCode[],
];

export type ColourDef = { code: string; label: string; swatch: string };

/** Colours from the "Main colour" chips (Figma 39:4459). "multi" is drawn as a rainbow. */
export const COLOURS = [
  { code: 'black', label: 'Black', swatch: '#1d1d1f' },
  { code: 'white', label: 'White', swatch: '#f8f8f8' },
  { code: 'grey', label: 'Grey', swatch: '#8a8d93' },
  { code: 'silver', label: 'Silver', swatch: '#c7cbd1' },
  { code: 'blue', label: 'Blue', swatch: '#2f6fd6' },
  { code: 'navy', label: 'Navy', swatch: '#1f2f5a' },
  { code: 'red', label: 'Red', swatch: '#d33a2c' },
  { code: 'green', label: 'Green', swatch: '#2f8f4e' },
  { code: 'yellow', label: 'Yellow', swatch: '#f2c94c' },
  { code: 'orange', label: 'Orange', swatch: '#f08a24' },
  { code: 'pink', label: 'Pink', swatch: '#ef8fb3' },
  { code: 'purple', label: 'Purple', swatch: '#7b4fc9' },
  { code: 'brown', label: 'Brown', swatch: '#7a5232' },
  { code: 'beige', label: 'Beige', swatch: '#d9c6a5' },
  { code: 'gold', label: 'Gold', swatch: '#c9a227' },
  { code: 'multi', label: 'Multi', swatch: 'multi' },
] as const satisfies readonly ColourDef[];

export type ColourCode = (typeof COLOURS)[number]['code'];
export const COLOUR_CODES = COLOURS.map((c) => c.code) as unknown as readonly [
  ColourCode,
  ...ColourCode[],
];

export function categoryByCode(code: string): (typeof CATEGORIES)[number] | undefined {
  return CATEGORIES.find((c) => c.code === code);
}

export function colourByCode(code: string): (typeof COLOURS)[number] | undefined {
  return COLOURS.find((c) => c.code === code);
}
