// Icons. The Figma file uses Lucide icons (matched pixel-for-pixel, docs/design/README.md), so the
// app uses lucide-react. Category icons are mapped by catalog code.
import {
  Backpack,
  Banknote,
  BookOpen,
  Cable,
  Calculator,
  CreditCard,
  FileText,
  Gem,
  GlassWater,
  Glasses,
  Headphones,
  IdCard,
  KeyRound,
  KeySquare,
  Laptop,
  Package,
  Pill,
  Shirt,
  Smartphone,
  Sword,
  Tablet,
  TriangleAlert,
  Umbrella,
  Wallet,
  Watch,
  type LucideIcon,
} from 'lucide-react';

export type { LucideIcon } from 'lucide-react';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  phone: Smartphone,
  laptop: Laptop,
  tablet: Tablet,
  bag: Backpack,
  wallet: Wallet,
  university_id: IdCard,
  bank_card: CreditCard,
  cash: Banknote,
  documents: FileText,
  keys: KeyRound,
  bottle: GlassWater,
  umbrella: Umbrella,
  charger: Cable,
  headphones: Headphones,
  clothing: Shirt,
  glasses: Glasses,
  watch: Watch,
  jewellery: Gem,
  books_notes: BookOpen,
  calculator: Calculator,
  other: Package,
  weapon: Sword,
  drugs: Pill,
  university_keys: KeySquare,
  hazardous: TriangleAlert,
};

export function categoryIcon(code: string): LucideIcon {
  return CATEGORY_ICONS[code] ?? Package;
}
