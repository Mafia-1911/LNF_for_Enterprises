import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  CATEGORY_CODES,
  categoryByCode,
  COLOUR_CODES,
  colourByCode,
  COLOURS,
} from './catalog';
import { isRole, isStaffRole, ROLES } from './roles';

describe('catalog', () => {
  it('has the 21 student categories from Figma plus 4 restricted desk-only ones', () => {
    expect(CATEGORIES.filter((c) => !c.restricted)).toHaveLength(21);
    expect(CATEGORIES.filter((c) => c.restricted).map((c) => c.code)).toEqual([
      'weapon',
      'drugs',
      'university_keys',
      'hazardous',
    ]);
  });

  it('marks ID cards, bank cards, cash and documents as sensitive (CC-06, CC-07)', () => {
    expect(CATEGORIES.filter((c) => c.sensitive).map((c) => c.code)).toEqual([
      'university_id',
      'bank_card',
      'cash',
      'documents',
    ]);
  });

  it('has unique codes', () => {
    expect(new Set(CATEGORY_CODES).size).toBe(CATEGORIES.length);
    expect(new Set(COLOUR_CODES).size).toBe(COLOURS.length);
  });

  it('looks codes up', () => {
    expect(categoryByCode('glasses')?.label).toBe('Glasses');
    expect(categoryByCode('spaceship')).toBeUndefined();
    expect(colourByCode('grey')?.swatch).toBe('#8a8d93');
    expect(colourByCode('teal')).toBeUndefined();
  });

  it('has the 16 colours from Figma with hex swatches (multi is drawn as a rainbow)', () => {
    expect(COLOURS).toHaveLength(16);
    for (const c of COLOURS)
      expect(c.swatch).toMatch(c.code === 'multi' ? /^multi$/ : /^#[0-9a-f]{6}$/);
  });
});

describe('roles', () => {
  it('has the five SRS roles', () => {
    expect(ROLES).toEqual(['student', 'visitor', 'desk_officer', 'supervisor', 'it_admin']);
  });

  it('knows staff roles sign in with SSO only', () => {
    expect(ROLES.filter(isStaffRole)).toEqual(['desk_officer', 'supervisor', 'it_admin']);
  });

  it('checks role names', () => {
    expect(isRole('supervisor')).toBe(true);
    expect(isRole('admin')).toBe(false);
  });
});
